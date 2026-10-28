import type { Server, IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
import { eq } from "drizzle-orm";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { WebSocket, WebSocketServer } from "ws";
import { browserProfilesTable, db } from "@workspace/db";
import {
  getAllowedWebUrl,
  guardPageRequests,
  resolvePublicIPv4,
  startSafeProxy,
} from "../routes/browser";
import { acquireBrowserSlot, releaseBrowserSlot } from "./browser-limits";
import { deviceIdFromToken, deviceTokenFromCookieHeader, hasActivityAcceptance, onActivityRevoked, recordVisit } from "./visitor-activity";
import { logger } from "./logger";
import { fitPageWidth } from "./page-layout";

const WIDTH = 1280;
const HEIGHT = 800;
const FRAME_INTERVAL_MS = 100;
const MAX_FRAME_BACKLOG_BYTES = 256 * 1024;
const PROFILE_SAVE_DEBOUNCE_MS = 1_200;
const PROFILE_SAVE_INTERVAL_MS = 10_000;
const IDLE_TIMEOUT_MS = 60 * 60 * 1000;
const allowedKeys = new Set([
  "Alt",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "Backspace",
  "Control",
  "Delete",
  "End",
  "Enter",
  "Escape",
  "Home",
  "Meta",
  "PageDown",
  "PageUp",
  "Shift",
  "Space",
  "Tab",
]);

type BrowserMessage =
  | { type: "tracking"; token: string | null }
  | { type: "open"; url: string; profileToken: string }
  | { type: "navigate"; url: string }
  | { type: "clearProfile"; profileToken: string }
  | { type: "back" | "forward" | "reload" }
  | { type: "fitWidth"; enabled: boolean }
  | { type: "scrollTo"; ratio: number }
  | {
      type: "pointer";
      phase: "down" | "move" | "up";
      x: number;
      y: number;
      button: number;
    }
  | {
      type: "scroll";
      x: number;
      y: number;
      deltaX: number;
      deltaY: number;
    }
  | { type: "text"; text: string }
  | { type: "key"; key: string };

type SafeProxy = Awaited<ReturnType<typeof startSafeProxy>>;

type BrowserSession = {
  sessionId: string;
  socket: WebSocket;
  trackingToken: string | null;
  browser: Browser | null;
  context: BrowserContext | null;
  page: Page | null;
  proxy: SafeProxy | null;
  frameTimer: NodeJS.Timeout | null;
  profileTimer: NodeJS.Timeout | null;
  profileSaveTimer: NodeJS.Timeout | null;
  lastActivity: number;
  responseStatus: number;
  profileKey: string | null;
  persistedStateJson: string | null;
  profileCleared: boolean;
  profileOperation: Promise<void>;
  capturingFrame: boolean;
  closed: boolean;
  endingReason: string | null;
  endingDetails: Record<string, unknown>;
  queue: Promise<void>;
  pendingInput: BrowserMessage | null;
  initializePromise: Promise<void> | null;
  cleanupPromise: Promise<void> | null;
  observedPages: WeakSet<Page>;
  fitToWidth: boolean;
};

type SavedStorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

function secretKey(purpose: string): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is required to protect browser profiles.");
  }
  return createHmac("sha256", secret)
    .update(`chromium-runner:${purpose}:v1`)
    .digest();
}

function deriveProfileKey(profileToken: string): string {
  return createHmac("sha256", secretKey("profile-lookup"))
    .update(profileToken)
    .digest("hex");
}

function encryptProfileState(profileKey: string, stateJson: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey("profile-encryption"), iv);
  cipher.setAAD(Buffer.from(profileKey, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(stateJson, "utf8"),
    cipher.final(),
  ]);
  return JSON.stringify({
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  });
}

function decryptProfileState(
  profileKey: string,
  encryptedState: string,
): SavedStorageState {
  const envelope: unknown = JSON.parse(encryptedState);
  if (!envelope || typeof envelope !== "object") {
    throw new Error("Saved browser profile is invalid.");
  }
  const record = envelope as Record<string, unknown>;
  if (
    record.version !== 1 ||
    typeof record.iv !== "string" ||
    typeof record.tag !== "string" ||
    typeof record.ciphertext !== "string"
  ) {
    throw new Error("Saved browser profile is invalid.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    secretKey("profile-encryption"),
    Buffer.from(record.iv, "base64"),
  );
  decipher.setAAD(Buffer.from(profileKey, "utf8"));
  decipher.setAuthTag(Buffer.from(record.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  const state: unknown = JSON.parse(plaintext);
  if (
    !state ||
    typeof state !== "object" ||
    !Array.isArray((state as Record<string, unknown>).cookies) ||
    !Array.isArray((state as Record<string, unknown>).origins)
  ) {
    throw new Error("Saved browser profile is invalid.");
  }
  return state as SavedStorageState;
}

function sendProfileState(
  session: BrowserSession,
  state: "empty" | "saving" | "saved" | "error",
  message?: string,
): void {
  send(session, { type: "profile", state, ...(message ? { message } : {}) });
}

function setEndingReason(
  session: BrowserSession,
  reason: string,
  details: Record<string, unknown> = {},
): void {
  if (session.endingReason) return;
  session.endingReason = reason;
  session.endingDetails = details;
}

async function loadProfileState(
  profileKey: string,
): Promise<SavedStorageState | null> {
  const [profile] = await db
    .select({ encryptedState: browserProfilesTable.encryptedState })
    .from(browserProfilesTable)
    .where(eq(browserProfilesTable.profileKey, profileKey))
    .limit(1);
  if (!profile) return null;
  const state = decryptProfileState(profileKey, profile.encryptedState);
  return state;
}

async function writeProfileState(
  session: BrowserSession,
  allowClosed = false,
): Promise<void> {
  if (
    !session.profileKey ||
    !session.context ||
    session.context.isClosed() ||
    session.profileCleared ||
    (session.closed && !allowClosed)
  ) {
    return;
  }
  const state = await session.context.storageState({ indexedDB: true });
  const stateJson = JSON.stringify(state);
  if (stateJson === session.persistedStateJson) {
    sendProfileState(session, "saved");
    return;
  }

  sendProfileState(session, "saving");
  const encryptedState = encryptProfileState(session.profileKey, stateJson);
  await db
    .insert(browserProfilesTable)
    .values({
      profileKey: session.profileKey,
      encryptedState,
    })
    .onConflictDoUpdate({
      target: browserProfilesTable.profileKey,
      set: {
        encryptedState,
        updatedAt: new Date(),
      },
    });
  session.persistedStateJson = stateJson;
  sendProfileState(session, "saved");
}

function persistProfileState(
  session: BrowserSession,
  allowClosed = false,
): Promise<void> {
  const operation = session.profileOperation.then(() =>
    writeProfileState(session, allowClosed),
  );
  session.profileOperation = operation.catch(() => undefined);
  return operation;
}

function scheduleProfileSave(session: BrowserSession): void {
  if (!session.profileKey || session.closed || session.profileCleared) return;
  sendProfileState(session, "saving");
  if (session.profileSaveTimer) clearTimeout(session.profileSaveTimer);
  session.profileSaveTimer = setTimeout(() => {
    session.profileSaveTimer = null;
    void persistProfileState(session).catch(() => {
      sendProfileState(session, "error", "Could not save this browser profile.");
    });
  }, PROFILE_SAVE_DEBOUNCE_MS);
}

type MessageEventLike = IncomingMessage;

function send(session: BrowserSession, message: Record<string, unknown>): void {
  if (session.socket.readyState === WebSocket.OPEN) {
    session.socket.send(JSON.stringify(message));
  }
}

function sendStatus(
  session: BrowserSession,
  state: "starting" | "loading" | "ready" | "closed",
  message?: string,
): void {
  send(session, { type: "status", state, ...(message ? { message } : {}) });
}

function sendError(session: BrowserSession, message: string): void {
  send(session, { type: "error", message });
}

function validUnitCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function parseMessage(raw: string): BrowserMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const message = value as Record<string, unknown>;
  if (message.type === "tracking") {
    return message.token === null || (typeof message.token === "string" && message.token.length <= 128)
      ? { type: "tracking", token: message.token as string | null } : null;
  }
  if (message.type === "fitWidth") {
    return typeof message.enabled === "boolean"
      ? { type: "fitWidth", enabled: message.enabled } : null;
  }
  if (message.type === "scrollTo") {
    return validUnitCoordinate(message.ratio)
      ? { type: "scrollTo", ratio: message.ratio } : null;
  }
  if (message.type === "open") {
    return typeof message.url === "string" &&
      message.url.length <= 2048 &&
      typeof message.profileToken === "string" &&
      /^[a-f0-9]{64}$/.test(message.profileToken)
      ? { type: "open", url: message.url, profileToken: message.profileToken }
      : null;
  }
  if (message.type === "navigate") {
    return typeof message.url === "string" && message.url.length <= 2048
      ? { type: "navigate", url: message.url }
      : null;
  }
  if (message.type === "clearProfile") {
    return typeof message.profileToken === "string" &&
      /^[a-f0-9]{64}$/.test(message.profileToken)
      ? { type: "clearProfile", profileToken: message.profileToken }
      : null;
  }
  if (["back", "forward", "reload"].includes(String(message.type))) {
    return { type: message.type as "back" | "forward" | "reload" };
  }
  if (
    message.type === "pointer" &&
    ["down", "move", "up"].includes(String(message.phase)) &&
    validUnitCoordinate(message.x) &&
    validUnitCoordinate(message.y) &&
    [0, 1, 2].includes(Number(message.button))
  ) {
    return {
      type: "pointer",
      phase: message.phase as "down" | "move" | "up",
      x: message.x,
      y: message.y,
      button: Number(message.button),
    };
  }
  if (
    message.type === "scroll" &&
    validUnitCoordinate(message.x) &&
    validUnitCoordinate(message.y) &&
    typeof message.deltaX === "number" &&
    Number.isFinite(message.deltaX) &&
    typeof message.deltaY === "number" &&
    Number.isFinite(message.deltaY)
  ) {
    return {
      type: "scroll",
      x: message.x,
      y: message.y,
      deltaX: Math.max(-1800, Math.min(1800, message.deltaX)),
      deltaY: Math.max(-1800, Math.min(1800, message.deltaY)),
    };
  }
  if (message.type === "text") {
    return typeof message.text === "string" && message.text.length <= 2500
      ? { type: "text", text: message.text }
      : null;
  }
  if (message.type === "key") {
    return typeof message.key === "string" && message.key.length <= 48
      ? { type: "key", key: message.key }
      : null;
  }
  return null;
}

async function captureFrame(session: BrowserSession): Promise<void> {
  if (
    session.closed ||
    session.capturingFrame ||
    !session.page ||
    session.page.isClosed() ||
    session.socket.readyState !== WebSocket.OPEN ||
    session.socket.bufferedAmount > MAX_FRAME_BACKLOG_BYTES
  ) {
    return;
  }

  session.capturingFrame = true;
  try {
    const [image, title, scroll] = await Promise.all([
      session.page.screenshot({
        type: "jpeg",
        quality: 62,
        timeout: 4_000,
      }),
      session.page.title().catch(() => ""),
      session.page.evaluate(() => {
        const element = document.scrollingElement ?? document.documentElement;
        const max = Math.max(0, element.scrollHeight - element.clientHeight);
        return { ratio: max ? element.scrollTop / max : 0, canScroll: max > 1 };
      }),
    ]);
    send(session, {
      type: "frame",
      image: `data:image/jpeg;base64,${image.toString("base64")}`,
      url: session.page.url(),
      title,
      status: session.responseStatus,
      viewport: { width: WIDTH, height: HEIGHT },
      scroll,
      fitToWidth: session.fitToWidth,
    });
  } catch {
    // The page may be navigating or closing; the next frame will recover.
  } finally {
    session.capturingFrame = false;
  }
}

function watchPage(session: BrowserSession, page: Page): void {
  if (session.observedPages.has(page)) return;
  session.observedPages.add(page);
  session.page = page;
  session.responseStatus = 0;
  page.on("request", (request) => {
    if (
      request.isNavigationRequest() &&
      request.frame() === page.mainFrame() &&
      /^https?:/i.test(request.url())
    ) {
      session.responseStatus = 0;
      sendStatus(session, "loading");
    }
  });
  page.on("response", (response) => {
    scheduleProfileSave(session);
    if (
      response.request().isNavigationRequest() &&
      response.frame() === page.mainFrame()
    ) {
      session.responseStatus = response.status();
      sendStatus(session, "ready");
      void captureFrame(session);
    }
  });
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame() && /^https?:/i.test(frame.url())) {
      sendStatus(session, "loading");
      // Never await activity writes in the ordered input/render pipeline.
      void recordVisit(session.trackingToken, frame.url()).catch((err) => {
        logger.warn({ err }, "Consented page activity could not be saved");
      });
    }
  });
  page.on("load", () => {
    if (session.page === page) {
      sendStatus(session, "ready");
      scheduleProfileSave(session);
      void fitPageWidth(page, session.fitToWidth, WIDTH)
        .then(() => captureFrame(session)).catch(() => undefined);
    }
  });
  page.on("download", (download) => {
    void download.cancel();
  });
}

async function startSession(
  session: BrowserSession,
  rawUrl: string,
  profileToken?: string,
): Promise<void> {
  sendStatus(session, "starting", "Starting a private Chromium session");
  const target = getAllowedWebUrl(rawUrl);
  await resolvePublicIPv4(target.hostname);

  if (!session.browser) {
    if (!profileToken) {
      throw new Error("A private browser profile is required.");
    }
    session.profileKey = deriveProfileKey(profileToken);
    const savedState = await loadProfileState(session.profileKey);
    session.persistedStateJson = savedState ? JSON.stringify(savedState) : null;
    sendProfileState(session, savedState ? "saved" : "empty");
    session.proxy = await startSafeProxy();
    session.browser = await chromium.launch({
      headless: true,
      proxy: { server: session.proxy.origin, bypass: "" },
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    session.browser.on("disconnected", () => {
      if (session.closed) return;
      setEndingReason(session, "remote browser process disconnected");
      sendStatus(session, "closed", "The remote browser process disconnected.");
      session.socket.close(1011, "Remote browser process disconnected");
    });
    if (session.closed) throw new Error("The browser session was closed.");
    session.context = await session.browser.newContext({
      viewport: { width: WIDTH, height: HEIGHT },
      acceptDownloads: false,
      serviceWorkers: "block",
      javaScriptEnabled: true,
      ...(savedState ? { storageState: savedState } : {}),
    });
    await guardPageRequests(session.context);
    session.context.on("page", (page) => watchPage(session, page));
    session.page = await session.context.newPage();
    watchPage(session, session.page);
  }

  if (!session.page) {
    throw new Error("The remote browser session is no longer available.");
  }
  sendStatus(session, "loading", `Opening ${target.hostname}`);
  const response = await session.page.goto(target.href, {
    waitUntil: "domcontentloaded",
    timeout: 20_000,
  });
  session.responseStatus = response?.status() ?? session.responseStatus;
  await fitPageWidth(session.page, session.fitToWidth, WIDTH);
  sendStatus(session, "ready");
  await captureFrame(session);
}

async function clearProfile(
  session: BrowserSession,
  profileToken: string,
): Promise<void> {
  const profileKey = deriveProfileKey(profileToken);
  if (session.profileKey && session.profileKey !== profileKey) {
    throw new Error("This browser profile does not match the active session.");
  }
  session.profileKey = profileKey;
  session.profileCleared = true;
  if (session.profileSaveTimer) {
    clearTimeout(session.profileSaveTimer);
    session.profileSaveTimer = null;
  }
  await session.profileOperation;
  await db
    .delete(browserProfilesTable)
    .where(eq(browserProfilesTable.profileKey, profileKey));
  session.persistedStateJson = null;
  sendProfileState(session, "empty");
  sendStatus(session, "closed", "Saved cookies and site data were cleared.");
  setEndingReason(session, "saved browser profile cleared");
  session.socket.close(1000, "Browser profile cleared");
}

async function handleMessage(
  session: BrowserSession,
  message: BrowserMessage,
): Promise<void> {
  session.lastActivity = Date.now();
  if (message.type === "tracking") {
    // Identity is bound to the accepted cookie at upgrade, never chosen by the socket client.
    if (message.token !== session.trackingToken) {
      session.closed = true;
      setEndingReason(session, "activity logging acceptance token mismatch");
      sendError(session, "Activity logging acceptance is required to use the browser.");
      session.socket.close(1008, "Activity logging acceptance required");
    }
    return;
  }
  if (message.type === "clearProfile") {
    try {
      await clearProfile(session, message.profileToken);
    } catch {
      sendProfileState(session, "error", "Could not clear saved browser data.");
    }
    return;
  }

  if (message.type === "open" || message.type === "navigate") {
    try {
      await startSession(
        session,
        message.url,
        message.type === "open" ? message.profileToken : undefined,
      );
    } catch (err) {
      logger.warn({ err }, "Remote browser could not open page");
      sendStatus(session, "ready");
      sendError(
        session,
        "Could not start the remote browser or load that page. Check the address and try again. If this continues, check the server logs.",
      );
    }
    return;
  }

  const page = session.page;
  if (!page || page.isClosed()) {
    sendError(session, "Open a public website to start browsing.");
    return;
  }

  try {
    switch (message.type) {
      case "fitWidth":
        session.fitToWidth = message.enabled;
        await fitPageWidth(page, message.enabled, WIDTH);
        break;
      case "scrollTo":
        await page.evaluate((ratio) => {
          const element = document.scrollingElement ?? document.documentElement;
          element.scrollTo({
            top: ratio * Math.max(0, element.scrollHeight - element.clientHeight),
            left: element.scrollLeft,
            behavior: "instant",
          });
        }, message.ratio);
        break;
      case "back":
        sendStatus(session, "loading");
        await page.goBack({ waitUntil: "domcontentloaded", timeout: 12_000 }).catch(() => null);
        break;
      case "forward":
        sendStatus(session, "loading");
        await page.goForward({ waitUntil: "domcontentloaded", timeout: 12_000 }).catch(() => null);
        break;
      case "reload":
        sendStatus(session, "loading");
        await page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => null);
        break;
      case "pointer": {
        const x = Math.round(message.x * WIDTH);
        const y = Math.round(message.y * HEIGHT);
        await page.mouse.move(x, y);
        if (message.phase === "down") {
          await page.mouse.down({ button: (["left", "middle", "right"] as const)[message.button] });
        } else if (message.phase === "up") {
          await page.mouse.up({ button: (["left", "middle", "right"] as const)[message.button] });
        }
        break;
      }
      case "scroll":
        await page.mouse.move(
          Math.round(message.x * WIDTH),
          Math.round(message.y * HEIGHT),
        );
        await page.mouse.wheel(message.deltaX, message.deltaY);
        break;
      case "text":
        await page.keyboard.insertText(message.text);
        break;
      case "key":
        // Browsers report Shift+Backspace as a combined key, but remote pages
        // should receive Backspace just as they do from an unshifted press.
        const key = message.key === "Shift+Backspace" ? "Backspace" : message.key;
        if (
          !allowedKeys.has(key) &&
          !/^(?:(?:Control|Alt|Meta|Shift)\+)*(?:[A-Za-z0-9]|Arrow(?:Down|Left|Right|Up)|F(?:[1-9]|1[0-2])|Enter)$/.test(key)
        ) {
          sendError(session, "That keyboard key is not supported.");
          return;
        }
        await page.keyboard.press(key);
        break;
    }
    if (message.type !== "pointer" || message.phase !== "move") {
      scheduleProfileSave(session);
      // A slow screenshot must not hold up subsequent input events.
      void captureFrame(session);
    }
  } catch {
    sendError(session, "That browser action could not be completed.");
  }
}

function rejectUpgrade(socket: Duplex, status: number): void {
  socket.write(`HTTP/1.1 ${status} ${status === 403 ? "Forbidden" : "Service Unavailable"}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

export function attachBrowserWebSocket(server: Server): void {
  const webSocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: 16 * 1024,
  });
  const acceptedTokens = new WeakMap<WebSocket, string>();

  server.on("upgrade", async (request: MessageEventLike, socket: Duplex, head: Buffer) => {
    let pathname = "";
    try {
      pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    } catch {
      rejectUpgrade(socket, 403);
      return;
    }
    if (pathname !== "/api/browser/ws") {
      rejectUpgrade(socket, 403);
      return;
    }

    const origin = request.headers.origin;
    const host = request.headers.host;
    try {
      if (!origin || !host || new URL(origin).host !== host) {
        rejectUpgrade(socket, 403);
        return;
      }
    } catch {
      rejectUpgrade(socket, 403);
      return;
    }

    try {
      const token = deviceTokenFromCookieHeader(request.headers.cookie);
      if (!token || !await hasActivityAcceptance(token)) {
        rejectUpgrade(socket, 403);
        return;
      }
      if (socket.destroyed) return;
      webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
        acceptedTokens.set(webSocket, token);
        webSocketServer.emit("connection", webSocket, request);
      });
    } catch (err) {
      logger.warn({ err }, "Browser activity acceptance could not be verified");
      rejectUpgrade(socket, 503);
    }
  });

  webSocketServer.on("connection", (socket) => {
    if (!acquireBrowserSlot()) {
      const sessionId = randomBytes(8).toString("hex");
      logger.warn({ sessionId, reason: "browser capacity reached" }, "Remote browser session rejected");
      socket.send(
        JSON.stringify({
          type: "error",
          message: "All remote browser sessions are busy. Try again shortly.",
        }),
      );
      socket.close(1013, "Browser capacity reached");
      return;
    }

    const session: BrowserSession = {
      sessionId: randomBytes(8).toString("hex"),
      socket,
      trackingToken: acceptedTokens.get(socket) ?? null,
      browser: null,
      context: null,
      page: null,
      proxy: null,
      frameTimer: null,
      profileTimer: null,
      profileSaveTimer: null,
      lastActivity: Date.now(),
      responseStatus: 0,
      profileKey: null,
      persistedStateJson: null,
      profileCleared: false,
      profileOperation: Promise.resolve(),
      capturingFrame: false,
      closed: false,
      endingReason: null,
      endingDetails: {},
      queue: Promise.resolve(),
      pendingInput: null,
      initializePromise: null,
      cleanupPromise: null,
      observedPages: new WeakSet(),
      fitToWidth: true,
    };

    const stopForAcceptance = () => {
      if (session.closed) return;
      session.closed = true;
      setEndingReason(session, "activity logging acceptance revoked or unavailable");
      sendError(session, "Activity logging acceptance is required to use the browser.");
      socket.close(1008, "Activity logging acceptance required");
      // Interrupt a current navigation too; cleanup below also handles partial initialization.
      void session.browser?.close().catch(() => undefined);
    };
    const removeRevocationListener = onActivityRevoked(id => {
      if (id === deviceIdFromToken(session.trackingToken)) stopForAcceptance();
    });
    let checkingAcceptance = false;
    // Check revocation from other deployed instances without adding latency to ordered input.
    const acceptanceTimer = setInterval(() => {
      if (session.closed || checkingAcceptance) return;
      checkingAcceptance = true;
      void hasActivityAcceptance(session.trackingToken)
        .then(active => { if (!active) stopForAcceptance(); })
        .catch(() => stopForAcceptance())
        .finally(() => { checkingAcceptance = false; });
    }, 1000);

    sendStatus(session, "starting");
    session.frameTimer = setInterval(() => {
      const idleDurationMs = Date.now() - session.lastActivity;
      if (idleDurationMs > IDLE_TIMEOUT_MS) {
        setEndingReason(session, "idle timeout", { idleDurationMs });
        sendStatus(session, "closed", "This browser session expired after inactivity.");
        socket.close(1000, "Session expired");
        return;
      }
      void captureFrame(session);
    }, FRAME_INTERVAL_MS);
    session.profileTimer = setInterval(() => {
      void persistProfileState(session).catch(() => {
        sendProfileState(session, "error", "Could not save this browser profile.");
      });
    }, PROFILE_SAVE_INTERVAL_MS);

    socket.on("message", (raw) => {
      const message = parseMessage(raw.toString());
      if (!message) {
        sendError(session, "The browser received an unsupported action.");
        return;
      }
      // Merge only adjacent queued events: never move input across a click,
      // navigation, or key event, and never change an event already executing.
      const pending = session.pendingInput;
      if (pending?.type === "scrollTo" && message.type === "scrollTo") {
        pending.ratio = message.ratio;
        return;
      }
      if (pending?.type === "pointer" && pending.phase === "move" &&
          message.type === "pointer" && message.phase === "move") {
        Object.assign(pending, message);
        return;
      }
      if (pending?.type === "scroll" && message.type === "scroll") {
        pending.x = message.x;
        pending.y = message.y;
        pending.deltaX = Math.max(-1800, Math.min(1800, pending.deltaX + message.deltaX));
        pending.deltaY = Math.max(-1800, Math.min(1800, pending.deltaY + message.deltaY));
        return;
      }
      if (pending?.type === "text" && message.type === "text" &&
          pending.text.length + message.text.length <= 2500) {
        pending.text += message.text;
        return;
      }
      session.pendingInput = message;
      session.queue = session.queue
        .then(() => {
          if (session.pendingInput === message) session.pendingInput = null;
          return session.closed ? undefined : handleMessage(session, message);
        })
        .catch(() => sendError(session, "The browser action failed."));
      if (
        message.type === "open" &&
        !session.browser &&
        !session.initializePromise
      ) {
        session.initializePromise = session.queue;
      }
    });

    const cleanup = (
      closeCode?: number,
      closeReason?: Buffer,
      socketError?: Error,
    ): Promise<void> => {
      if (session.cleanupPromise) return session.cleanupPromise;
      session.closed = true;
      const reason = session.endingReason ??
        (socketError ? "websocket error" : closeCode === 1006 ? "unexpected websocket disconnect" : "client disconnected");
      const logDetails = {
        sessionId: session.sessionId,
        reason,
        closeCode,
        closeMessage: closeReason?.toString("utf8").slice(0, 123) || undefined,
        ...session.endingDetails,
        ...(socketError ? { err: socketError } : {}),
      };
      if (socketError || closeCode === 1006) {
        logger.warn(logDetails, "Remote browser session ended");
      } else {
        logger.info(logDetails, "Remote browser session ended");
      }
      clearInterval(acceptanceTimer);
      removeRevocationListener();
      if (session.frameTimer) clearInterval(session.frameTimer);
      if (session.profileTimer) clearInterval(session.profileTimer);
      if (session.profileSaveTimer) {
        clearTimeout(session.profileSaveTimer);
        session.profileSaveTimer = null;
      }
      session.cleanupPromise = (async () => {
        if (session.initializePromise) {
          await session.initializePromise.catch(() => undefined);
        }
        if (session.profileKey && !session.profileCleared) {
          await persistProfileState(session, true).catch(() => undefined);
        }
        if (session.browser) await session.browser.close().catch(() => undefined);
        if (session.proxy) await session.proxy.close().catch(() => undefined);
        releaseBrowserSlot();
      })();
      return session.cleanupPromise;
    };
    logger.info({ sessionId: session.sessionId }, "Remote browser session started");
    socket.on("close", (code, reason) => void cleanup(code, reason));
    socket.on("error", (err) => void cleanup(undefined, undefined, err));
  });
}

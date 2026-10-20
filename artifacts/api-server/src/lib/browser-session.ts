import type { Server, IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { WebSocket, WebSocketServer } from "ws";
import {
  getAllowedWebUrl,
  guardPageRequests,
  resolvePublicIPv4,
  startSafeProxy,
} from "../routes/browser";
import { acquireBrowserSlot, releaseBrowserSlot } from "./browser-limits";

const WIDTH = 1280;
const HEIGHT = 800;
const FRAME_INTERVAL_MS = 750;
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
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
  | { type: "open" | "navigate"; url: string }
  | { type: "back" | "forward" | "reload" }
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
  socket: WebSocket;
  browser: Browser | null;
  context: BrowserContext | null;
  page: Page | null;
  proxy: SafeProxy | null;
  frameTimer: NodeJS.Timeout | null;
  lastActivity: number;
  responseStatus: number;
  capturingFrame: boolean;
  closed: boolean;
  queue: Promise<void>;
  initializePromise: Promise<void> | null;
  cleanupPromise: Promise<void> | null;
  observedPages: WeakSet<Page>;
};

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
  if (message.type === "open" || message.type === "navigate") {
    return typeof message.url === "string" && message.url.length <= 2048
      ? { type: message.type, url: message.url }
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
    session.socket.readyState !== WebSocket.OPEN
  ) {
    return;
  }

  session.capturingFrame = true;
  try {
    const [image, title] = await Promise.all([
      session.page.screenshot({
        type: "jpeg",
        quality: 62,
        animations: "disabled",
        timeout: 4_000,
      }),
      session.page.title().catch(() => ""),
    ]);
    send(session, {
      type: "frame",
      image: `data:image/jpeg;base64,${image.toString("base64")}`,
      url: session.page.url(),
      title,
      status: session.responseStatus,
      viewport: { width: WIDTH, height: HEIGHT },
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
    }
  });
  page.on("load", () => {
    if (session.page === page) {
      sendStatus(session, "ready");
      void captureFrame(session);
    }
  });
  page.on("download", (download) => {
    void download.cancel();
  });
}

async function startSession(session: BrowserSession, rawUrl: string): Promise<void> {
  sendStatus(session, "starting", "Starting a private Chromium session");
  const target = getAllowedWebUrl(rawUrl);
  await resolvePublicIPv4(target.hostname);

  if (!session.browser) {
    session.proxy = await startSafeProxy();
    session.browser = await chromium.launch({
      headless: true,
      proxy: { server: session.proxy.origin, bypass: "" },
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    session.context = await session.browser.newContext({
      viewport: { width: WIDTH, height: HEIGHT },
      acceptDownloads: false,
      serviceWorkers: "block",
      javaScriptEnabled: true,
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
  sendStatus(session, "ready");
  await captureFrame(session);
}

async function handleMessage(
  session: BrowserSession,
  message: BrowserMessage,
): Promise<void> {
  session.lastActivity = Date.now();
  if (message.type === "open" || message.type === "navigate") {
    try {
      await startSession(session, message.url);
    } catch {
      sendStatus(session, "ready");
      sendError(
        session,
        "Could not open that page. Use a public HTTP or HTTPS website; local and private destinations are blocked.",
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
        if (!allowedKeys.has(message.key) && !/^(Control|Alt|Meta|Shift)\+[\w]+$/.test(message.key)) {
          sendError(session, "That keyboard key is not supported.");
          return;
        }
        await page.keyboard.press(message.key);
        break;
    }
    if (message.type !== "pointer" || message.phase !== "move") {
      await captureFrame(session);
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

  server.on("upgrade", (request: MessageEventLike, socket: Duplex, head: Buffer) => {
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

    webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      webSocketServer.emit("connection", webSocket, request);
    });
  });

  webSocketServer.on("connection", (socket) => {
    if (!acquireBrowserSlot()) {
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
      socket,
      browser: null,
      context: null,
      page: null,
      proxy: null,
      frameTimer: null,
      lastActivity: Date.now(),
      responseStatus: 0,
      capturingFrame: false,
      closed: false,
      queue: Promise.resolve(),
      initializePromise: null,
      cleanupPromise: null,
      observedPages: new WeakSet(),
    };

    sendStatus(session, "starting");
    session.frameTimer = setInterval(() => {
      if (Date.now() - session.lastActivity > IDLE_TIMEOUT_MS) {
        sendStatus(session, "closed", "This browser session expired after inactivity.");
        socket.close(1000, "Session expired");
        return;
      }
      void captureFrame(session);
    }, FRAME_INTERVAL_MS);

    socket.on("message", (raw) => {
      const message = parseMessage(raw.toString());
      if (!message) {
        sendError(session, "The browser received an unsupported action.");
        return;
      }
      session.queue = session.queue
        .then(() => handleMessage(session, message))
        .catch(() => sendError(session, "The browser action failed."));
      if (
        message.type === "open" &&
        !session.browser &&
        !session.initializePromise
      ) {
        session.initializePromise = session.queue;
      }
    });

    const cleanup = (): Promise<void> => {
      if (session.cleanupPromise) return session.cleanupPromise;
      session.closed = true;
      if (session.frameTimer) clearInterval(session.frameTimer);
      session.cleanupPromise = (async () => {
        if (session.initializePromise) {
          await session.initializePromise.catch(() => undefined);
        }
        if (session.browser) await session.browser.close().catch(() => undefined);
        if (session.proxy) await session.proxy.close().catch(() => undefined);
        releaseBrowserSlot();
      })();
      return session.cleanupPromise;
    };
    socket.on("close", () => void cleanup());
    socket.on("error", () => void cleanup());
  });
}

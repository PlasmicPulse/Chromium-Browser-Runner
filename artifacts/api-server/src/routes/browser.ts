import { Router, type IRouter } from "express";
import { RunBrowserBody, RunBrowserResponse } from "@workspace/api-zod";
import { lookup } from "node:dns/promises";
import {
  request as httpRequest,
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { BlockList, createConnection, isIP, type Socket } from "node:net";
import type { Duplex } from "node:stream";
import { chromium } from "playwright";
import type { BrowserContext, Page } from "playwright";
import { acquireBrowserSlot, releaseBrowserSlot } from "../lib/browser-limits";

const router: IRouter = Router();
const MAX_TEXT_LENGTH = 900;

const blockedIPv4 = new BlockList();
for (const [subnet, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedIPv4.addSubnet(subnet, prefix, "ipv4");
}

function isPublicIPv4(address: string): boolean {
  return isIP(address) === 4 && !blockedIPv4.check(address, "ipv4");
}

export async function resolvePublicIPv4(hostname: string): Promise<string> {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (
    !normalized ||
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized.endsWith(".test") ||
    normalized.endsWith(".invalid") ||
    normalized.endsWith(".example") ||
    normalized.endsWith(".onion")
  ) {
    throw new Error("Local and reserved hostnames are blocked.");
  }

  if (isIP(normalized)) {
    if (!isPublicIPv4(normalized)) {
      throw new Error("Private and reserved IP addresses are blocked.");
    }
    return normalized;
  }

  const answers = await lookup(normalized, { all: true, family: 4, verbatim: true });
  if (
    answers.length === 0 ||
    answers.some(({ address }) => !isPublicIPv4(address))
  ) {
    throw new Error("The destination does not resolve exclusively to public IPv4 addresses.");
  }
  return answers[0].address;
}

export function getAllowedWebUrl(rawUrl: string): URL {
  console.log("DEBUG - Received rawUrl:", rawUrl);
  const url = new URL(rawUrl);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port !== "" && url.port !== "80" && url.port !== "443") ||
    (url.protocol === "http:" && url.port === "443") ||
    (url.protocol === "https:" && url.port === "80")
  ) {
    throw new Error("Only public HTTP and HTTPS websites on standard ports are supported.");
  }
  return url;
}

function getProxyAddress(authority: string, expectedPort: number): URL {
  const destination = new URL(`http://${authority}`);
  if (
    destination.username ||
    destination.password ||
    destination.port !== String(expectedPort) ||
    !destination.hostname
  ) {
    throw new Error("Unsupported proxy destination.");
  }
  return destination;
}

export async function startSafeProxy(): Promise<{
  origin: string;
  close: () => Promise<void>;
}> {
  const server = createServer((req, res) => {
    void forwardHttpRequest(req, res);
  });

  server.on("connect", (req, client, head) => {
    void establishTunnel(req, client, head);
  });
  server.on("upgrade", (req, client, head) => {
    void establishWebSocketTunnel(req, client, head);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error("Could not start the isolated browser proxy.");
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };

  async function forwardHttpRequest(
    incoming: IncomingMessage,
    outgoing: ServerResponse,
  ): Promise<void> {
    try {
      const destination = getAllowedWebUrl(incoming.url ?? "");
      if (destination.protocol !== "http:") {
        outgoing.writeHead(400).end();
        return;
      }
      const address = await resolvePublicIPv4(destination.hostname);
      const headers: IncomingHttpHeaders = {
        ...incoming.headers,
        host: destination.host,
      };
      delete headers["proxy-connection"];
      const upstream = httpRequest(
        {
          hostname: address,
          family: 4,
          port: 80,
          method: incoming.method,
          path: `${destination.pathname}${destination.search}`,
          headers,
          agent: false,
        },
        (response) => {
          outgoing.writeHead(response.statusCode ?? 502, response.headers);
          response.pipe(outgoing);
        },
      );
      upstream.setTimeout(12_000, () => upstream.destroy(new Error("Request timed out.")));
      upstream.on("error", () => {
        if (!outgoing.headersSent) outgoing.writeHead(502);
        outgoing.end();
      });
      incoming.pipe(upstream);
    } catch {
      outgoing.writeHead(403, { "content-type": "text/plain" });
      outgoing.end("Blocked destination");
    }
  }

  async function establishTunnel(
    req: IncomingMessage,
    client: Duplex,
    head: Buffer,
  ): Promise<void> {
    let upstream: Socket | undefined;
    try {
      const destination = getProxyAddress(req.url ?? "", 443);
      const address = await resolvePublicIPv4(destination.hostname);
      upstream = createConnection({ host: address, family: 4, port: 443 });
      upstream.once("connect", () => {
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) upstream?.write(head);
        client.pipe(upstream!);
        upstream!.pipe(client);
      });
      upstream.once("error", () => {
        if (!client.destroyed) {
          client.write("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
          client.destroy();
        }
      });
      client.once("error", () => upstream?.destroy());
      client.once("close", () => upstream?.destroy());
    } catch {
      if (!client.destroyed) {
        client.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
        client.destroy();
      }
    }
  }

  async function establishWebSocketTunnel(
    req: IncomingMessage,
    client: Duplex,
    head: Buffer,
  ): Promise<void> {
    let upstream: Socket | undefined;
    try {
      const requestUrl = new URL(req.url ?? "");
      if (requestUrl.protocol === "ws:") requestUrl.protocol = "http:";
      const destination = getAllowedWebUrl(requestUrl.href);
      if (
        destination.protocol !== "http:" ||
        destination.port !== "" ||
        req.headers.upgrade?.toLowerCase() !== "websocket"
      ) {
        client.destroy();
        return;
      }
      const address = await resolvePublicIPv4(destination.hostname);
      upstream = createConnection({ host: address, family: 4, port: 80 });
      upstream.once("connect", () => {
        const headers: IncomingHttpHeaders = {
          ...req.headers,
          host: destination.host,
          connection: "Upgrade",
        };
        delete headers["proxy-connection"];
        const headerLines = Object.entries(headers)
          .filter(([, value]) => value !== undefined)
          .flatMap(([name, value]) =>
            (Array.isArray(value) ? value : [value]).map(
              (item) => `${name}: ${item}`,
            ),
          )
          .join("\r\n");
        upstream?.write(
          `${req.method ?? "GET"} ${destination.pathname}${destination.search} HTTP/1.1\r\n${headerLines}\r\n\r\n`,
        );
        if (head.length) upstream?.write(head);
        client.pipe(upstream!);
        upstream!.pipe(client);
      });
      upstream.once("error", () => client.destroy());
      client.once("error", () => upstream?.destroy());
      client.once("close", () => upstream?.destroy());
    } catch {
      client.destroy();
    }
  }
}

export async function guardPageRequests(
  target: Page | BrowserContext,
): Promise<void> {
  await target.route("**/*", async (route) => {
    try {
      const destination = new URL(route.request().url());
      if (destination.protocol === "ws:") {
        destination.protocol = "http:";
      } else if (destination.protocol === "wss:") {
        destination.protocol = "https:";
      }
      if (!["http:", "https:"].includes(destination.protocol)) {
        await route.abort("blockedbyclient");
        return;
      }
      getAllowedWebUrl(destination.href);
      await resolvePublicIPv4(destination.hostname);
      await route.continue();
    } catch {
      await route.abort("blockedbyclient");
    }
  });
}

router.post("/browser/run", async (req, res): Promise<void> => {
  const parsed = RunBrowserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid HTTP or HTTPS web address." });
    return;
  }

  let requestedUrl: URL;
  try {
    requestedUrl = getAllowedWebUrl(parsed.data.url);
    await resolvePublicIPv4(requestedUrl.hostname);
  } catch {
    res.status(400).json({
      error: "Only public websites are supported. Local, private, and reserved destinations are blocked.",
    });
    return;
  }

  if (!acquireBrowserSlot()) {
    res.status(429).json({ error: "Chromium is busy. Please try again shortly." });
    return;
  }
  const startedAt = Date.now();
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let proxy: Awaited<ReturnType<typeof startSafeProxy>> | undefined;

  try {
    proxy = await startSafeProxy();
    browser = await chromium.launch({
      headless: true,
      proxy: { server: proxy.origin, bypass: "" },
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      acceptDownloads: false,
      serviceWorkers: "block",
      javaScriptEnabled: true,
    });
    const page = await context.newPage();
    await guardPageRequests(page);

    const response = await page.goto(requestedUrl.href, {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });
    await page.waitForTimeout(700);

    const [title, textExcerpt, screenshot] = await Promise.all([
      page.title().catch(() => ""),
      page.locator("body").innerText({ timeout: 2_000 }).catch(() => ""),
      page.screenshot({
        type: "jpeg",
        quality: 70,
        animations: "disabled",
        timeout: 5_000,
      }),
    ]);

    const result = RunBrowserResponse.parse({
      requestedUrl: requestedUrl.href,
      finalUrl: page.url(),
      title,
      status: response?.status() ?? 0,
      screenshot: `data:image/jpeg;base64,${screenshot.toString("base64")}`,
      elapsedMs: Date.now() - startedAt,
      textExcerpt: textExcerpt.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH),
    });
    res.json(result);
  } catch (error) {
    req.log.warn({ err: error }, "Chromium page run failed");
    res.status(502).json({
      error: "Chromium could not load that page. Check the address and try again.",
    });
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (proxy) await proxy.close().catch(() => undefined);
    releaseBrowserSlot();
  }
});

export default router;

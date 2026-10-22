import { createServer } from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import { attachBrowserWebSocket } from "./lib/browser-session";
import { initializeChat } from "./lib/chat-store";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer(app);
attachBrowserWebSocket(server);
server.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});
initializeChat().then(() => {
  server.listen(port, () => {
    logger.info({ port }, "Server listening");
  });
}).catch((err) => {
  logger.error({ err }, "Chat database setup failed");
  process.exit(1);
});

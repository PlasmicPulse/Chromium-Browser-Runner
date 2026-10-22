import { Router, type IRouter } from "express";
import { ListChatMessagesResponse, SendChatMessageBody, SendChatMessageResponse } from "@workspace/api-zod";
import { listMessages, saveMessage } from "../lib/chat-store";
import { deviceIdFromToken, requestDeviceToken } from "../lib/visitor-activity";

const router: IRouter = Router();
const recent = new Map<string, number>();

router.get("/chat", async (_req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  res.json(ListChatMessagesResponse.parse(await listMessages()));
});

router.post("/chat", async (req, res): Promise<void> => {
  const body = req.body && typeof req.body === "object" ? {
    username: typeof req.body.username === "string" ? req.body.username.trim() : req.body.username,
    message: typeof req.body.message === "string" ? req.body.message.trim() : req.body.message,
  } : req.body;
  const parsed = SendChatMessageBody.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ error: "Use a username of 1–24 letters, numbers, underscores or hyphens, and a message of 1–1000 characters." });
    return;
  }
  const now = Date.now();
  for (const [key, time] of recent) if (now - time >= 2000) recent.delete(key);
  const trackingToken = requestDeviceToken(req);
  // The service sits behind a shared proxy: using only req.ip throttles unrelated visitors together.
  const sender = deviceIdFromToken(trackingToken) ?? `${req.ip ?? "unknown"}:${parsed.data.username.toLowerCase()}`;
  if (recent.has(sender) || recent.size >= 5000) {
    res.setHeader("Retry-After", "2");
    res.status(429).json({ error: "Please wait two seconds before sending again." });
    return;
  }
  recent.set(sender, now);
  res.status(201).json(SendChatMessageResponse.parse(await saveMessage(parsed.data.username, parsed.data.message, trackingToken)));
});

export default router;

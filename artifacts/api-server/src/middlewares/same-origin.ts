import type { RequestHandler } from "express";
import { getClerkProxyHost } from "./clerkProxyMiddleware";

export const requireSameOrigin: RequestHandler = (req, res, next) => {
  // Protect consent and owner mutations from cross-site requests.
  const origin = req.get("origin");
  try {
    if (!origin || new URL(origin).host !== getClerkProxyHost(req) ||
        req.get("sec-fetch-site") === "cross-site") {
      res.status(403).json({ error: "A same-origin request is required." });
      return;
    }
  } catch {
    res.status(403).json({ error: "Invalid request origin." });
    return;
  }
  next();
};

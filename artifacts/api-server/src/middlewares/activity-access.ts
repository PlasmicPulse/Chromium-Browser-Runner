import type { RequestHandler } from "express";
import { hasActivityAcceptance, requestDeviceToken } from "../lib/visitor-activity";

export const requireActivityAcceptance: RequestHandler = async (req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const token = requestDeviceToken(req);
    if (!await hasActivityAcceptance(token)) {
      res.status(403).json({ error: "Accept activity logging to use the browser and chat.", code: "ACTIVITY_ACCEPTANCE_REQUIRED" });
      return;
    }
    res.locals.activityToken = token;
    next();
  } catch (err) {
    req.log.error({ err }, "Activity acceptance could not be verified");
    res.status(503).json({ error: "Unable to verify activity logging acceptance. Please try again." });
  }
};

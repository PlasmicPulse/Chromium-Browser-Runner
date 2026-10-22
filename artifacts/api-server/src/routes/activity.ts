import { Router, type IRouter } from "express";
import { GetActivityConsentResponse, SetActivityConsentBody, SetActivityConsentResponse } from "@workspace/api-zod";
import { changeConsent, readConsent, recordAccess } from "../lib/visitor-activity";
import { requireSameOrigin } from "../middlewares/same-origin";

const router: IRouter = Router();
router.use("/activity", (_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
});
router.get("/activity/consent", async (req, res): Promise<void> => {
  res.json(GetActivityConsentResponse.parse(await readConsent(req)));
});
router.post("/activity/consent", requireSameOrigin, async (req, res): Promise<void> => {
  const parsed = SetActivityConsentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Specify whether activity logging is enabled." });
    return;
  }
  res.json(SetActivityConsentResponse.parse(await changeConsent(req, res, parsed.data.enabled)));
});
router.post("/activity/access", requireSameOrigin, async (req, res): Promise<void> => {
  await recordAccess(req);
  res.status(204).end();
});
export default router;

import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { GetOwnerAccessResponse, ListVisitorDevicesQueryParams, ListVisitorDevicesResponse, ReviewVisitorDevicesBody } from "@workspace/api-zod";
import { ownerAccess, requireOwner } from "../middlewares/owner";
import { requireSameOrigin } from "../middlewares/same-origin";
import { exportActivity } from "../lib/activity-export";

const router: IRouter = Router();
router.get("/owner/access", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(GetOwnerAccessResponse.parse(await ownerAccess(req)));
});
router.use("/owner", requireOwner);
router.get("/owner/devices", async (req, res): Promise<void> => {
  const parsed = ListVisitorDevicesQueryParams.safeParse({ page: req.query.page === undefined ? 1 : Number(req.query.page) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid page number." });
    return;
  }
  const page = parsed.data.page ?? 1;
  const pageSize = 50;
  const [counts, rows] = await Promise.all([
    pool.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE reviewed_at IS NULL)::int AS new FROM visitor_devices`),
    pool.query(
      `SELECT device_id AS "deviceId", first_seen AS "firstSeen", last_seen AS "lastSeen",
       browser, platform, username, reviewed_at IS NULL AS "isNew", consent_active AS "consentActive"
       FROM visitor_devices ORDER BY first_seen DESC, device_id DESC LIMIT $1 OFFSET $2`,
      [pageSize, (page - 1) * pageSize],
    ),
  ]);
  res.json(ListVisitorDevicesResponse.parse({
    devices: rows.rows, total: counts.rows[0].total, newCount: counts.rows[0].new, page, pageSize,
  }));
});
router.post("/owner/devices/review", requireSameOrigin, async (req, res): Promise<void> => {
  const parsed = ReviewVisitorDevicesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Specify between 1 and 50 valid device IDs." });
    return;
  }
  await pool.query(
    "UPDATE visitor_devices SET reviewed_at = now() WHERE device_id = ANY($1::uuid[]) AND reviewed_at IS NULL",
    [parsed.data.deviceIds],
  );
  res.status(204).end();
});
for (const kind of ["chat", "visits"] as const) {
  router.get(`/owner/logs/${kind}.txt`, async (req, res, next): Promise<void> => {
    try {
      await exportActivity(res, kind);
    } catch (err) {
      req.log.error({ err }, "Activity export failed");
      if (res.headersSent) res.destroy();
      else next(err);
    }
  });
}
export default router;

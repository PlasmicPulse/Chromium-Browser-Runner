import { Router, type IRouter } from "express";
import healthRouter from "./health";
import browserRouter from "./browser";

const router: IRouter = Router();

router.get("/api", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

router.use(healthRouter);
router.use(browserRouter);

export default router;

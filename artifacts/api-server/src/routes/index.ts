import { Router, type IRouter } from "express";
import healthRouter from "./health";
import browserRouter from "./browser";
import chatRouter from "./chat";

const router: IRouter = Router();

// Handle health checks at multiple potential paths
router.get("/", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

router.get("/api", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

router.use(healthRouter);
router.use(browserRouter);
router.use(chatRouter);

export default router;
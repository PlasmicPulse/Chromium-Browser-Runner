import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Direct health check endpoint at /api for Replit's deployment runner
app.get("/api", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// Direct health check at root just in case
app.get("/", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api", router);

export default app;
import path from "node:path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config.js";
import { errorHandler } from "./middleware/error.js";
import { adminRouter } from "./routes/admin/index.js";
import { authRouter } from "./routes/auth.js";
import { publicRouter } from "./routes/public.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxyHops);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({ origin: config.corsOrigins.length ? config.corsOrigins : false }));
  app.use(express.json({ limit: "1mb" }));

  app.use(
    "/uploads",
    express.static(path.resolve(config.uploadDir), { maxAge: "30d", immutable: true, index: false, dotfiles: "deny" }),
  );

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  // The API is never meant to be indexed.
  app.get("/robots.txt", (_req, res) => {
    res.type("text/plain").send("User-agent: *\nDisallow: /api/\n");
  });
  app.use("/api", (_req, res, next) => {
    res.setHeader("X-Robots-Tag", "noindex");
    next();
  });
  app.use("/api/public", publicRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "not_found", message: "Endpoint not found" });
  });

  app.use(errorHandler);
  return app;
}

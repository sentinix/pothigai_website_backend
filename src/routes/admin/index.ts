import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../../middleware/auth.js";
import { issuesToCsv, runSeoAudit } from "../../lib/seo-audit.js";
import { runLiveAudit } from "../../lib/live-audit.js";
import { adminBlogRouter } from "./blog.js";
import { adminCategoriesRouter } from "./categories.js";
import { adminOrdersRouter, adminPagesRouter, adminRedirectsRouter, adminSettingsRouter } from "./misc.js";
import { adminProductsRouter } from "./products.js";
import { adminUploadsRouter } from "./uploads.js";

export const adminRouter = Router();

// Every admin endpoint requires a valid ADMIN token.
adminRouter.use(requireAdmin);

adminRouter.use("/products", adminProductsRouter);
adminRouter.use("/categories", adminCategoriesRouter);
adminRouter.use("/blog", adminBlogRouter);
adminRouter.use("/pages", adminPagesRouter);
adminRouter.use("/settings", adminSettingsRouter);
adminRouter.use("/redirects", adminRedirectsRouter);
adminRouter.use("/orders", adminOrdersRouter);
adminRouter.use("/uploads", adminUploadsRouter);

adminRouter.get("/seo-audit", async (_req, res) => {
  res.json(await runSeoAudit());
});

adminRouter.get("/seo-audit.csv", async (_req, res) => {
  const report = await runSeoAudit();
  res
    .type("text/csv")
    .attachment(`seo-audit-${report.generatedAt.slice(0, 10)}.csv`)
    .send(issuesToCsv(report.issues as unknown as Record<string, unknown>[]));
});

adminRouter.post("/seo-audit/live", async (req, res) => {
  const limit = z.coerce.number().int().min(1).max(500).catch(100).parse(req.body?.limit);
  res.json(await runLiveAudit(limit));
});

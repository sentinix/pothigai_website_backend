import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db.js";
import { HttpError, notFound } from "../../lib/http-error.js";
import {
  orderStatusSchema,
  pageBodySchemas,
  pageContentSchema,
  redirectSchema,
  settingsSchema,
  type PageKey,
} from "../../lib/validation.js";

export const adminPagesRouter = Router();

adminPagesRouter.get("/", async (_req, res) => {
  res.json(await prisma.pageContent.findMany({ orderBy: [{ key: "asc" }, { locale: "asc" }] }));
});

adminPagesRouter.put("/:key/:locale", async (req, res) => {
  const key = req.params.key as PageKey;
  const locale = req.params.locale;
  if (!(key in pageBodySchemas) || (locale !== "en" && locale !== "ta")) throw notFound("Page");
  const input = pageContentSchema.parse(req.body);
  const body = pageBodySchemas[key].parse(input.body);
  if (key === "home" && input.robotsIndex === false) {
    throw new HttpError(400, "validation_error", "The homepage cannot be set to noindex", {
      fields: [{ path: "robotsIndex", code: "homepage_must_be_indexable" }],
    });
  }
  const data = { ...input, body };
  const page = await prisma.pageContent.upsert({
    where: { key_locale: { key, locale } },
    create: { key, locale, ...data },
    update: data,
  });
  res.json(page);
});

export const adminSettingsRouter = Router();

adminSettingsRouter.get("/", async (_req, res) => {
  res.json(await prisma.siteSettings.upsert({ where: { id: "default" }, create: {}, update: {} }));
});

adminSettingsRouter.patch("/", async (req, res) => {
  const data = settingsSchema.parse(req.body);
  res.json(
    await prisma.siteSettings.upsert({ where: { id: "default" }, create: { ...data }, update: data }),
  );
});

export const adminRedirectsRouter = Router();

adminRedirectsRouter.get("/", async (_req, res) => {
  res.json(await prisma.slugRedirect.findMany({ orderBy: { createdAt: "desc" } }));
});

adminRedirectsRouter.post("/", async (req, res) => {
  const data = redirectSchema.parse(req.body);
  const chained = await prisma.slugRedirect.findUnique({ where: { fromPath: data.toPath } });
  if (chained) throw new HttpError(400, "validation_error", "Destination is itself redirected", { fields: [{ path: "toPath", code: "redirect_chain" }] });
  res.status(201).json(await prisma.slugRedirect.create({ data }));
});

adminRedirectsRouter.delete("/:id", async (req, res) => {
  await prisma.slugRedirect.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

export const adminOrdersRouter = Router();

adminOrdersRouter.get("/", async (req, res) => {
  const page = z.coerce.number().int().min(1).catch(1).parse(req.query.page);
  const [total, orders] = await Promise.all([
    prisma.order.count(),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * 50,
      take: 50,
      include: { items: true },
    }),
  ]);
  res.json({ total, page, orders });
});

adminOrdersRouter.patch("/:id", async (req, res) => {
  const data = orderStatusSchema.parse(req.body);
  const order = await prisma.$transaction(async (tx) => {
    const existing = await tx.order.findUnique({ where: { id: req.params.id }, include: { items: true } });
    if (!existing) throw notFound("Order");
    // Cancelling returns stock once; re-opening a cancelled order is blocked to keep inventory consistent.
    if (data.status && existing.status === "CANCELLED" && data.status !== "CANCELLED") {
      throw new HttpError(400, "validation_error", "Cancelled orders cannot be reopened");
    }
    if (data.status === "CANCELLED" && existing.status !== "CANCELLED") {
      for (const item of existing.items) {
        await tx.product.update({ where: { id: item.productId }, data: { stockQuantity: { increment: item.quantity } } });
      }
    }
    return tx.order.update({ where: { id: existing.id }, data, include: { items: true } });
  });
  res.json(order);
});

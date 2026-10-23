import { Router } from "express";
import { prisma } from "../../db.js";
import { notFound } from "../../lib/http-error.js";
import { paths } from "../../lib/locales.js";
import { recordRedirect } from "../../lib/redirects.js";
import { categoryUpdateSchema } from "../../lib/validation.js";

export const adminCategoriesRouter = Router();

adminCategoriesRouter.get("/", async (_req, res) => {
  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { products: true } } },
  });
  res.json(categories);
});

adminCategoriesRouter.get("/:id", async (req, res) => {
  const category = await prisma.category.findUnique({ where: { id: req.params.id } });
  if (!category) throw notFound("Category");
  res.json(category);
});

adminCategoriesRouter.patch("/:id", async (req, res) => {
  const data = categoryUpdateSchema.parse(req.body);
  const existing = await prisma.category.findUnique({
    where: { id: req.params.id },
    include: { products: { where: { isPublished: true }, select: { slug: true } } },
  });
  if (!existing) throw notFound("Category");
  const updated = await prisma.$transaction(async (tx) => {
    if (data.slug && data.slug !== existing.slug) {
      await recordRedirect(tx, paths.category(existing.slug), paths.category(data.slug));
      for (const p of existing.products) {
        await recordRedirect(tx, paths.product(existing.slug, p.slug), paths.product(data.slug, p.slug));
      }
    }
    return tx.category.update({ where: { id: existing.id }, data });
  });
  res.json(updated);
});

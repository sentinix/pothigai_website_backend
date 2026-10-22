import { Router } from "express";
import { prisma } from "../../db.js";
import { HttpError, notFound } from "../../lib/http-error.js";
import { paths } from "../../lib/locales.js";
import { recordRedirect } from "../../lib/redirects.js";
import {
  productDescriptionTemplate,
  productLongDescriptionTemplate,
  productTitleTemplate,
} from "../../lib/seo-templates.js";
import { productCreateSchema, productUpdateSchema } from "../../lib/validation.js";

export const adminProductsRouter = Router();

adminProductsRouter.get("/", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const products = await prisma.product.findMany({
    where: q
      ? {
          OR: [
            { nameEn: { contains: q, mode: "insensitive" } },
            { nameTa: { contains: q, mode: "insensitive" } },
            { sku: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    include: { category: { select: { slug: true, nameEn: true } }, images: { take: 1, orderBy: { sortOrder: "asc" } } },
    orderBy: { updatedAt: "desc" },
  });
  res.json(products);
});

adminProductsRouter.get("/:id", async (req, res) => {
  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
    include: { category: true, images: { orderBy: { sortOrder: "asc" } } },
  });
  if (!product) throw notFound("Product");
  res.json(product);
});

async function assertCategory(categoryId: string) {
  const c = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!c) throw new HttpError(400, "validation_error", "Unknown category", { fields: [{ path: "categoryId", code: "unknown_category" }] });
  return c;
}

adminProductsRouter.post("/", async (req, res) => {
  const { images, ...data } = productCreateSchema.parse(req.body);
  await assertCategory(data.categoryId);
  const product = await prisma.product.create({
    data: {
      ...data,
      publishedAt: data.isPublished ? new Date() : null,
      images: images ? { create: images.map((img, i) => ({ ...img, sortOrder: i })) } : undefined,
    },
    include: { images: true, category: true },
  });
  res.status(201).json(product);
});

adminProductsRouter.patch("/:id", async (req, res) => {
  const { images, ...data } = productUpdateSchema.parse(req.body);
  const existing = await prisma.product.findUnique({ where: { id: req.params.id }, include: { category: true } });
  if (!existing) throw notFound("Product");
  const category = data.categoryId ? await assertCategory(data.categoryId) : existing.category;

  const product = await prisma.$transaction(async (tx) => {
    if (images) {
      await tx.productImage.deleteMany({ where: { productId: existing.id } });
      await tx.productImage.createMany({
        data: images.map((img, i) => ({ ...img, productId: existing.id, sortOrder: i })),
      });
    }
    const oldPath = paths.product(existing.category.slug, existing.slug);
    const newPath = paths.product(category.slug, data.slug ?? existing.slug);
    if (oldPath !== newPath && existing.isPublished) await recordRedirect(tx, oldPath, newPath);
    return tx.product.update({
      where: { id: existing.id },
      data: {
        ...data,
        publishedAt: data.isPublished && !existing.publishedAt ? new Date() : undefined,
      },
      include: { images: { orderBy: { sortOrder: "asc" } }, category: true },
    });
  });
  res.json(product);
});

adminProductsRouter.delete("/:id", async (req, res) => {
  const orders = await prisma.orderItem.count({ where: { productId: req.params.id } });
  if (orders > 0) {
    throw new HttpError(409, "has_orders", "This product has orders. Unpublish it instead of deleting it.");
  }
  await prisma.product.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

/** Suggested SEO copy built from the brand templates. Never saved automatically. */
adminProductsRouter.post("/suggest-seo", async (req, res) => {
  const body = req.body as { nameEn?: unknown; nameTa?: unknown; categoryId?: unknown };
  if (typeof body.nameEn !== "string" || typeof body.categoryId !== "string") {
    throw new HttpError(400, "validation_error", "nameEn and categoryId are required");
  }
  const category = await assertCategory(body.categoryId);
  const nameTa = typeof body.nameTa === "string" && body.nameTa.trim() ? body.nameTa.trim() : null;
  res.json({
    seoTitleEn: productTitleTemplate(body.nameEn, "en"),
    metaDescriptionEn: productDescriptionTemplate(body.nameEn, category.slug, "en"),
    descriptionEn: productLongDescriptionTemplate(body.nameEn, category.slug, "en"),
    seoTitleTa: nameTa ? productTitleTemplate(nameTa, "ta") : null,
    metaDescriptionTa: nameTa ? productDescriptionTemplate(nameTa, category.slug, "ta") : null,
    descriptionTa: nameTa ? productLongDescriptionTemplate(nameTa, category.slug, "ta") : null,
  });
});


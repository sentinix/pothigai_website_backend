import { Router } from "express";
import { prisma } from "../../db.js";
import { HttpError, notFound } from "../../lib/http-error.js";
import { blogLocales, paths } from "../../lib/locales.js";
import { recordRedirect } from "../../lib/redirects.js";
import { blogCreateSchema, blogPostSchema } from "../../lib/validation.js";

export const adminBlogRouter = Router();

adminBlogRouter.get("/", async (_req, res) => {
  const posts = await prisma.blogPost.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      slug: true,
      titleEn: true,
      titleTa: true,
      status: true,
      publishedAt: true,
      updatedAt: true,
      bodyEn: true,
      bodyTa: true,
      category: { select: { nameEn: true } },
    },
  });
  res.json(
    posts.map(({ bodyEn, bodyTa, ...p }) => ({ ...p, locales: blogLocales({ ...p, bodyEn, bodyTa }) })),
  );
});

adminBlogRouter.get("/:id", async (req, res) => {
  const post = await prisma.blogPost.findUnique({
    where: { id: req.params.id },
    include: { relatedProducts: { select: { id: true, nameEn: true, sku: true } } },
  });
  if (!post) throw notFound("Post");
  res.json(post);
});

function assertPublishable(post: { titleEn: string; bodyEn: string | null; titleTa: string | null; bodyTa: string | null }) {
  if (blogLocales(post).length === 0) {
    throw new HttpError(400, "validation_error", "Add a full article body in English or Tamil before publishing", {
      fields: [{ path: "bodyEn", code: "required_to_publish" }],
    });
  }
}

adminBlogRouter.post("/", async (req, res) => {
  blogCreateSchema.parse(req.body);
  const { relatedProductIds, ...data } = blogPostSchema.parse(req.body);
  if (data.status === "PUBLISHED") assertPublishable({ titleEn: data.titleEn!, bodyEn: data.bodyEn ?? null, titleTa: data.titleTa ?? null, bodyTa: data.bodyTa ?? null });
  const post = await prisma.blogPost.create({
    data: {
      ...(data as typeof data & { slug: string; titleEn: string }),
      publishedAt: data.status === "PUBLISHED" ? new Date() : null,
      relatedProducts: relatedProductIds ? { connect: relatedProductIds.map((id) => ({ id })) } : undefined,
    },
  });
  res.status(201).json(post);
});

adminBlogRouter.patch("/:id", async (req, res) => {
  const { relatedProductIds, ...data } = blogPostSchema.parse(req.body);
  const existing = await prisma.blogPost.findUnique({ where: { id: req.params.id } });
  if (!existing) throw notFound("Post");
  const merged = { ...existing, ...data };
  if (merged.status === "PUBLISHED") assertPublishable(merged);
  const post = await prisma.$transaction(async (tx) => {
    if (data.slug && data.slug !== existing.slug && existing.status === "PUBLISHED") {
      await recordRedirect(tx, paths.blogPost(existing.slug), paths.blogPost(data.slug));
    }
    return tx.blogPost.update({
      where: { id: existing.id },
      data: {
        ...data,
        publishedAt: data.status === "PUBLISHED" && !existing.publishedAt ? new Date() : undefined,
        relatedProducts: relatedProductIds ? { set: relatedProductIds.map((id) => ({ id })) } : undefined,
      },
    });
  });
  res.json(post);
});

adminBlogRouter.delete("/:id", async (req, res) => {
  await prisma.blogPost.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

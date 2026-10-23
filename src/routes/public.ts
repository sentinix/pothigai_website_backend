import { randomBytes } from "node:crypto";
import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { HttpError, notFound } from "../lib/http-error.js";
import { blogLocales, parseLocale } from "../lib/locales.js";
import {
  MAX_ORDER_QUANTITY,
  effectivePrice,
  serializeBlogCard,
  serializeBlogPost,
  serializeCategory,
  serializeProductCard,
  serializeProductDetail,
} from "../lib/serializers.js";
import { buildSitemapEntries } from "../lib/sitemap.js";
import { isAdminRequest } from "../middleware/auth.js";
import { orderCreateSchema, pageBodySchemas, type PageKey } from "../lib/validation.js";

export const publicRouter = Router();

const PAGE_SIZE = 24;
const productInclude = { images: { orderBy: { sortOrder: "asc" } }, category: true } as const;
const publishedProduct = { isPublished: true, category: { isPublished: true } } satisfies Prisma.ProductWhereInput;

const SORTS: Record<string, Prisma.ProductOrderByWithRelationInput[]> = {
  featured: [{ isFeatured: "desc" }, { createdAt: "desc" }],
  newest: [{ createdAt: "desc" }],
  "price-asc": [{ price: "asc" }],
  "price-desc": [{ price: "desc" }],
  name: [{ nameEn: "asc" }],
};

const pageParam = z.coerce.number().int().min(1).max(1000).catch(1);

publicRouter.get("/settings", async (_req, res) => {
  const s = await prisma.siteSettings.findUnique({ where: { id: "default" } });
  res.json({
    contactEmail: s?.contactEmail ?? null,
    contactPhone: s?.contactPhone ?? null,
    whatsappNumber: s?.whatsappNumber ?? null,
    address:
      s?.showAddress && s.streetAddress
        ? {
            streetAddress: s.streetAddress,
            addressLocality: s.addressLocality,
            addressRegion: s.addressRegion,
            postalCode: s.postalCode,
          }
        : null,
    deliveryInfo: { en: s?.deliveryInfoEn ?? null, ta: s?.deliveryInfoTa ?? null },
    returnPolicy: { en: s?.returnPolicyEn ?? null, ta: s?.returnPolicyTa ?? null },
    flatShippingFee: Number(s?.flatShippingFee ?? 0).toFixed(2),
    codEnabled: s?.codEnabled ?? true,
    socialLinks: s?.socialLinks ?? [],
  });
});

publicRouter.get("/pages/:key", async (req, res) => {
  const key = req.params.key as PageKey;
  if (!(key in pageBodySchemas)) throw notFound("Page");
  const rows = await prisma.pageContent.findMany({ where: { key } });
  const locale = parseLocale(req.query.locale);
  const row = rows.find((r) => r.locale === locale) ?? rows.find((r) => r.locale === "en");
  if (!row) throw notFound("Page");
  res.json({
    key,
    locale: row.locale,
    seoTitle: row.seoTitle,
    metaDescription: row.metaDescription,
    h1: row.h1,
    body: row.body,
    robotsIndex: row.robotsIndex,
    locales: rows.map((r) => r.locale),
    translationFallback: row.locale !== locale,
    updatedAt: row.updatedAt.toISOString(),
  });
});

publicRouter.get("/categories", async (req, res) => {
  const locale = parseLocale(req.query.locale);
  const categories = await prisma.category.findMany({
    where: { isPublished: true },
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { products: { where: { isPublished: true } } } } },
  });
  res.json(categories.map((c) => ({ ...serializeCategory(c, locale), productCount: c._count.products })));
});

publicRouter.get("/categories/:slug", async (req, res) => {
  const locale = parseLocale(req.query.locale);
  const category = await prisma.category.findFirst({ where: { slug: req.params.slug, isPublished: true } });
  if (!category) throw notFound("Category");
  const sortKey = typeof req.query.sort === "string" && req.query.sort in SORTS ? req.query.sort : "featured";
  const page = pageParam.parse(req.query.page);
  const where = { ...publishedProduct, categoryId: category.id };
  const [total, products, posts] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: productInclude,
      orderBy: [...SORTS[sortKey], { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.blogPost.findMany({
      where: { status: "PUBLISHED", publishedAt: { lte: new Date() }, categoryId: category.id },
      include: { category: true },
      orderBy: { publishedAt: "desc" },
      take: 3,
    }),
  ]);
  res.json({
    category: serializeCategory(category, locale),
    products: products.map((p) => serializeProductCard(p, locale)),
    pagination: { page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) },
    sort: sortKey,
    blogPosts: posts.filter((b) => blogLocales(b).length > 0).map((b) => serializeBlogCard(b, locale)),
  });
});

publicRouter.get("/products", async (req, res) => {
  const locale = parseLocale(req.query.locale);
  if (typeof req.query.ids === "string") {
    const ids = req.query.ids.split(",").filter(Boolean).slice(0, 50);
    const products = await prisma.product.findMany({ where: { ...publishedProduct, id: { in: ids } }, include: productInclude });
    return res.json(products.map((p) => serializeProductCard(p, locale)));
  }
  const limit = z.coerce.number().int().min(1).max(24).catch(8).parse(req.query.limit);
  const featured = req.query.featured === "1";
  let products = await prisma.product.findMany({
    where: { ...publishedProduct, ...(featured ? { isFeatured: true } : {}) },
    include: productInclude,
    orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
  // Homepage falls back to the newest products when none are flagged as featured.
  if (featured && products.length === 0) {
    products = await prisma.product.findMany({
      where: publishedProduct,
      include: productInclude,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }
  res.json(products.map((p) => serializeProductCard(p, locale)));
});

publicRouter.get("/products/:slug", async (req, res) => {
  const locale = parseLocale(req.query.locale);
  // Admins can preview unpublished products; the storefront marks previews noindex.
  const preview = req.query.preview === "1" && isAdminRequest(req);
  const product = await prisma.product.findFirst({
    where: preview ? { slug: req.params.slug } : { ...publishedProduct, slug: req.params.slug },
    include: productInclude,
  });
  if (!product) throw notFound("Product");
  const [related, posts] = await Promise.all([
    prisma.product.findMany({
      where: { ...publishedProduct, categoryId: product.categoryId, id: { not: product.id } },
      include: productInclude,
      orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
      take: 4,
    }),
    prisma.blogPost.findMany({
      where: {
        status: "PUBLISHED",
        publishedAt: { lte: new Date() },
        OR: [{ relatedProducts: { some: { id: product.id } } }, { categoryId: product.categoryId }],
      },
      include: { category: true },
      orderBy: { publishedAt: "desc" },
      take: 3,
    }),
  ]);
  res.json({
    product: serializeProductDetail(product, locale),
    related: related.map((p) => serializeProductCard(p, locale)),
    blogPosts: posts.filter((b) => blogLocales(b).length > 0).map((b) => serializeBlogCard(b, locale)),
  });
});

publicRouter.get("/search", async (req, res) => {
  const locale = parseLocale(req.query.locale);
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  if (q.length < 2) return res.json({ query: q, products: [] });
  const contains = { contains: q, mode: "insensitive" as const };
  const products = await prisma.product.findMany({
    where: {
      ...publishedProduct,
      OR: [
        { nameEn: contains },
        { nameTa: contains },
        { sku: contains },
        { shortDescriptionEn: contains },
        { shortDescriptionTa: contains },
        { category: { nameEn: contains } },
        { category: { nameTa: contains } },
      ],
    },
    include: productInclude,
    orderBy: [{ isFeatured: "desc" }, { nameEn: "asc" }],
    take: 48,
  });
  res.json({ query: q, products: products.map((p) => serializeProductCard(p, locale)) });
});

publicRouter.get("/blog", async (req, res) => {
  const locale = parseLocale(req.query.locale);
  const page = pageParam.parse(req.query.page);
  const where = { status: "PUBLISHED" as const, publishedAt: { lte: new Date() } };
  const [total, posts] = await Promise.all([
    prisma.blogPost.count({ where }),
    prisma.blogPost.findMany({
      where,
      include: { category: true },
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * 12,
      take: 12,
    }),
  ]);
  res.json({
    posts: posts.filter((b) => blogLocales(b).length > 0).map((b) => serializeBlogCard(b, locale)),
    pagination: { page, pageSize: 12, total, totalPages: Math.max(1, Math.ceil(total / 12)) },
  });
});

publicRouter.get("/blog/:slug", async (req, res) => {
  const locale = parseLocale(req.query.locale);
  const preview = req.query.preview === "1" && isAdminRequest(req);
  const post = await prisma.blogPost.findFirst({
    where: preview ? { slug: req.params.slug } : { slug: req.params.slug, status: "PUBLISHED", publishedAt: { lte: new Date() } },
    include: { category: true, relatedProducts: { include: productInclude } },
  });
  if (!post || blogLocales(post).length === 0) throw notFound("Post");
  res.json(serializeBlogPost(post, locale));
});

publicRouter.get("/redirects", async (req, res) => {
  const path = typeof req.query.path === "string" ? req.query.path : "";
  const normalized = path.endsWith("/") ? path : `${path}/`;
  const redirect = await prisma.slugRedirect.findUnique({ where: { fromPath: normalized } });
  if (!redirect) throw notFound("Redirect");
  res.json({ toPath: redirect.toPath });
});

publicRouter.get("/sitemap", async (_req, res) => {
  res.json(await buildSitemapEntries());
});

function orderNumber(): string {
  const d = new Date();
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `PN-${ymd}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

publicRouter.post("/orders", async (req, res) => {
  const input = orderCreateSchema.parse(req.body);
  const settings = await prisma.siteSettings.findUnique({ where: { id: "default" } });
  if (settings && !settings.codEnabled) {
    throw new HttpError(503, "ordering_unavailable", "Online ordering is temporarily unavailable");
  }

  // Merge duplicate lines so stock checks see the real quantity.
  const quantities = new Map<string, number>();
  for (const item of input.items) quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);

  const order = await prisma.$transaction(async (tx) => {
    const products = await tx.product.findMany({
      where: { ...publishedProduct, id: { in: [...quantities.keys()] } },
    });
    const lines = [];
    for (const [productId, quantity] of quantities) {
      const product = products.find((p) => p.id === productId);
      if (!product) throw new HttpError(409, "product_unavailable", "A product in your cart is no longer available", { productId });
      if (quantity > MAX_ORDER_QUANTITY) throw new HttpError(400, "quantity_limit", "Quantity limit exceeded", { productId });
      // Conditional decrement prevents overselling under concurrent checkouts.
      const updated = await tx.product.updateMany({
        where: { id: productId, stockQuantity: { gte: quantity } },
        data: { stockQuantity: { decrement: quantity } },
      });
      if (updated.count === 0) throw new HttpError(409, "out_of_stock", "Not enough stock", { productId });
      const unitPrice = effectivePrice(product);
      lines.push({
        productId,
        sku: product.sku,
        name: product.nameEn,
        unitPrice,
        quantity,
        lineTotal: unitPrice.mul(quantity),
      });
    }
    const subtotal = lines.reduce((sum, l) => sum.add(l.lineTotal), new Prisma.Decimal(0));
    const shippingFee = settings?.flatShippingFee ?? new Prisma.Decimal(0);
    return tx.order.create({
      data: {
        orderNumber: orderNumber(),
        publicToken: randomBytes(24).toString("base64url"),
        customerName: input.customerName,
        phone: input.phone,
        email: input.email ?? null,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2 ?? null,
        city: input.city,
        state: input.state,
        pincode: input.pincode,
        notes: input.notes ?? null,
        locale: input.locale,
        subtotal,
        shippingFee,
        total: subtotal.add(shippingFee),
        items: { create: lines },
      },
    });
  });

  res.status(201).json({ orderNumber: order.orderNumber, token: order.publicToken });
});

// Confirmation data for the customer's thank-you page. No address or contact
// details are returned, so a leaked link exposes nothing personal.
publicRouter.get("/orders/:token", async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { publicToken: req.params.token },
    include: { items: { include: { product: { include: { category: true } } } } },
  });
  if (!order) throw notFound("Order");
  res.json({
    orderNumber: order.orderNumber,
    status: order.status,
    paymentMethod: order.paymentMethod,
    subtotal: order.subtotal.toFixed(2),
    shippingFee: order.shippingFee.toFixed(2),
    total: order.total.toFixed(2),
    currency: order.currency,
    createdAt: order.createdAt.toISOString(),
    items: order.items.map((i) => ({
      productId: i.productId,
      sku: i.sku,
      name: i.name,
      category: i.product.category.nameEn,
      unitPrice: i.unitPrice.toFixed(2),
      quantity: i.quantity,
      lineTotal: i.lineTotal.toFixed(2),
    })),
  });
});

// Atomically claims the one-time GA4 purchase event for an order so reloads,
// other tabs or devices never report the same purchase twice.
publicRouter.post("/orders/:token/analytics", async (req, res) => {
  const claimed = await prisma.order.updateMany({
    where: { publicToken: req.params.token, analyticsTrackedAt: null },
    data: { analyticsTrackedAt: new Date() },
  });
  res.json({ shouldTrack: claimed.count === 1 });
});

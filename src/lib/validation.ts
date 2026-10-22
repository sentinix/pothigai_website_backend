import { z } from "zod";
import { config } from "../config.js";

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Plain text: trims, strips control characters and HTML tags. */
export const cleanText = (s: string) => s.replace(CONTROL_CHARS, "").replace(/<[^>]*>/g, "").trim();
/** Markdown: keeps formatting characters; the storefront never renders raw HTML. */
const cleanMarkdown = (s: string) => s.replace(CONTROL_CHARS, "").trim();

const text = (max: number) => z.string().max(max, "too_long").transform(cleanText);
const requiredText = (max: number) => text(max).pipe(z.string().min(1, "required"));
/** Optional text: "" and null become null so editors can clear a field. */
const optionalText = (max: number) =>
  z
    .union([z.string().max(max, "too_long"), z.null()])
    .transform((v) => (v === null ? null : cleanText(v) || null))
    .optional();
const optionalMarkdown = (max: number) =>
  z
    .union([z.string().max(max, "too_long"), z.null()])
    .transform((v) => (v === null ? null : cleanMarkdown(v) || null))
    .optional();

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(100, "too_long")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "invalid_slug");

export const RESERVED_SLUGS = ["blog", "about", "contact", "search", "cart", "checkout", "order", "admin", "api"];

const money = z.coerce
  .number({ invalid_type_error: "invalid_number" })
  .nonnegative("must_be_positive")
  .max(1_000_000, "too_large")
  .transform((n) => Math.round(n * 100) / 100);

/** Canonical overrides must be absolute URLs on the storefront's own host. */
const canonicalUrl = z
  .union([z.string().trim().max(500), z.null()])
  .transform((v) => (v ? v : null))
  .refine((v) => {
    if (v === null) return true;
    try {
      const u = new URL(v);
      return (u.protocol === "https:" || u.protocol === "http:") && u.host === new URL(config.siteUrl).host;
    } catch {
      return false;
    }
  }, "canonical_must_be_same_site_absolute_url")
  .optional();

const imageUrl = z
  .union([z.string().trim().max(500), z.null()])
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^https?:\/\//.test(v) || v.startsWith("/uploads/"), "invalid_image_url")
  .optional();

export const PACK_UNITS = ["g", "kg", "ml", "l", "pcs", "pack"] as const;

const productImage = z.object({
  url: z.string().trim().max(500).refine((v) => /^https?:\/\//.test(v) || v.startsWith("/uploads/"), "invalid_image_url"),
  altEn: optionalText(160),
  altTa: optionalText(160),
  width: z.number().int().positive().max(10000).nullable().optional(),
  height: z.number().int().positive().max(10000).nullable().optional(),
});

const productFields = {
  slug: slugSchema,
  sku: z.string().trim().max(64).regex(/^[A-Za-z0-9._-]+$/, "invalid_sku"),
  categoryId: z.string().min(1, "required").max(40),
  nameEn: requiredText(120),
  nameTa: optionalText(120),
  shortDescriptionEn: optionalText(300),
  shortDescriptionTa: optionalText(300),
  descriptionEn: optionalText(5000),
  descriptionTa: optionalText(5000),
  seoTitleEn: optionalText(70),
  seoTitleTa: optionalText(90),
  metaDescriptionEn: optionalText(170),
  metaDescriptionTa: optionalText(220),
  price: money.refine((n) => n > 0, "must_be_positive"),
  salePrice: z.union([money, z.null()]).optional(),
  stockQuantity: z.coerce.number().int("invalid_number").min(0).max(1_000_000),
  packSize: z.union([z.coerce.number().positive().max(100000), z.null()]).optional(),
  packUnit: z.union([z.enum(PACK_UNITS), z.null()]).optional(),
  ingredientsEn: optionalText(1000),
  ingredientsTa: optionalText(1000),
  originEn: optionalText(160),
  originTa: optionalText(160),
  originVerified: z.boolean().optional(),
  extractionMethodEn: optionalText(160),
  extractionMethodTa: optionalText(160),
  gradeEn: optionalText(160),
  gradeTa: optionalText(160),
  storageEn: optionalText(1000),
  storageTa: optionalText(1000),
  cookingEn: optionalText(2000),
  cookingTa: optionalText(2000),
  allergensEn: optionalText(500),
  allergensTa: optionalText(500),
  shippingInfoEn: optionalText(1000),
  shippingInfoTa: optionalText(1000),
  canonicalOverride: canonicalUrl,
  robotsIndex: z.boolean().optional(),
  isPublished: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  images: z.array(productImage).max(12).optional(),
};

const salePriceBelowPrice = (d: { price?: number; salePrice?: number | null }) =>
  d.salePrice == null || d.price == null || d.salePrice < d.price;

export const productCreateSchema = z
  .object(productFields)
  .strict()
  .refine((d) => !RESERVED_SLUGS.includes(d.slug), { message: "reserved_slug", path: ["slug"] })
  .refine(salePriceBelowPrice, { message: "sale_price_must_be_below_price", path: ["salePrice"] });

// PATCH semantics: only provided fields change, so saving SEO metadata never
// touches price, stock or other product data.
export const productUpdateSchema = z
  .object(productFields)
  .partial()
  .strict()
  .refine((d) => !d.slug || !RESERVED_SLUGS.includes(d.slug), { message: "reserved_slug", path: ["slug"] })
  .refine(salePriceBelowPrice, { message: "sale_price_must_be_below_price", path: ["salePrice"] });

const faq = z.object({
  qEn: requiredText(300),
  aEn: requiredText(2000),
  qTa: optionalText(300),
  aTa: optionalText(2000),
});

export const categoryUpdateSchema = z
  .object({
    slug: slugSchema.refine((s) => !RESERVED_SLUGS.includes(s), "reserved_slug"),
    sortOrder: z.coerce.number().int().min(0).max(1000),
    nameEn: requiredText(80),
    nameTa: optionalText(120),
    h1En: optionalText(120),
    h1Ta: optionalText(160),
    seoTitleEn: optionalText(70),
    seoTitleTa: optionalText(90),
    metaDescriptionEn: optionalText(170),
    metaDescriptionTa: optionalText(220),
    introEn: optionalText(3000),
    introTa: optionalText(3000),
    primaryKeyword: optionalText(100),
    supportingKeywords: z.array(text(100)).max(20),
    faqs: z.array(faq).max(20),
    imageUrl,
    imageAltEn: optionalText(160),
    imageAltTa: optionalText(160),
    canonicalOverride: canonicalUrl,
    robotsIndex: z.boolean(),
    isPublished: z.boolean(),
  })
  .partial()
  .strict();

export const blogPostSchema = z
  .object({
    slug: slugSchema,
    titleEn: requiredText(160),
    titleTa: optionalText(200),
    excerptEn: optionalText(400),
    excerptTa: optionalText(500),
    bodyEn: optionalMarkdown(60000),
    bodyTa: optionalMarkdown(80000),
    authorName: requiredText(80),
    featuredImageUrl: imageUrl,
    featuredImageAltEn: optionalText(160),
    featuredImageAltTa: optionalText(160),
    seoTitleEn: optionalText(70),
    seoTitleTa: optionalText(90),
    metaDescriptionEn: optionalText(170),
    metaDescriptionTa: optionalText(220),
    categoryId: z.union([z.string().max(40), z.null()]).optional(),
    relatedProductIds: z.array(z.string().max(40)).max(12),
    status: z.enum(["DRAFT", "PUBLISHED"]),
    canonicalOverride: canonicalUrl,
    robotsIndex: z.boolean(),
  })
  .partial()
  .strict();

export const blogCreateSchema = z.object({ slug: slugSchema, titleEn: requiredText(160) }).passthrough();

const homeBody = z
  .object({
    tagline: requiredText(160),
    intro: requiredText(3000),
    sections: z
      .array(
        z.object({
          heading: requiredText(120),
          body: requiredText(1500),
          categorySlugs: z.array(slugSchema).max(6).default([]),
        }),
      )
      .max(12),
    featuredHeading: requiredText(120),
    whyHeading: requiredText(120),
    whyPoints: z.array(requiredText(300)).max(12),
    ctaHeading: requiredText(120),
    ctaBody: requiredText(1500),
  })
  .strict();

const sectionsBody = z
  .object({
    sections: z.array(z.object({ heading: requiredText(120), body: requiredText(5000) })).max(20),
  })
  .strict();

const contactBody = z.object({ intro: requiredText(2000) }).strict();

export const pageBodySchemas = { home: homeBody, about: sectionsBody, contact: contactBody } as const;
export type PageKey = keyof typeof pageBodySchemas;

export const pageContentSchema = z
  .object({
    seoTitle: requiredText(90),
    metaDescription: requiredText(220),
    h1: requiredText(200),
    body: z.unknown(),
    robotsIndex: z.boolean().optional(),
  })
  .strict();

const optionalEmail = z
  .union([z.string().trim().max(200), z.null()])
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || z.string().email().safeParse(v).success, "invalid_email")
  .optional();

const optionalPhone = z
  .union([z.string().trim().max(20), z.null()])
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\+?[0-9 -]{8,16}$/.test(v), "invalid_phone")
  .optional();

export const settingsSchema = z
  .object({
    contactEmail: optionalEmail,
    contactPhone: optionalPhone,
    whatsappNumber: optionalPhone,
    streetAddress: optionalText(200),
    addressLocality: optionalText(100),
    addressRegion: optionalText(100),
    postalCode: z
      .union([z.string().trim().regex(/^[0-9]{6}$/, "invalid_pincode"), z.literal(""), z.null()])
      .transform((v) => (v ? v : null))
      .optional(),
    showAddress: z.boolean().optional(),
    deliveryInfoEn: optionalText(2000),
    deliveryInfoTa: optionalText(2000),
    returnPolicyEn: optionalText(3000),
    returnPolicyTa: optionalText(3000),
    flatShippingFee: money.optional(),
    codEnabled: z.boolean().optional(),
    socialLinks: z.array(z.string().trim().url("invalid_url").max(300)).max(10).optional(),
  })
  .strict();

export const redirectSchema = z
  .object({
    fromPath: z.string().trim().max(300).regex(/^\/[a-z0-9\-/]*\/$/, "path_must_start_and_end_with_slash"),
    toPath: z.string().trim().max(300).regex(/^\/[a-z0-9\-/]*\/$/, "path_must_start_and_end_with_slash"),
  })
  .strict()
  .refine((d) => d.fromPath !== d.toPath, { message: "redirect_loop", path: ["toPath"] });

export const orderCreateSchema = z
  .object({
    customerName: requiredText(100),
    phone: z
      .string()
      .trim()
      .transform((v) => v.replace(/[\s-]/g, ""))
      .pipe(z.string().regex(/^(?:\+91|0)?[6-9][0-9]{9}$/, "invalid_phone")),
    email: z
      .union([z.string().trim().max(200), z.null()])
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || z.string().email().safeParse(v).success, "invalid_email")
      .optional(),
    addressLine1: requiredText(200),
    addressLine2: optionalText(200),
    city: requiredText(100),
    state: requiredText(100),
    pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, "invalid_pincode"),
    notes: optionalText(1000),
    locale: z.enum(["en", "ta"]).default("en"),
    items: z
      .array(z.object({ productId: z.string().min(1).max(40), quantity: z.number().int().min(1).max(50) }).strict())
      .min(1, "cart_empty")
      .max(50),
  })
  .strict();

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("invalid_email").max(200),
  password: z.string().min(1, "required").max(200),
});

export const orderStatusSchema = z
  .object({
    status: z.enum(["PENDING", "CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED"]).optional(),
    paymentStatus: z.enum(["UNPAID", "PAID", "REFUNDED"]).optional(),
  })
  .strict();

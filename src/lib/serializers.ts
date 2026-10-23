// Shapes data for the public storefront API. Only customer-facing fields are
// exposed: no exact stock counts, internal keywords or timestamps of drafts.

import type { BlogPost, Category, Prisma, Product, ProductImage } from "@prisma/client";
import { config } from "../config.js";
import {
  blogLocales,
  categoryLocales,
  hasText,
  pick,
  productLocales,
  type Locale,
} from "./locales.js";
import { BRAND, blogTitleTemplate, productDescriptionTemplate, productTitleTemplate } from "./seo-templates.js";

export const MAX_ORDER_QUANTITY = 20;

export function absoluteMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith("/uploads/") ? `${config.publicApiUrl}${url}` : url;
}

export function packLabel(size: Prisma.Decimal | number | null, unit: string | null): string | null {
  if (size == null || !unit) return null;
  const n = Number(size);
  return `${Number.isInteger(n) ? n : n.toString()} ${unit}`;
}

const money = (d: Prisma.Decimal | null) => (d == null ? null : Number(d).toFixed(2));

/** Truncate on a word boundary so generated descriptions stay snippet-sized. */
export function truncate(s: string, max = 160): string {
  const flat = s.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 60 ? cut.lastIndexOf(" ") : cut.length)}…`;
}

type CategoryLite = Pick<Category, "slug" | "nameEn" | "nameTa">;

export function productSeo(p: Product, category: CategoryLite, locale: Locale) {
  const name = pick(p, "name", locale) ?? p.nameEn;
  const pack = packLabel(p.packSize, p.packUnit);
  const displayName = pack ? `${name} (${pack})` : name;
  const explicitTitle = locale === "ta" ? p.seoTitleTa : p.seoTitleEn;
  const explicitDesc = locale === "ta" ? p.metaDescriptionTa : p.metaDescriptionEn;
  return {
    title: hasText(explicitTitle) ? explicitTitle : productTitleTemplate(displayName, locale),
    description: hasText(explicitDesc)
      ? explicitDesc
      : productDescriptionTemplate(displayName, category.slug, locale),
    titleIsGenerated: !hasText(explicitTitle),
    descriptionIsGenerated: !hasText(explicitDesc),
  };
}

export function categorySeo(c: Category, locale: Locale) {
  const name = pick(c, "name", locale) ?? c.nameEn;
  const explicitTitle = locale === "ta" ? c.seoTitleTa : c.seoTitleEn;
  const explicitDesc = locale === "ta" ? c.metaDescriptionTa : c.metaDescriptionEn;
  const intro = pick(c, "intro", locale);
  return {
    title: hasText(explicitTitle) ? explicitTitle : `${name} | ${BRAND[locale]}`,
    description: hasText(explicitDesc) ? explicitDesc : intro ? truncate(intro) : `${name} — ${BRAND[locale]}`,
    titleIsGenerated: !hasText(explicitTitle),
    descriptionIsGenerated: !hasText(explicitDesc),
  };
}

export function blogSeo(b: BlogPost, locale: Locale) {
  const title = pick(b, "title", locale) ?? b.titleEn;
  const explicitTitle = locale === "ta" ? b.seoTitleTa : b.seoTitleEn;
  const explicitDesc = locale === "ta" ? b.metaDescriptionTa : b.metaDescriptionEn;
  const excerpt = pick(b, "excerpt", locale);
  return {
    title: hasText(explicitTitle) ? explicitTitle : blogTitleTemplate(title, locale),
    description: hasText(explicitDesc) ? explicitDesc : excerpt ? truncate(excerpt) : truncate(title),
    titleIsGenerated: !hasText(explicitTitle),
    descriptionIsGenerated: !hasText(explicitDesc),
  };
}

export function effectivePrice(p: Pick<Product, "price" | "salePrice">): Prisma.Decimal {
  return p.salePrice != null && Number(p.salePrice) < Number(p.price) ? p.salePrice : p.price;
}

function serializeImage(img: ProductImage, locale: Locale, fallbackAlt: string) {
  return {
    url: absoluteMediaUrl(img.url)!,
    alt: pick(img, "alt", locale) ?? fallbackAlt,
    width: img.width,
    height: img.height,
  };
}

export type ProductWithRelations = Product & { images: ProductImage[]; category: Category };

export function serializeProductCard(p: ProductWithRelations, locale: Locale) {
  const name = pick(p, "name", locale) ?? p.nameEn;
  const sale = p.salePrice != null && Number(p.salePrice) < Number(p.price);
  return {
    id: p.id,
    slug: p.slug,
    sku: p.sku,
    name,
    category: { slug: p.category.slug, name: pick(p.category, "name", locale) ?? p.category.nameEn },
    shortDescription: pick(p, "shortDescription", locale),
    price: money(p.price)!,
    salePrice: sale ? money(p.salePrice) : null,
    effectivePrice: money(effectivePrice(p))!,
    currency: p.currency,
    inStock: p.stockQuantity > 0,
    maxQuantity: Math.max(0, Math.min(p.stockQuantity, MAX_ORDER_QUANTITY)),
    pack: packLabel(p.packSize, p.packUnit),
    image: p.images[0] ? serializeImage(p.images[0], locale, name) : null,
  };
}

export function serializeProductDetail(p: ProductWithRelations, locale: Locale) {
  const name = pick(p, "name", locale) ?? p.nameEn;
  const locales = productLocales(p);
  const field = (base: string) => pick(p, base, locale);
  return {
    ...serializeProductCard(p, locale),
    nameEn: p.nameEn,
    description: field("description"),
    images: [...p.images].sort((a, b) => a.sortOrder - b.sortOrder).map((i) => serializeImage(i, locale, name)),
    details: {
      grade: field("grade"),
      ingredients: field("ingredients"),
      origin: p.originVerified ? field("origin") : null,
      extractionMethod: field("extractionMethod"),
      storage: field("storage"),
      cooking: field("cooking"),
      allergens: field("allergens"),
      shippingInfo: field("shippingInfo"),
    },
    locales,
    translationFallback: !locales.includes(locale),
    seo: {
      ...productSeo(p, p.category, locale),
      robotsIndex: p.robotsIndex,
      canonicalOverride: p.canonicalOverride,
    },
    updatedAt: p.updatedAt.toISOString(),
  };
}

type Faq = { qEn: string; aEn: string; qTa?: string | null; aTa?: string | null };

export function serializeCategory(c: Category, locale: Locale) {
  const faqs = (Array.isArray(c.faqs) ? (c.faqs as unknown as Faq[]) : []).map((f) => ({
    q: locale === "ta" && hasText(f.qTa) && hasText(f.aTa) ? f.qTa : f.qEn,
    a: locale === "ta" && hasText(f.qTa) && hasText(f.aTa) ? f.aTa : f.aEn,
  }));
  const locales = categoryLocales(c);
  return {
    id: c.id,
    slug: c.slug,
    name: pick(c, "name", locale) ?? c.nameEn,
    h1: pick(c, "h1", locale) ?? pick(c, "name", locale) ?? c.nameEn,
    intro: pick(c, "intro", locale),
    faqs,
    image: c.imageUrl
      ? { url: absoluteMediaUrl(c.imageUrl)!, alt: pick(c, "imageAlt", locale) ?? (pick(c, "name", locale) ?? c.nameEn) }
      : null,
    locales,
    translationFallback: !locales.includes(locale),
    seo: { ...categorySeo(c, locale), robotsIndex: c.robotsIndex, canonicalOverride: c.canonicalOverride },
    updatedAt: c.updatedAt.toISOString(),
  };
}

/** Rough reading time; Tamil words are longer, so a lower rate is used. */
export function readingMinutes(body: string | null, locale: Locale): number | null {
  if (!body) return null;
  const words = body.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / (locale === "ta" ? 140 : 200)));
}

export function serializeBlogCard(b: BlogPost & { category?: Category | null }, locale: Locale) {
  const available = blogLocales(b);
  const effective: Locale = available.includes(locale) ? locale : (available[0] ?? "en");
  return {
    slug: b.slug,
    title: pick(b, "title", effective) ?? b.titleEn,
    excerpt: pick(b, "excerpt", effective),
    authorName: b.authorName,
    image: b.featuredImageUrl
      ? { url: absoluteMediaUrl(b.featuredImageUrl)!, alt: pick(b, "featuredImageAlt", effective) ?? b.titleEn }
      : null,
    category: b.category ? { slug: b.category.slug, name: pick(b.category, "name", locale) ?? b.category.nameEn } : null,
    publishedAt: b.publishedAt?.toISOString() ?? null,
    updatedAt: b.updatedAt.toISOString(),
    locales: available,
  };
}

export function serializeBlogPost(
  b: BlogPost & { category: Category | null; relatedProducts: ProductWithRelations[] },
  locale: Locale,
) {
  const body = locale === "ta" ? b.bodyTa : b.bodyEn;
  return {
    ...serializeBlogCard(b, locale),
    body,
    readingMinutes: readingMinutes(body, locale),
    relatedProducts: b.relatedProducts
      .filter((p) => p.isPublished)
      .map((p) => serializeProductCard(p, locale)),
    seo: { ...blogSeo(b, locale), robotsIndex: b.robotsIndex, canonicalOverride: b.canonicalOverride },
  };
}

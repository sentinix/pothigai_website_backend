// Automated, data-level SEO checks. Everything here is computed from the
// database; it says nothing about rankings or Google's index (that needs
// Search Console). Live HTML checks live in live-audit.ts.

import { prisma } from "../db.js";
import { config } from "../config.js";
import { blogLocales, categoryLocales, hasText, LOCALES, paths, productLocales, type Locale } from "./locales.js";
import { blogSeo, categorySeo, productSeo } from "./serializers.js";
import { buildSitemapEntries } from "./sitemap.js";

export type Severity = "error" | "warning" | "info";

export interface AuditIssue {
  severity: Severity;
  check: string;
  entityType: "page" | "category" | "product" | "blog" | "sitemap";
  entityId: string;
  entityName: string;
  locale: Locale | null;
  url: string | null;
  message: string;
  adminPath: string;
}

interface Indexable {
  title: string;
  description: string;
  url: string;
  entityType: AuditIssue["entityType"];
  entityId: string;
  entityName: string;
  locale: Locale;
  adminPath: string;
}

const TITLE_MAX = 60;
const DESC_MIN = 70;
const DESC_MAX = 160;
// Tamil script needs more characters for the same displayed width; lengths are advisory only.
const lengthFactor = (l: Locale) => (l === "ta" ? 1.4 : 1);

export async function runSeoAudit() {
  const issues: AuditIssue[] = [];
  const indexable: Indexable[] = [];
  const url = (locale: Locale, path: string) => `${config.siteUrl}/${locale}${path}`;
  const add = (i: AuditIssue) => issues.push(i);

  const lengthChecks = (x: Indexable) => {
    const f = lengthFactor(x.locale);
    const base = { entityType: x.entityType, entityId: x.entityId, entityName: x.entityName, locale: x.locale, url: x.url, adminPath: x.adminPath };
    if (x.title.length > TITLE_MAX * f)
      add({ ...base, severity: "info", check: "title_too_long", message: `Title is ${x.title.length} characters; it may be truncated in search results.` });
    if (x.description.length > DESC_MAX * f)
      add({ ...base, severity: "info", check: "description_too_long", message: `Meta description is ${x.description.length} characters; it may be truncated.` });
    if (x.description.length < DESC_MIN * f)
      add({ ...base, severity: "info", check: "description_too_short", message: `Meta description is only ${x.description.length} characters.` });
  };

  // Fixed pages
  const pages = await prisma.pageContent.findMany();
  for (const key of ["home", "about", "contact"] as const) {
    const path = key === "home" ? paths.home() : `/${key}/`;
    for (const locale of LOCALES) {
      const row = pages.find((p) => p.key === key && p.locale === locale);
      const base = { entityType: "page" as const, entityId: key, entityName: key, locale, url: url(locale, path), adminPath: `/admin/pages/${key}/` };
      if (!row) {
        add({ ...base, severity: locale === "en" ? "error" : "warning", check: locale === "en" ? "missing_english_translation" : "missing_tamil_translation", message: `No ${locale === "en" ? "English" : "Tamil"} content for the ${key} page.` });
        continue;
      }
      if (!hasText(row.h1)) add({ ...base, severity: "error", check: "missing_h1", message: "Page has no H1 heading." });
      if (row.robotsIndex) {
        const x = { ...base, title: row.seoTitle, description: row.metaDescription };
        indexable.push(x);
        lengthChecks(x);
      }
    }
  }

  // Categories
  const categories = await prisma.category.findMany({ include: { products: { where: { isPublished: true }, select: { id: true } } } });
  for (const c of categories) {
    const locales = categoryLocales(c);
    const adminPath = `/admin/categories/${c.id}/`;
    const common = { entityType: "category" as const, entityId: c.id, entityName: c.nameEn, adminPath };
    if (!c.isPublished) {
      if (c.products.length > 0)
        add({ ...common, severity: "warning", locale: null, url: null, check: "hidden_category_with_products", message: `Category is unpublished but has ${c.products.length} published products, which are therefore hidden.` });
      continue;
    }
    if (!locales.includes("ta"))
      add({ ...common, severity: "warning", locale: "ta", url: url("ta", paths.category(c.slug)), check: "missing_tamil_translation", message: "Tamil name or introduction is missing; the Tamil page falls back to English and is excluded from the sitemap." });
    if (c.imageUrl && !hasText(c.imageAltEn))
      add({ ...common, severity: "warning", locale: "en", url: null, check: "missing_image_alt", message: "Category image has no English alt text." });
    for (const locale of locales) {
      const seo = categorySeo(c, locale);
      const base = { ...common, locale, url: url(locale, paths.category(c.slug)) };
      if (seo.titleIsGenerated) add({ ...base, severity: "warning", check: "missing_title", message: "No SEO title set; a generated fallback is used." });
      if (seo.descriptionIsGenerated) add({ ...base, severity: "warning", check: "missing_meta_description", message: "No meta description set; a generated fallback is used." });
      if (!hasText(locale === "ta" ? c.h1Ta : c.h1En)) add({ ...base, severity: "info", check: "missing_h1", message: "No custom H1 set; the category name is used as the H1." });
      if (!hasText(locale === "ta" ? c.introTa : c.introEn)) add({ ...base, severity: "warning", check: "missing_description", message: "Category introduction is empty." });
      if (c.robotsIndex) {
        const x = { ...base, title: seo.title, description: seo.description };
        indexable.push(x);
        lengthChecks(x);
      }
    }
  }

  // Products
  const products = await prisma.product.findMany({ include: { category: true, images: true } });
  for (const p of products) {
    if (!p.isPublished) continue;
    const adminPath = `/admin/products/${p.id}/`;
    const path = paths.product(p.category.slug, p.slug);
    const locales = productLocales(p);
    const common = { entityType: "product" as const, entityId: p.id, entityName: `${p.nameEn} (${p.sku})`, adminPath };
    const en = { ...common, locale: "en" as const, url: url("en", path) };

    if (!p.category.isPublished) continue; // reported on the category
    if (!hasText(p.descriptionEn) && !hasText(p.shortDescriptionEn))
      add({ ...en, severity: "error", check: "missing_description", message: "Product has no English description." });
    if (!locales.includes("ta"))
      add({ ...common, locale: "ta", url: url("ta", path), severity: "warning", check: "missing_tamil_translation", message: "Tamil name or description is missing; the Tamil page shows English content and is canonicalised to the English URL." });
    if (!(Number(p.price) > 0))
      add({ ...en, severity: "error", check: "missing_price", message: "Product has no valid price." });
    if (p.salePrice != null && Number(p.salePrice) >= Number(p.price))
      add({ ...en, severity: "warning", check: "invalid_sale_price", message: "Sale price is not lower than the regular price, so it is ignored." });
    if (p.stockQuantity <= 0)
      add({ ...en, severity: "info", check: "out_of_stock", message: "Published product is out of stock (shown as OutOfStock in structured data)." });
    if (p.images.length === 0)
      add({ ...en, severity: "error", check: "structured_data_incomplete", message: "Product has no image; Google requires an image for product rich results." });
    p.images.forEach((img, i) => {
      if (!hasText(img.altEn)) add({ ...en, severity: "warning", check: "missing_image_alt", message: `Image ${i + 1} has no English alt text (the product name is used).` });
      if (locales.includes("ta") && !hasText(img.altTa))
        add({ ...common, locale: "ta", url: url("ta", path), severity: "info", check: "missing_image_alt", message: `Image ${i + 1} has no Tamil alt text.` });
    });
    if (!p.robotsIndex) {
      add({ ...en, severity: "info", check: "noindex", message: "Product is set to noindex and excluded from the sitemap." });
      continue;
    }
    for (const locale of locales) {
      const seo = productSeo(p, p.category, locale);
      const base = { ...common, locale, url: url(locale, path) };
      if (seo.titleIsGenerated) add({ ...base, severity: "info", check: "missing_title", message: "No SEO title set; the brand template is used." });
      if (seo.descriptionIsGenerated) add({ ...base, severity: "info", check: "missing_meta_description", message: "No meta description set; the category template is used." });
      const x = { ...base, title: seo.title, description: seo.description };
      indexable.push(x);
      lengthChecks(x);
    }
  }

  // Blog
  const posts = await prisma.blogPost.findMany();
  for (const b of posts) {
    if (b.status !== "PUBLISHED") continue;
    const locales = blogLocales(b);
    const path = paths.blogPost(b.slug);
    const common = { entityType: "blog" as const, entityId: b.id, entityName: b.titleEn, adminPath: `/admin/blog/${b.id}/` };
    if (locales.length === 0) {
      add({ ...common, locale: null, url: null, severity: "error", check: "missing_description", message: "Published post has no article body and is hidden." });
      continue;
    }
    for (const l of LOCALES.filter((x) => !locales.includes(x)))
      add({ ...common, locale: l, url: url(l, path), severity: "info", check: l === "ta" ? "missing_tamil_translation" : "missing_english_translation", message: `Post is not available in ${l === "ta" ? "Tamil" : "English"}.` });
    if (b.featuredImageUrl && !hasText(b.featuredImageAltEn))
      add({ ...common, locale: "en", url: url("en", path), severity: "warning", check: "missing_image_alt", message: "Featured image has no alt text." });
    if (!b.robotsIndex) continue;
    for (const locale of locales) {
      const seo = blogSeo(b, locale);
      const base = { ...common, locale, url: url(locale, path) };
      if (seo.descriptionIsGenerated) add({ ...base, severity: "warning", check: "missing_meta_description", message: "No meta description set." });
      const x = { ...base, title: seo.title, description: seo.description };
      indexable.push(x);
      lengthChecks(x);
    }
  }

  // Duplicates across every indexable URL
  for (const field of ["title", "description"] as const) {
    const groups = new Map<string, Indexable[]>();
    for (const x of indexable) {
      const k = x[field].trim().toLowerCase();
      groups.set(k, [...(groups.get(k) ?? []), x]);
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      for (const x of group) {
        add({
          severity: "error",
          check: field === "title" ? "duplicate_title" : "duplicate_meta_description",
          entityType: x.entityType,
          entityId: x.entityId,
          entityName: x.entityName,
          locale: x.locale,
          url: x.url,
          adminPath: x.adminPath,
          message: `Same ${field === "title" ? "title" : "meta description"} as: ${group.filter((g) => g !== x).map((g) => g.url).join(", ")}`,
        });
      }
    }
  }

  // Sitemap integrity: re-verify every sitemap URL against its record.
  const entries = await buildSitemapEntries();
  for (const e of entries) {
    const segs = e.path.split("/").filter(Boolean);
    let problem: string | null = null;
    if (segs[0] === "blog" && segs[1]) {
      const b = posts.find((x) => x.slug === segs[1]);
      if (!b || b.status !== "PUBLISHED" || !b.robotsIndex) problem = "unpublished or noindex blog post";
    } else if (segs.length === 2) {
      const p = products.find((x) => x.slug === segs[1] && x.category.slug === segs[0]);
      if (!p || !p.isPublished || !p.robotsIndex) problem = "unpublished or noindex product";
    }
    if (problem)
      add({ severity: "error", check: "sitemap_non_indexable_url", entityType: "sitemap", entityId: e.path, entityName: e.path, locale: null, url: url("en", e.path), adminPath: "/admin/", message: `Sitemap contains an ${problem}.` });
  }

  const counts = { error: 0, warning: 0, info: 0 };
  for (const i of issues) counts[i.severity]++;
  return {
    generatedAt: new Date().toISOString(),
    scope: "automated-database-checks",
    summary: { ...counts, indexableUrls: indexable.length, sitemapUrls: entries.reduce((n, e) => n + e.locales.length, 0) },
    issues,
  };
}

export function issuesToCsv(issues: Array<Record<string, unknown>>): string {
  const cols = ["severity", "check", "entityType", "entityName", "locale", "url", "message"];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    // Leading =,+,-,@ would be evaluated as formulas by spreadsheet apps.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return [cols.join(","), ...issues.map((i) => cols.map((c) => esc(i[c])).join(","))].join("\n");
}

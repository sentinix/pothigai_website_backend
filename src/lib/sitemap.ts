// Single source of truth for which URLs are public, canonical and indexable.
// Used by the storefront's sitemap.xml and cross-checked by the SEO audit.

import { prisma } from "../db.js";
import { config } from "../config.js";
import { blogLocales, categoryLocales, LOCALES, paths, productLocales, type Locale } from "./locales.js";

export interface SitemapEntry {
  path: string; // locale-less, e.g. "/oils/groundnut-oil/"
  locales: Locale[];
  lastModified: string;
}

/** A canonical override that points at another URL removes the page from the sitemap. */
function canonicalIsSelf(override: string | null, path: string): boolean {
  if (!override) return true;
  try {
    const u = new URL(override);
    return LOCALES.some((l) => u.pathname === `/${l}${path}`) && u.host === new URL(config.siteUrl).host;
  } catch {
    return false;
  }
}

export async function buildSitemapEntries(now = new Date()): Promise<SitemapEntry[]> {
  const [pages, categories, products, posts] = await Promise.all([
    prisma.pageContent.findMany(),
    prisma.category.findMany({ where: { isPublished: true }, orderBy: { sortOrder: "asc" } }),
    prisma.product.findMany({
      where: { isPublished: true, category: { isPublished: true } },
      include: { category: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.blogPost.findMany({
      where: { status: "PUBLISHED", publishedAt: { lte: now } },
      orderBy: { publishedAt: "desc" },
    }),
  ]);

  const entries: SitemapEntry[] = [];

  const pagePaths: Record<string, string> = { home: paths.home(), about: paths.about(), contact: paths.contact() };
  for (const [key, path] of Object.entries(pagePaths)) {
    const rows = pages.filter((p) => p.key === key && p.robotsIndex);
    const locales = LOCALES.filter((l) => rows.some((r) => r.locale === l));
    if (!locales.includes("en")) continue;
    const lastModified = new Date(Math.max(...rows.map((r) => r.updatedAt.getTime()))).toISOString();
    entries.push({ path, locales, lastModified });
  }

  for (const c of categories) {
    const path = paths.category(c.slug);
    if (!c.robotsIndex || !canonicalIsSelf(c.canonicalOverride, path)) continue;
    entries.push({ path, locales: categoryLocales(c), lastModified: c.updatedAt.toISOString() });
  }

  if (posts.length > 0) {
    entries.push({ path: paths.blogIndex(), locales: [...LOCALES], lastModified: posts[0].updatedAt.toISOString() });
  }

  for (const p of products) {
    const path = paths.product(p.category.slug, p.slug);
    if (!p.robotsIndex || !canonicalIsSelf(p.canonicalOverride, path)) continue;
    const locales = productLocales(p);
    if (locales.length === 0) continue;
    entries.push({ path, locales, lastModified: p.updatedAt.toISOString() });
  }

  for (const b of posts) {
    const path = paths.blogPost(b.slug);
    if (!b.robotsIndex || !canonicalIsSelf(b.canonicalOverride, path)) continue;
    const locales = blogLocales(b);
    if (locales.length === 0) continue;
    entries.push({ path, locales, lastModified: b.updatedAt.toISOString() });
  }

  return entries;
}

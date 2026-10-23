// Locale availability rules shared by the public API, the sitemap and the SEO
// audit. A page is only offered (sitemap + hreflang) in a locale when its core
// copy exists in that language; otherwise the storefront shows an English
// fallback that is canonicalised to the English URL.

export const LOCALES = ["en", "ta"] as const;
export type Locale = (typeof LOCALES)[number];

export function parseLocale(value: unknown): Locale {
  return value === "ta" ? "ta" : "en";
}

export const hasText = (v: string | null | undefined): v is string => typeof v === "string" && v.trim().length > 0;

export function productLocales(p: {
  nameEn: string;
  nameTa: string | null;
  descriptionEn: string | null;
  shortDescriptionEn: string | null;
  descriptionTa: string | null;
  shortDescriptionTa: string | null;
}): Locale[] {
  const out: Locale[] = [];
  if (hasText(p.nameEn)) out.push("en");
  if (hasText(p.nameTa) && (hasText(p.descriptionTa) || hasText(p.shortDescriptionTa))) out.push("ta");
  return out;
}

export function categoryLocales(c: { nameEn: string; nameTa: string | null; introTa: string | null }): Locale[] {
  const out: Locale[] = ["en"];
  if (hasText(c.nameTa) && hasText(c.introTa)) out.push("ta");
  return out;
}

export function blogLocales(b: {
  titleEn: string;
  bodyEn: string | null;
  titleTa: string | null;
  bodyTa: string | null;
}): Locale[] {
  const out: Locale[] = [];
  if (hasText(b.titleEn) && hasText(b.bodyEn)) out.push("en");
  if (hasText(b.titleTa) && hasText(b.bodyTa)) out.push("ta");
  return out;
}

/** Pick the field for a locale, falling back to English. */
export function pick<T extends Record<string, unknown>>(obj: T, base: string, locale: Locale): string | null {
  const ta = obj[`${base}Ta`];
  const en = obj[`${base}En`];
  if (locale === "ta" && typeof ta === "string" && ta.trim()) return ta;
  return typeof en === "string" && en.trim() ? en : null;
}

export const paths = {
  home: () => "/",
  category: (slug: string) => `/${slug}/`,
  product: (categorySlug: string, slug: string) => `/${categorySlug}/${slug}/`,
  blogIndex: () => "/blog/",
  blogPost: (slug: string) => `/blog/${slug}/`,
  about: () => "/about/",
  contact: () => "/contact/",
};

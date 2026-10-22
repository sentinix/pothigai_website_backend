// Optional live crawl of the deployed storefront. It fetches the real HTML so
// it can verify things the database cannot: H1 count, canonical and hreflang
// tags, JSON-LD validity, image alt attributes and broken internal links.
// It is still an automated check; Google's Rich Results Test and Search
// Console remain the authority for indexing and rich-result eligibility.

import { parse } from "node-html-parser";
import { config } from "../config.js";
import { buildSitemapEntries } from "./sitemap.js";
import type { Locale } from "./locales.js";

export interface LiveIssue {
  severity: "error" | "warning" | "info";
  check: string;
  url: string;
  message: string;
}

const HREFLANG: Record<Locale, string> = { en: "en-IN", ta: "ta-IN" };

async function fetchWithTimeout(url: string, method = "GET") {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  try {
    return await fetch(url, { method, redirect: "manual", signal: ctrl.signal, headers: { "user-agent": "PothigaiSeoAudit/1.0" } });
  } finally {
    clearTimeout(t);
  }
}

function checkProductJsonLd(data: Record<string, unknown>, url: string, issues: LiveIssue[]) {
  const missing = ["name", "image", "offers"].filter((k) => !data[k]);
  const offers = data.offers as Record<string, unknown> | undefined;
  if (offers) for (const k of ["price", "priceCurrency", "availability"]) if (!offers[k]) missing.push(`offers.${k}`);
  if (missing.length) issues.push({ severity: "error", check: "structured_data_incomplete", url, message: `Product JSON-LD missing: ${missing.join(", ")}` });
}

export async function runLiveAudit(limit = 100, baseUrl = config.siteUrl) {
  const issues: LiveIssue[] = [];
  const entries = await buildSitemapEntries();
  const expected = new Set<string>();
  const targets: { url: string; locale: Locale; locales: Locale[]; path: string }[] = [];
  for (const e of entries)
    for (const l of e.locales) {
      const url = `${baseUrl}/${l}${e.path}`;
      expected.add(url);
      targets.push({ url, locale: l, locales: e.locales, path: e.path });
    }

  // Sitemap as served
  try {
    const res = await fetchWithTimeout(`${baseUrl}/sitemap.xml`);
    const xml = await res.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
    for (const loc of locs)
      if (!expected.has(loc)) issues.push({ severity: "error", check: "sitemap_non_indexable_url", url: loc, message: "URL in sitemap.xml is not a published, canonical, indexable page." });
    for (const u of expected)
      if (!locs.includes(u)) issues.push({ severity: "warning", check: "sitemap_missing_url", url: u, message: "Indexable page is missing from sitemap.xml (it may be cached; retry after revalidation)." });
  } catch {
    issues.push({ severity: "error", check: "sitemap_unreachable", url: `${baseUrl}/sitemap.xml`, message: "sitemap.xml could not be fetched." });
  }

  const internalLinks = new Set<string>();
  let crawled = 0;
  for (const t of targets.slice(0, limit)) {
    crawled++;
    let res: Response;
    try {
      res = await fetchWithTimeout(t.url);
    } catch {
      issues.push({ severity: "error", check: "page_unreachable", url: t.url, message: "Page could not be fetched." });
      continue;
    }
    if (res.status !== 200) {
      issues.push({ severity: "error", check: "bad_status", url: t.url, message: `Page returned HTTP ${res.status}.` });
      continue;
    }
    const root = parse(await res.text());
    const titles = root.querySelectorAll("title");
    if (titles.length === 0 || !titles[0].text.trim()) issues.push({ severity: "error", check: "missing_title", url: t.url, message: "No <title> in the HTML." });
    if (!root.querySelector('meta[name="description"]')?.getAttribute("content"))
      issues.push({ severity: "error", check: "missing_meta_description", url: t.url, message: "No meta description in the HTML." });
    const h1s = root.querySelectorAll("h1");
    if (h1s.length === 0) issues.push({ severity: "error", check: "missing_h1", url: t.url, message: "Page has no <h1>." });
    if (h1s.length > 1) issues.push({ severity: "warning", check: "multiple_h1", url: t.url, message: `Page has ${h1s.length} <h1> elements.` });
    const canonical = root.querySelector('link[rel="canonical"]')?.getAttribute("href");
    if (!canonical) issues.push({ severity: "error", check: "missing_canonical", url: t.url, message: "No canonical link." });
    else if (canonical !== t.url) issues.push({ severity: "error", check: "canonical_mismatch", url: t.url, message: `Canonical points to ${canonical} but the page is listed in the sitemap.` });
    const robots = root.querySelector('meta[name="robots"]')?.getAttribute("content") ?? "";
    if (/noindex/i.test(robots)) issues.push({ severity: "error", check: "noindex_in_sitemap", url: t.url, message: "Page in sitemap is marked noindex." });
    const lang = root.querySelector("html")?.getAttribute("lang");
    if (lang !== HREFLANG[t.locale]) issues.push({ severity: "warning", check: "html_lang", url: t.url, message: `<html lang> is "${lang}" (expected ${HREFLANG[t.locale]}).` });
    if (t.locales.length > 1) {
      const alternates = root.querySelectorAll('link[rel="alternate"][hreflang]').map((l) => l.getAttribute("hreflang"));
      for (const want of [...t.locales.map((l) => HREFLANG[l]), "x-default"])
        if (!alternates.includes(want)) issues.push({ severity: "error", check: "missing_hreflang", url: t.url, message: `Missing hreflang="${want}".` });
    }
    for (const s of root.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(s.text) as Record<string, unknown>;
        const list = Array.isArray(data["@graph"]) ? (data["@graph"] as Record<string, unknown>[]) : [data];
        for (const node of list) if (node["@type"] === "Product") checkProductJsonLd(node, t.url, issues);
      } catch {
        issues.push({ severity: "error", check: "invalid_structured_data", url: t.url, message: "A JSON-LD block is not valid JSON." });
      }
    }
    const productSchemas = root.querySelectorAll('script[type="application/ld+json"]').filter((s) => s.text.includes('"@type":"Product"')).length;
    if (productSchemas > 1) issues.push({ severity: "warning", check: "duplicate_product_schema", url: t.url, message: "More than one Product JSON-LD block." });
    const noAlt = root.querySelectorAll("img").filter((img) => img.getAttribute("alt") === undefined).length;
    if (noAlt) issues.push({ severity: "warning", check: "missing_image_alt", url: t.url, message: `${noAlt} image(s) without an alt attribute.` });
    for (const a of root.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href")!;
      try {
        const u = new URL(href, t.url);
        if (u.origin === new URL(baseUrl).origin && !u.pathname.startsWith("/admin")) internalLinks.add(`${u.origin}${u.pathname}`);
      } catch {
        /* ignore malformed */
      }
    }
  }

  const toCheck = [...internalLinks].filter((u) => !expected.has(u)).slice(0, 300);
  for (const link of toCheck) {
    try {
      const res = await fetchWithTimeout(link, "HEAD");
      if (res.status >= 400) issues.push({ severity: "error", check: "broken_internal_link", url: link, message: `Internal link returns HTTP ${res.status}.` });
    } catch {
      issues.push({ severity: "warning", check: "broken_internal_link", url: link, message: "Internal link could not be fetched." });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    scope: "automated-live-html-checks",
    baseUrl,
    summary: { pagesCrawled: crawled, pagesInSitemap: targets.length, linksChecked: toCheck.length, issues: issues.length },
    issues,
  };
}

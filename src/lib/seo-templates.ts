// SEO copy templates derived from the brand brief. They are used (a) as
// runtime fallbacks when an editor has not written product-specific metadata
// and (b) as "Suggest" text in the admin product editor. They deliberately
// avoid claims (organic, cold-pressed, health benefits) that need verification.

import type { Locale } from "./locales.js";

export const BRAND = { en: "Pothigai Naturals", ta: "பொத்திகை நேச்சுரல்ஸ்" } as const;

type Tpl = (name: string) => string;

const metaDescription: Record<string, Record<Locale, Tpl>> = {
  "traditional-rice": {
    en: (n) =>
      `Explore ${n} traditional rice at Pothigai Naturals. Check available pack sizes, product details and pricing, and order online.`,
    ta: (n) =>
      `${n} பாரம்பரிய அரிசியை பொத்திகை நேச்சுரல்ஸில் பாருங்கள். பேக் அளவுகள், விவரங்கள் மற்றும் விலையைச் சரிபார்த்து ஆன்லைனில் ஆர்டர் செய்யுங்கள்.`,
  },
  oils: {
    en: (n) =>
      `Shop ${n} at Pothigai Naturals. View available pack sizes, ingredients, extraction method and price to choose the right option for your kitchen.`,
    ta: (n) =>
      `பொத்திகை நேச்சுரல்ஸில் ${n} வாங்குங்கள். பேக் அளவுகள், உட்பொருட்கள், பிரித்தெடுக்கும் முறை மற்றும் விலையைப் பார்த்து உங்கள் சமையலறைக்கு ஏற்றதைத் தேர்வு செய்யுங்கள்.`,
  },
  "nuts-dry-fruits": {
    en: (n) =>
      `Explore ${n} at Pothigai Naturals for snacking and cooking. Check the available grade, pack size, ingredients and price before ordering.`,
    ta: (n) =>
      `சிற்றுண்டி மற்றும் சமையலுக்கு ${n} — பொத்திகை நேச்சுரல்ஸில் தரம், பேக் அளவு, உட்பொருட்கள் மற்றும் விலையைச் சரிபார்த்து ஆர்டர் செய்யுங்கள்.`,
  },
  millets: {
    en: (n) =>
      `Discover ${n} at Pothigai Naturals. Explore available pack sizes and product details for traditional recipes and everyday cooking.`,
    ta: (n) =>
      `பொத்திகை நேச்சுரல்ஸில் ${n} பாருங்கள். பாரம்பரிய சமையல் மற்றும் அன்றாட உணவுக்கான பேக் அளவுகள் மற்றும் விவரங்களைப் பாருங்கள்.`,
  },
  pulses: {
    en: (n) =>
      `Shop ${n} at Pothigai Naturals. Check pack size, product details and price for traditional dishes and everyday meals.`,
    ta: (n) =>
      `பொத்திகை நேச்சுரல்ஸில் ${n} வாங்குங்கள். பாரம்பரிய உணவுகள் மற்றும் அன்றாட சமையலுக்கான பேக் அளவு, விவரங்கள் மற்றும் விலையைப் பாருங்கள்.`,
  },
  spices: {
    en: (n) =>
      `Shop ${n} at Pothigai Naturals. Check ingredients, pack size, product details and price for your everyday cooking needs.`,
    ta: (n) =>
      `பொத்திகை நேச்சுரல்ஸில் ${n} வாங்குங்கள். அன்றாட சமையலுக்கான உட்பொருட்கள், பேக் அளவு, விவரங்கள் மற்றும் விலையைச் சரிபார்க்கவும்.`,
  },
};

const genericDescription: Record<Locale, Tpl> = {
  en: (n) => `Shop ${n} at Pothigai Naturals. Check pack size, product details and current price, and order online.`,
  ta: (n) =>
    `பொத்திகை நேச்சுரல்ஸில் ${n} வாங்குங்கள். பேக் அளவு, விவரங்கள் மற்றும் தற்போதைய விலையைச் சரிபார்த்து ஆன்லைனில் ஆர்டர் செய்யுங்கள்.`,
};

const longDescription: Record<string, Record<Locale, Tpl>> = {
  "traditional-rice": {
    en: (n) =>
      `${n} is a traditional rice variety associated with Tamil food heritage. Explore this variety at Pothigai Naturals for your traditional recipes and everyday meal planning. Check the available pack size, grain details, cooking instructions and price before placing your order.`,
    ta: (n) =>
      `${n} தமிழர் உணவு பாரம்பரியத்துடன் தொடர்புடைய ஒரு பாரம்பரிய அரிசி வகையாகும். உங்கள் பாரம்பரிய சமையலுக்கும் அன்றாட உணவுத் திட்டமிடலுக்கும் இந்த வகையை பொத்திகை நேச்சுரல்ஸில் பாருங்கள். ஆர்டர் செய்வதற்கு முன் கிடைக்கும் பேக் அளவு, அரிசி விவரங்கள், சமைக்கும் முறை மற்றும் விலையைச் சரிபார்க்கவும்.`,
  },
  oils: {
    en: (n) =>
      `Discover ${n} at Pothigai Naturals, a cooking oil option for a variety of everyday recipes. Check the product label for ingredients, extraction method, storage instructions and pack size. Choose your preferred quantity and review the current price before ordering.`,
    ta: (n) =>
      `பல்வேறு அன்றாட உணவுகளுக்கு ஏற்ற சமையல் எண்ணெயான ${n} பொத்திகை நேச்சுரல்ஸில் கிடைக்கிறது. உட்பொருட்கள், பிரித்தெடுக்கும் முறை, சேமிப்பு வழிமுறைகள் மற்றும் பேக் அளவுக்கு தயாரிப்பு லேபிளைப் பார்க்கவும். உங்களுக்குத் தேவையான அளவைத் தேர்வு செய்து, ஆர்டர் செய்வதற்கு முன் தற்போதைய விலையைச் சரிபார்க்கவும்.`,
  },
};

export function productTitleTemplate(name: string, locale: Locale): string {
  return locale === "ta" ? `${name} ஆன்லைனில் வாங்க | ${BRAND.ta}` : `Buy ${name} Online | ${BRAND.en}`;
}

export function productDescriptionTemplate(name: string, categorySlug: string, locale: Locale): string {
  return (metaDescription[categorySlug]?.[locale] ?? genericDescription[locale])(name);
}

export function productLongDescriptionTemplate(name: string, categorySlug: string, locale: Locale): string | null {
  return longDescription[categorySlug]?.[locale]?.(name) ?? null;
}

export function blogTitleTemplate(title: string, locale: Locale): string {
  return `${title} | ${BRAND[locale]}`;
}

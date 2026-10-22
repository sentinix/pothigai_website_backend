import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { adminToken, app, categoryId, createProduct, prisma, resetDb } from "./helpers.js";

let token: string;
const auth = () => ({ Authorization: `Bearer ${token}` });

describe("catalogue & SEO data", () => {
  beforeEach(async () => {
    await resetDb();
    token = await adminToken();
  });

  it("serves the six categories with bilingual SEO", async () => {
    const res = await request(app).get("/api/public/categories?locale=ta");
    expect(res.body.map((c: { slug: string }) => c.slug)).toEqual([
      "traditional-rice",
      "oils",
      "nuts-dry-fruits",
      "millets",
      "pulses",
      "spices",
    ]);
    expect(res.body[0].name).toBe("பாரம்பரிய அரிசி");
    expect(res.body[0].seo.title).toBe("பாரம்பரிய அரிசி ஆன்லைனில் வாங்க | பொத்திகை நேச்சுரல்ஸ்");
    expect(res.body[0].locales).toEqual(["en", "ta"]);
  });

  it("hides unpublished products everywhere public", async () => {
    const draft = await createProduct(token, { isPublished: false });
    const live = await createProduct(token);
    expect((await request(app).get(`/api/public/products/${draft.slug}`)).status).toBe(404);
    expect((await request(app).get(`/api/public/products/${live.slug}`)).status).toBe(200);
    const list = await request(app).get("/api/public/categories/oils");
    expect(list.body.products.map((p: { id: string }) => p.id)).toEqual([live.id]);
    const sitemap = await request(app).get("/api/public/sitemap");
    const paths = sitemap.body.map((e: { path: string }) => e.path);
    expect(paths).toContain(`/oils/${live.slug}/`);
    expect(paths).not.toContain(`/oils/${draft.slug}/`);
  });

  it("generates unique metadata from templates and real product data", async () => {
    const p = await createProduct(token, { nameEn: "Groundnut Oil", packSize: 1, packUnit: "l", price: 250, salePrice: 230 });
    const res = await request(app).get(`/api/public/products/${p.slug}?locale=en`);
    const product = res.body.product;
    expect(product.seo.title).toBe("Buy Groundnut Oil (1 l) Online | Pothigai Naturals");
    expect(product.seo.description).toContain("Shop Groundnut Oil (1 l) at Pothigai Naturals");
    expect(product.price).toBe("250.00");
    expect(product.effectivePrice).toBe("230.00");
    expect(product.inStock).toBe(true);
    expect(product).not.toHaveProperty("stockQuantity");
  });

  it("falls back to English for untranslated Tamil products and keeps them out of the Tamil sitemap", async () => {
    const p = await createProduct(token);
    const ta = await request(app).get(`/api/public/products/${p.slug}?locale=ta`);
    expect(ta.body.product.translationFallback).toBe(true);
    expect(ta.body.product.locales).toEqual(["en"]);
    const sitemap = await request(app).get("/api/public/sitemap");
    expect(sitemap.body.find((e: { path: string }) => e.path === `/oils/${p.slug}/`).locales).toEqual(["en"]);

    await request(app).patch(`/api/admin/products/${p.id}`).set(auth()).send({ nameTa: "கடலை எண்ணெய்", descriptionTa: "விளக்கம்" });
    const after = await request(app).get("/api/public/sitemap");
    expect(after.body.find((e: { path: string }) => e.path === `/oils/${p.slug}/`).locales).toEqual(["en", "ta"]);
  });

  it("excludes noindex and externally-canonicalised products from the sitemap", async () => {
    const noindex = await createProduct(token, { robotsIndex: false });
    const canon = await createProduct(token);
    const other = await createProduct(token);
    await request(app)
      .patch(`/api/admin/products/${canon.id}`)
      .set(auth())
      .send({ canonicalOverride: `https://shop.example.test/en/oils/${other.slug}/` })
      .expect(200);
    const paths = (await request(app).get("/api/public/sitemap")).body.map((e: { path: string }) => e.path);
    expect(paths).not.toContain(`/oils/${noindex.slug}/`);
    expect(paths).not.toContain(`/oils/${canon.slug}/`);
    expect(paths).toContain(`/oils/${other.slug}/`);
  });

  it("rejects canonical URLs on other domains and invalid input", async () => {
    const p = await createProduct(token);
    const res = await request(app)
      .patch(`/api/admin/products/${p.id}`)
      .set(auth())
      .send({ canonicalOverride: "https://evil.example/x", price: -5, slug: "Bad Slug" });
    expect(res.status).toBe(400);
    const codes = res.body.fields.map((f: { path: string }) => f.path).sort();
    expect(codes).toEqual(["canonicalOverride", "price", "slug"]);
    const unknown = await request(app).patch(`/api/admin/products/${p.id}`).set(auth()).send({ hacked: true });
    expect(unknown.status).toBe(400);
    const reserved = await request(app).patch(`/api/admin/products/${p.id}`).set(auth()).send({ slug: "blog" });
    expect(reserved.status).toBe(400);
  });

  it("saving SEO metadata does not overwrite other product data", async () => {
    const p = await createProduct(token, { price: 321.5, stockQuantity: 9, descriptionEn: "Keep me" });
    await request(app)
      .patch(`/api/admin/products/${p.id}`)
      .set(auth())
      .send({ seoTitleEn: "Custom title", metaDescriptionEn: "Custom description for this product." })
      .expect(200);
    const row = await prisma.product.findUniqueOrThrow({ where: { id: p.id }, include: { images: true } });
    expect(Number(row.price)).toBe(321.5);
    expect(row.stockQuantity).toBe(9);
    expect(row.descriptionEn).toBe("Keep me");
    expect(row.images).toHaveLength(1);
    expect(row.seoTitleEn).toBe("Custom title");
  });

  it("strips HTML from plain-text fields", async () => {
    const p = await createProduct(token, { nameEn: "<script>alert(1)</script>Cashews" });
    const row = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.nameEn).toBe("alert(1)Cashews");
  });

  it("records permanent redirects when slugs or categories change", async () => {
    const p = await createProduct(token, { slug: "old-oil" });
    await request(app).patch(`/api/admin/products/${p.id}`).set(auth()).send({ slug: "new-oil" }).expect(200);
    const r1 = await request(app).get("/api/public/redirects?path=/oils/old-oil/");
    expect(r1.body.toPath).toBe("/oils/new-oil/");
    await request(app)
      .patch(`/api/admin/products/${p.id}`)
      .set(auth())
      .send({ categoryId: await categoryId("spices") })
      .expect(200);
    // Old redirect is re-targeted so there is no chain.
    const r2 = await request(app).get("/api/public/redirects?path=/oils/old-oil/");
    expect(r2.body.toPath).toBe("/spices/new-oil/");
  });

  it("only exposes published blog posts with content", async () => {
    const draft = await request(app)
      .post("/api/admin/blog")
      .set(auth())
      .send({ slug: "draft-post", titleEn: "Draft", bodyEn: "Body", authorName: "Team", status: "DRAFT" });
    expect(draft.status).toBe(201);
    const empty = await request(app)
      .post("/api/admin/blog")
      .set(auth())
      .send({ slug: "empty-post", titleEn: "Empty", authorName: "Team", status: "PUBLISHED" });
    expect(empty.status).toBe(400);
    await request(app)
      .post("/api/admin/blog")
      .set(auth())
      .send({ slug: "live-post", titleEn: "Live", bodyEn: "Hello", authorName: "Team", status: "PUBLISHED" })
      .expect(201);
    expect((await request(app).get("/api/public/blog/draft-post")).status).toBe(404);
    const live = await request(app).get("/api/public/blog/live-post?locale=en");
    expect(live.body.locales).toEqual(["en"]);
    const paths = (await request(app).get("/api/public/sitemap")).body.map((e: { path: string }) => e.path);
    expect(paths).toContain("/blog/live-post/");
    expect(paths).toContain("/blog/");
    expect(paths).not.toContain("/blog/draft-post/");
  });

  it("refuses to noindex the homepage", async () => {
    const home = await prisma.pageContent.findFirstOrThrow({ where: { key: "home", locale: "en" } });
    const res = await request(app)
      .put("/api/admin/pages/home/en")
      .set(auth())
      .send({ seoTitle: home.seoTitle, metaDescription: home.metaDescription, h1: home.h1, body: home.body, robotsIndex: false });
    expect(res.status).toBe(400);
  });
});

describe("draft previews", () => {
  beforeEach(async () => {
    await resetDb();
    token = await adminToken();
  });

  it("only admins can preview unpublished products", async () => {
    const draft = await createProduct(token, { isPublished: false });
    expect((await request(app).get(`/api/public/products/${draft.slug}?preview=1`)).status).toBe(404);
    const res = await request(app).get(`/api/public/products/${draft.slug}?preview=1`).set(auth());
    expect(res.status).toBe(200);
  });
});

import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { issuesToCsv } from "../src/lib/seo-audit.js";
import { adminToken, app, createProduct, resetDb } from "./helpers.js";

let token: string;

describe("SEO audit", () => {
  beforeEach(async () => {
    await resetDb();
    token = await adminToken();
  });

  it("flags duplicates, missing translations, alt text and images", async () => {
    await createProduct(token, { seoTitleEn: "Same title", metaDescriptionEn: "Same description" });
    await createProduct(token, { seoTitleEn: "Same title", metaDescriptionEn: "Same description", images: [{ url: "https://cdn.example.test/x.webp" }] });
    await createProduct(token, { images: [], descriptionEn: null });
    const res = await request(app).get("/api/admin/seo-audit").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const checks = res.body.issues.map((i: { check: string }) => i.check);
    expect(checks.filter((c: string) => c === "duplicate_title")).toHaveLength(2);
    expect(checks.filter((c: string) => c === "duplicate_meta_description")).toHaveLength(2);
    expect(checks).toContain("missing_tamil_translation");
    expect(checks).toContain("missing_image_alt");
    expect(checks).toContain("structured_data_incomplete");
    expect(checks).toContain("missing_description");
    expect(checks).not.toContain("sitemap_non_indexable_url");
    expect(res.body.scope).toBe("automated-database-checks");
  });

  it("exports CSV safely", async () => {
    const csv = issuesToCsv([{ severity: "error", check: "x", message: '=HYPERLINK("bad") "quoted"' }]);
    expect(csv.split("\n")[1]).toContain(`"'=HYPERLINK(""bad"") ""quoted"""`);
    const res = await request(app).get("/api/admin/seo-audit.csv").set("Authorization", `Bearer ${token}`);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("attachment");
  });
});

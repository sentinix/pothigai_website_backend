import bcrypt from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { signToken } from "../src/middleware/auth.js";
import { categories, pages } from "../prisma/seed-data.js";

export const app = createApp();
export { prisma };

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "OrderItem", "Order", "ProductImage", "_BlogPostProducts", "BlogPost", "Product", "Category", "PageContent", "SiteSettings", "SlugRedirect", "User" CASCADE',
  );
  for (const c of categories) await prisma.category.create({ data: c });
  for (const p of pages) await prisma.pageContent.create({ data: p });
  await prisma.siteSettings.create({ data: {} });
}

export async function adminToken() {
  const user = await prisma.user.create({
    data: { email: `admin-${Date.now()}@test.local`, passwordHash: await bcrypt.hash("correct-horse-battery", 4), role: "ADMIN" },
  });
  return signToken({ id: user.id, email: user.email, role: "ADMIN" });
}

export async function categoryId(slug: string) {
  return (await prisma.category.findUniqueOrThrow({ where: { slug } })).id;
}

let n = 0;
/** Test fixture only — never used outside the test database. */
export async function createProduct(token: string, overrides: Record<string, unknown> = {}) {
  n++;
  const res = await request(app)
    .post("/api/admin/products")
    .set("Authorization", `Bearer ${token}`)
    .send({
      slug: `test-product-${n}`,
      sku: `TEST-${n}`,
      categoryId: await categoryId("oils"),
      nameEn: `Test Product ${n}`,
      descriptionEn: "Test description",
      price: 100,
      stockQuantity: 5,
      isPublished: true,
      images: [{ url: "https://cdn.example.test/p.webp", altEn: "Test image", width: 800, height: 800 }],
      ...overrides,
    });
  if (res.status !== 201) throw new Error(`createProduct failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: string; slug: string; sku: string };
}

// Idempotent seed: creates missing records only and never overwrites content
// an administrator has already edited.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { blogDrafts, categories, pages } from "./seed-data.js";

const prisma = new PrismaClient();

async function main() {
  for (const c of categories) {
    await prisma.category.upsert({ where: { slug: c.slug }, create: c, update: {} });
  }
  for (const p of pages) {
    await prisma.pageContent.upsert({
      where: { key_locale: { key: p.key, locale: p.locale } },
      create: p,
      update: {},
    });
  }
  await prisma.siteSettings.upsert({ where: { id: "default" }, create: {}, update: {} });

  for (const { category, ...post } of blogDrafts) {
    const cat = category ? await prisma.category.findUnique({ where: { slug: category } }) : null;
    await prisma.blogPost.upsert({
      where: { slug: post.slug },
      create: { ...post, status: "DRAFT", categoryId: cat?.id ?? null },
      update: {},
    });
  }

  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    if (ADMIN_PASSWORD.length < 12) throw new Error("ADMIN_PASSWORD must be at least 12 characters");
    const email = ADMIN_EMAIL.toLowerCase();
    await prisma.user.upsert({
      where: { email },
      create: { email, passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12), role: "ADMIN" },
      update: {},
    });
    console.log(`Admin account ensured for ${email}`);
  }
  console.log("Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

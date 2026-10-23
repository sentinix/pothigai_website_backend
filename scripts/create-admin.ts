// Usage: npm run create-admin -- admin@example.com 'a-strong-password'
import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/db.js";

const [email, password] = process.argv.slice(2);
if (!email || !password || password.length < 12) {
  console.error("Usage: npm run create-admin -- <email> <password (min 12 chars)>");
  process.exit(1);
}
const passwordHash = await bcrypt.hash(password, 12);
await prisma.user.upsert({
  where: { email: email.toLowerCase() },
  create: { email: email.toLowerCase(), passwordHash, role: "ADMIN" },
  update: { passwordHash, role: "ADMIN" },
});
console.log(`Admin account ready: ${email.toLowerCase()}`);
await prisma.$disconnect();

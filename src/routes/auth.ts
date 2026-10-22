import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { HttpError } from "../lib/http-error.js";
import { loginSchema } from "../lib/validation.js";
import { requireAdmin, signToken } from "../middleware/auth.js";

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 1000 : 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "too_many_attempts", message: "Too many login attempts. Try again later." },
});

// Constant-time-ish path for unknown emails so response timing does not reveal accounts.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

authRouter.post("/login", loginLimiter, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, "invalid_credentials", "Invalid email or password");
  const authUser = { id: user.id, email: user.email, role: user.role };
  res.json({ token: signToken(authUser), user: { email: user.email, name: user.name, role: user.role } });
});

authRouter.get("/me", requireAdmin, (req, res) => {
  res.json({ user: req.user });
});

import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { HttpError } from "../lib/http-error.js";

export interface AuthUser {
  id: string;
  email: string;
  role: "ADMIN" | "CUSTOMER";
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, config.jwtSecret, {
    expiresIn: "8h",
    algorithm: "HS256",
  });
}

function readToken(req: Request): AuthUser | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  try {
    const payload = jwt.verify(header.slice(7), config.jwtSecret, { algorithms: ["HS256"] }) as jwt.JwtPayload;
    if (typeof payload.sub !== "string") return null;
    return { id: payload.sub, email: String(payload.email), role: payload.role === "ADMIN" ? "ADMIN" : "CUSTOMER" };
  } catch {
    return null;
  }
}

/** True when the request carries a valid admin token (used for draft previews). */
export function isAdminRequest(req: Request): boolean {
  return readToken(req)?.role === "ADMIN";
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const user = readToken(req);
  if (!user) return next(new HttpError(401, "unauthenticated", "Authentication required"));
  if (user.role !== "ADMIN") return next(new HttpError(403, "forbidden", "Administrator access required"));
  req.user = user;
  next();
}

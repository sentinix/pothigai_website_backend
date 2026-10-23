import bcrypt from "bcryptjs";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { signToken } from "../src/middleware/auth.js";
import { app, prisma, resetDb } from "./helpers.js";

describe("admin protection", () => {
  beforeEach(resetDb);

  const adminEndpoints = [
    ["get", "/api/admin/products"],
    ["patch", "/api/admin/categories/x"],
    ["put", "/api/admin/pages/home/en"],
    ["get", "/api/admin/seo-audit"],
    ["patch", "/api/admin/settings"],
    ["post", "/api/admin/uploads"],
  ] as const;

  it.each(adminEndpoints)("%s %s rejects anonymous requests", async (method, path) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
  });

  it("rejects non-admin tokens", async () => {
    const token = signToken({ id: "c1", email: "c@test.local", role: "CUSTOMER" });
    const res = await request(app).get("/api/admin/products").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("rejects tampered tokens", async () => {
    const token = signToken({ id: "a1", email: "a@test.local", role: "ADMIN" });
    const res = await request(app).get("/api/admin/products").set("Authorization", `Bearer ${token}x`);
    expect(res.status).toBe(401);
  });

  it("logs in admins with valid credentials only", async () => {
    await prisma.user.create({
      data: { email: "owner@test.local", passwordHash: await bcrypt.hash("a-long-password", 4), role: "ADMIN" },
    });
    const bad = await request(app).post("/api/auth/login").send({ email: "owner@test.local", password: "nope" });
    expect(bad.status).toBe(401);
    const unknown = await request(app).post("/api/auth/login").send({ email: "x@test.local", password: "nope" });
    expect(unknown.status).toBe(401);
    const ok = await request(app).post("/api/auth/login").send({ email: "OWNER@test.local", password: "a-long-password" });
    expect(ok.status).toBe(200);
    const me = await request(app).get("/api/admin/products").set("Authorization", `Bearer ${ok.body.token}`);
    expect(me.status).toBe(200);
  });

  it("marks API responses noindex", async () => {
    const res = await request(app).get("/api/public/categories");
    expect(res.headers["x-robots-tag"]).toBe("noindex");
  });
});

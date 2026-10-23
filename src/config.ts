import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

const jwtSecret = required("JWT_SECRET");
if (jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters long");
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret,
  siteUrl: (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
  publicApiUrl: (process.env.PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/+$/, ""),
  corsOrigins: (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  uploadDir: process.env.UPLOAD_DIR ?? "./uploads",
  // Number of reverse proxies in front of the API whose X-Forwarded-For entries
  // are trusted for the client IP (used by the login rate limiter).
  trustProxyHops: Number(process.env.TRUST_PROXY_HOPS ?? 1),
  isTest: process.env.NODE_ENV === "test",
};

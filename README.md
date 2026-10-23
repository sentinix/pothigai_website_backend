# Pothigai Naturals — API

Backend for the Pothigai Naturals online store: catalogue, orders, blog, bilingual (English/Tamil) SEO content and the admin/SEO-audit API. The storefront lives in [`sentinix/pothigaiwebsite`](https://github.com/sentinix/pothigaiwebsite).

**Stack:** Node.js 20+, Express 5, TypeScript, Prisma 6, PostgreSQL, zod validation, JWT admin auth.

## Quick start

```bash
cp .env.example .env              # fill in DATABASE_URL, JWT_SECRET, SITE_URL …
npm install
npm run db:migrate                # apply migrations (prisma migrate deploy)
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-password' npm run db:seed
npm run dev                       # http://localhost:4000
```

The seed is idempotent and **never overwrites content an admin has edited**. It creates:

- the six categories (traditional rice, oils, nuts & dry fruits, millets, pulses, spices) with English + Tamil names, H1s, SEO titles/descriptions, introductions and FAQs from the SEO brief;
- English + Tamil homepage, About and Contact copy;
- six blog posts as **drafts** (outlines only — they are not public until completed and published);
- an empty store-settings row and, if `ADMIN_EMAIL`/`ADMIN_PASSWORD` are set, the first admin.

It deliberately creates **no products, prices, stock, addresses, phone numbers, certifications or reviews** — add the real catalogue through the admin dashboard. Another admin can be added any time with `npm run create-admin -- email 'password'`.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `JWT_SECRET` | yes | ≥ 32 random characters; signs admin sessions |
| `SITE_URL` | yes | Public storefront origin (e.g. `https://www.pothigainaturals.com`) — used for canonical checks and the live SEO crawl |
| `PUBLIC_API_URL` | yes | Public origin of this API — used to build absolute image URLs |
| `CORS_ORIGINS` | no | Comma-separated browser origins (the storefront proxies browser calls, so usually just the site origin) |
| `UPLOAD_DIR` | no | Image upload directory (default `./uploads`) — **must be persistent storage in production** |
| `PORT` | no | Default 4000 |
| `TRUST_PROXY_HOPS` | no | Trusted reverse proxies for the client IP (default 1; 2 on Render behind Vercel) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | seed only | First admin account |

## API overview

- `GET /api/public/*` — categories, products, search, blog, pages, settings, sitemap entries, slug redirects; `POST /api/public/orders` (checkout) and `POST /api/public/orders/:token/analytics` (one-time GA4 purchase claim).
- `POST /api/auth/login` — admin login (rate-limited: 10 attempts / 15 min / IP).
- `/api/admin/*` — every route requires an `ADMIN` JWT: products, categories, pages, blog, settings, redirects, orders, uploads, `seo-audit`, `seo-audit.csv`, `seo-audit/live`.

Key behaviours:

- **Prices and stock are always taken from the database at checkout**; clients can only send product IDs and quantities. Stock is decremented with a conditional update so concurrent orders cannot oversell; cancelling an order restocks it once.
- **Admin edits use PATCH semantics** — saving SEO metadata never touches price, stock or other fields. All input is validated server-side (zod); plain-text fields are stripped of HTML; blog bodies are Markdown and the storefront never renders raw HTML.
- **Locale availability**: a page is offered in Tamil (sitemap + hreflang) only once its Tamil copy exists (product: Tamil name + description; category: Tamil name + intro; blog: Tamil title + body). Otherwise the Tamil URL shows an English fallback canonicalised to the English page.
- **Slug changes** on published products, categories or posts automatically create permanent redirects (with chain collapsing).
- **Uploads** are re-encoded to WebP (max 2000 px), stripped of metadata and given descriptive filenames.
- **SEO audit** (`/api/admin/seo-audit`): missing/duplicate titles and descriptions, missing H1/intro, missing translations, missing alt text, missing descriptions/images/prices, invalid sale prices, noindex items and a sitemap integrity check. The optional **live crawl** fetches the deployed site's HTML to check H1 count, canonical, hreflang, robots meta, JSON-LD validity, image alt attributes, `sitemap.xml` contents and broken internal links. Both are automated checks only — they do not report rankings or Google index status.

## Tests

```bash
createdb pothigai_test     # separate database; tests truncate it
npm test                   # vitest + supertest (uses TEST_DATABASE_URL or postgresql://pothigai:pothigai@localhost:5432/pothigai_test)
npm run typecheck
npm run build
```

## Deploying to Render

`render.yaml` is a Render Blueprint that creates:

- **pothigai-api**: a Node 22 web service in Singapore (the closest Render region to Tamil Nadu) on the *Starter* plan, which is required for the persistent disk.
- **A 5 GB disk** mounted at `/var/data`. Uploaded images are kept in `/var/data/uploads` across deploys.
- **pothigai-db**: a PostgreSQL 16 database (*basic-256mb* plan) that only Render services can reach.

Steps:

1. In Render choose **New → Blueprint**, connect this GitHub repository and apply `render.yaml`.
2. When prompted, fill in:
   - `SITE_URL`: the storefront origin, e.g. `https://www.pothigainaturals.com`
   - `PUBLIC_API_URL`: this service's URL, e.g. `https://pothigai-api.onrender.com`, or a custom domain such as `https://api.pothigainaturals.com`
   - `CORS_ORIGINS`: the same value as `SITE_URL`
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD`: the first admin account (password at least 12 characters)

   `JWT_SECRET` is generated by Render, and `DATABASE_URL` is wired to the database automatically.
3. Each deploy runs `npm run db:migrate && npm run db:seed` before going live. The seed is idempotent and never overwrites admin edits.
4. After the first successful deploy, delete `ADMIN_PASSWORD` (and `ADMIN_EMAIL`) from the service's environment. Add more admins later with `npm run create-admin -- email 'password'` from the Render Shell.
5. Optionally add a custom domain such as `api.pothigainaturals.com` under the service's *Settings → Custom Domains*, then update `PUBLIC_API_URL` and the storefront's `API_URL` / `MEDIA_URL`.

**Auto-deploy.** `autoDeployTrigger: checksPass` makes Render deploy `main` only after the GitHub Actions **CI** workflow (`.github/workflows/ci.yml`: typecheck, tests against PostgreSQL, build) passes.

**Client IPs.** Logins arrive through Vercel, which sets the visitor's IP, and then through Render's load balancer. So `TRUST_PROXY_HOPS=2` is set, and the login rate limiter sees the real visitor rather than Vercel's servers. If you call the API through a single proxy instead, use `1`.

**Backups.** Paid Render Postgres plans include point-in-time recovery. Back up the uploads disk separately, or move images to object storage as the catalogue grows.

## Payments

Checkout currently records **cash-on-delivery** orders, which the store team confirms. An online payment gateway such as Razorpay needs merchant credentials and is not yet integrated.

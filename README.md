# qstart-rwsdk

A production-ready starter for [RedwoodSDK](https://docs.rwsdk.com/) on Cloudflare Workers.

Built by [qntbr](https://qntbr.com) after shipping a real app with this stack. The goal is to skip the painful setup and get straight to building — and to understand *why* the architecture works, not just copy it.

---

## What's included

- **RedwoodSDK** — full-stack React framework on Cloudflare Workers
- **Tailwind CSS** — utility-first styling, configured and ready
- **BetterAuth** — email/password + Google OAuth, org support, session management, password reset
- **Prisma + D1** — type-safe SQLite on Cloudflare D1
- **Organization scoping** — subdomain-based multi-tenancy (`org.yourdomain.com`)
- **Durable Objects** — `UserSessionDO` as a working hibernation example with WebSocket
- **Stripe** — real checkout session + webhook handler, wired end to end
- **Rate limiting** — KV-backed rate limiter on sensitive routes
- **Turnstile** — Cloudflare bot protection on signup
- **Middleware system** — split session/org context with centralized route policy config
- **Server actions** — thin wrappers over services, callable from both RSC and client components

---

## Why this stack

I wanted React Server Components without paying Next.js/Vercel prices, and without the GraphQL layer that always felt like overhead for solo and small-team projects.

RedwoodSDK gives you RSC and SSR on Cloudflare Workers. Your server components render at the edge, close to your users, and the cacheable parts stay cached. You decide what's server-rendered and what's client — no framework forcing your hand. And because it's just a Cloudflare Worker, the same service functions work in server actions, API routes, and webhooks. No duplication, no special cases.

The Cloudflare infra is genuinely great:
- **Workers** — cheap, globally distributed compute. You pay per invocation, not per server
- **D1** — SQLite at the edge. Easy to reason about, Prisma makes it portable if you ever need to move
- **Durable Objects** — the killer feature. Persistent stateful compute with WebSocket hibernation. You pay for active processing time only (~10-50ms per message), not connection time. A DO hibernates between messages and costs essentially nothing at rest
- **KV** — fast global reads for things like auth cache and rate limits
- **R2** — object storage with no egress fees. No AWS S3 egress tax

Prisma on top means if you ever need to move off D1, it's a config change, not a rewrite.

---

## Architecture

This is the part most starters skip. Understanding the layers makes everything else obvious.

### The layers

```
┌─────────────────────────────────────────────────────────┐
│  CLIENT                                                  │
│  React components, hooks, WebSocket clients              │
│  Runs in the browser — no DB, no secrets, no DO access   │
└──────────────────────┬──────────────────────────────────┘
                       │  RSC / "use server" / fetch / WebSocket
┌──────────────────────▼──────────────────────────────────┐
│  WORKER  (src/worker.tsx)                                │
│  Middleware chain, route matching, DO stub routes        │
│  Every request passes through here first                 │
└──────────┬─────────────────────────┬────────────────────┘
           │                         │
    ┌──────▼──────┐         ┌────────▼────────────────────┐
    │  SERVICES   │         │  DURABLE OBJECTS             │
    │             │         │                              │
    │  Pure fns   │         │  UserSessionDO               │
    │  DB / KV    │         │  SessionDurableObject        │
    │  No routing │         │                              │
    │  No DO deps │         │  Stateful, WebSocket,        │
    │             │         │  hibernation, storage        │
    │  Reusable   │         │  Use Manager classes         │
    │  everywhere │         │  to keep DO logic clean      │
    └──────┬──────┘         └─────────────────────────────┘
           │  called from any of:
           ├── Server components (RSC render)
           ├── Server actions ("use server" from client)
           ├── API route handlers (/api/*)
           └── Webhook handlers (/api/webhooks/*)
```

### Services — the reusable core

Services are plain functions that talk to the DB, KV, or external APIs. They have no concept of HTTP, routing, or Durable Objects. This is what makes them reusable everywhere.

```ts
// src/lib/services/orgs.ts
export async function getOrgBySlug(slug: string) {
  return db.organization.findUnique({ where: { slug } });
}
```

### Server actions — client using server things safely

```ts
// src/app/serverActions/orgs/createOrg.ts
"use server";

export async function createOrg(name: string) {
  const slug = slugify(name);
  return db.organization.create({ data: { name, slug } });
}
```

```tsx
// src/app/components/CreateOrgForm.tsx
"use client";
import { createOrg } from "@/app/serverActions/orgs/createOrg";

export function CreateOrgForm() {
  return <button onClick={() => createOrg("My Team")}>Create org</button>;
}
```

### API routes — for external callers

Drop a file in `src/app/api/` and it's live:

```ts
// src/app/api/my-endpoint.ts
export default async function({ request, ctx, params }: any) {
  return Response.json({ ok: true });
}
// → /api/my-endpoint, no registration needed
```

### Durable Objects — stateful distributed compute

DOs are the right tool for state that persists across requests, or coordinating multiple clients in real time.

The key pattern is **Hibernation API** — the DO sleeps between messages and only wakes to process. At 10,000 users each holding an open WebSocket, you're paying roughly $0.75/month.

```ts
export class UserSessionDO extends DurableObject {
  async fetch(request: Request) {
    if (request.headers.get("Upgrade") === "websocket") {
      const [client, server] = Object.values(new WebSocketPair());
      this.state.acceptWebSocket(server, [tag]);
      return new Response(null, { status: 101, webSocket: client });
    }
  }

  webSocketMessage(ws: WebSocket, message: string) {
    this.broadcast(message);
  }

  webSocketClose(ws: WebSocket) {
    console.log("peer disconnected");
  }
}
```

**Keep DOs clean with Manager classes.** Business logic should not live in the DO directly:

```ts
export class MySessionDO extends DurableObject {
  private signaling: SignalingManager;
  private peers: PeerRegistry;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.signaling = new SignalingManager(state);
    this.peers = new PeerRegistry(state);
  }

  webSocketMessage(ws: WebSocket, message: string) {
    this.signaling.handle(ws, message, this.peers);
  }
}
```

### The `/__` route convention

DO routes use the `/__` prefix. All `/__*` routes skip the full middleware chain — no session lookup, no org resolution, no auth overhead. They handle their own auth:

```ts
route("/__user-session", async ({ request }) => {
  const userId = new URL(request.url).searchParams.get("userId");
  const id = env.USER_SESSION_DO.idFromName(userId);
  return env.USER_SESSION_DO.get(id).fetch(request);
}),
```

---

## Middleware system

This is the most evolved part of the starter. Understanding it saves hours of debugging.

### The split: session vs org context

The original starter had a single `shouldSkipMiddleware()` that blocked everything. In production this caused a critical bug: **API routes skipped session context**, so `ctx.user` was always null inside API handlers — meaning auth checks inside API routes were always bypassed.

The fix is to split middleware into two independent concerns:

| Context | What it does | Who needs it |
|---|---|---|
| **Session** | Reads BetterAuth cookie → `ctx.user` | API routes, dashboard, all authenticated pages |
| **Org** | Reads subdomain → `ctx.organization` | Dashboard, org-scoped pages only |

API routes need session (so `ctx.user` is available for auth checks) but do not need org context.

### Centralized route policy — `src/lib/middleware/config.ts`

Instead of scattered skip lists in `middlewareFunctions.ts` and inline CSP headers in `worker.tsx`, all route policies live in one file:

```ts
// src/lib/middleware/config.ts

export const ROUTE_POLICIES = [
  // Force overrides — always run full middleware
  { prefix: "/__draftsync", policy: { level: "full" }, force: true },

  // Public — no auth at all
  { prefix: "/__",          policy: { level: "public" } },  // all internal DO routes
  { prefix: "/s",           policy: { level: "public", headers: { "Permissions-Policy": "camera=*, microphone=*" } } },
  { prefix: "/user/login",  policy: { level: "public" } },
  { prefix: "/api/auth/",   policy: { level: "public" } },  // BetterAuth handles its own session
  { prefix: "/api/webhooks/", policy: { level: "public" } }, // verified by webhook secret

  // Session only — ctx.user available, no org lookup
  { prefix: "/api/",        policy: { level: "session" } },

  // Full — ctx.user + ctx.organization
  { prefix: "/dashboard",   policy: { level: "full", headers: { "Content-Security-Policy": "..." } } },
];
```

**To add a new route, add one entry here. No other files change.**

Three levels:
- `"public"` — skips both session and org context
- `"session"` — reads auth cookie → `ctx.user`, skips org lookup
- `"full"` — reads session + subdomain org, runs autoCreateOrg

### CSP and headers in config

Route-specific headers (CSP, `Permissions-Policy`) also live in config and are applied by a single `applyRouteHeaders` middleware in `worker.tsx`. This means **no inline header-setting functions scattered across route definitions**.

### The middleware chain

Order matters. Do not reorder:

```
1. URL normalization       — www strip, HTTPS enforce
2. CDN passthrough         — cdn.yourdomain.com → R2
3. applyRouteHeaders()     — CSP, Permissions-Policy from config
4. initializeServices()    — DB singleton, called once per isolate
5. setupSessionContext()   — reads BetterAuth cookie → ctx.user
6. setupOrganizationContext() — reads subdomain → ctx.organization
7. autoCreateOrgMiddleware()  — redirects new users to /orgs/new
```

Steps 5 and 6 each check `config.ts` internally to decide whether to run. The caller (`worker.tsx`) doesn't need any skip logic.

### Real-world bugs this prevents

**API routes returning 401 even for logged-in users:**
Caused by `/api/` being in `SKIP_SESSION_PREFIXES`. API routes need session context. Fix: only add `/api/auth/` and `/api/webhooks/` to session skip — not all of `/api/`.

**Subdomain redirects on public routes:**
If `/s` (public room pages) isn't in the skip list, `setupOrganizationContext` runs, finds no org for the main domain, and either 404s or redirects. Fix: add `/s` to org skip.

**`/__` routes triggering session lookup:**
WebSocket upgrade requests aren't standard HTTP — running session middleware on them causes unnecessary DB calls and potential failures. Fix: `/__` prefix skips both contexts entirely.

---

## Full setup guide

### 1. Clone and install

```bash
git clone https://github.com/QuinnsCode/qstart-rwsdk-26.git my-app
cd my-app
pnpm install
```

### 2. Get a domain

We recommend buying through [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/) — DNS is automatic and everything stays in one place.

**Cloudflare dashboard → Domain Registration → Register Domains** → search and purchase.

If you bought elsewhere, go to **Websites → Add a site** and update your registrar's nameservers to Cloudflare's.

**Naming convention:** name resources after your app so they're easy to find across projects:
- `myapp-db-1`
- `myapp-auth-cache-kv`
- `myapp-ratelimit-kv`

### 3. Create Cloudflare resources

#### D1 database

```bash
npx wrangler d1 create myapp-db-1
```

Copy the UUID → paste into `wrangler.jsonc`:
```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "myapp-db-1",
    "database_id": "your-uuid-here"
  }
]
```

#### KV namespaces

```bash
npx wrangler kv namespace create myapp-auth-cache-kv
npx wrangler kv namespace create myapp-ratelimit-kv
```

```jsonc
"kv_namespaces": [
  { "binding": "RATELIMIT_KV", "id": "your-id" },
  { "binding": "AUTH_CACHE_KV", "id": "your-id" }
]
```

> Note: the `binding` name is what the code uses — it doesn't need to match the dashboard name. Only the ID matters.

### 4. Update wrangler.jsonc

```jsonc
{
  "name": "my-app",
  "routes": [
    "yourdomain.com/*",
    "*.yourdomain.com/*"
  ],
  "vars": {
    "BETTER_AUTH_URL": "https://yourdomain.com",
    "PRIMARY_DOMAIN": "yourdomain.com",
    "APP_NAME": "My App"
  }
}
```

### 5. Deploy

Don't create the worker manually in the dashboard — wrangler creates it on first deploy:

```bash
pnpm run release
```

This runs: env check → clean → prisma generate → build → wrangler deploy.

### 6. Connect your domain

**Wildcard subdomains** (required for org scoping):
- Cloudflare dashboard → your domain → DNS
- **Add record** → Type: `CNAME`, Name: `*`, Content: `yourdomain.com`, Proxy: Proxied

This makes `org.yourdomain.com` route to your worker automatically.

> **Real-world gotcha:** After adding the wildcard CNAME, you also need to add a custom domain in the Worker settings (Workers & Pages → your worker → Settings → Domains & Routes). Without this, the Worker won't receive requests on your domain even if DNS is correct.

### 7. Set secrets

```bash
npx wrangler secret put BETTER_AUTH_SECRET     # openssl rand -hex 32
npx wrangler secret put RESEND_API_KEY         # resend.com
npx wrangler secret put STRIPE_SECRET_KEY      # stripe.com
npx wrangler secret put STRIPE_WEBHOOK_SECRET  # stripe dashboard → webhooks
npx wrangler secret put TURNSTILE_SECRET_KEY   # cloudflare → turnstile
npx wrangler secret put GOOGLE_CLIENT_ID       # console.cloud.google.com
npx wrangler secret put GOOGLE_CLIENT_SECRET   # console.cloud.google.com
```

For local dev, copy `.env.example` to `.dev.vars`:
```bash
cp .env.example .dev.vars
```

Wrangler reads `.dev.vars` automatically in dev mode.

### 8. Google OAuth

1. [console.cloud.google.com](https://console.cloud.google.com) → create new project
2. **APIs & Services → OAuth consent screen** → External → fill in app name and domain
3. **Credentials → Create OAuth Client ID** → Web application
4. Authorized JavaScript origins:
   ```
   https://yourdomain.com
   http://localhost:5173
   ```
5. Authorized redirect URIs:
   ```
   https://yourdomain.com/api/auth/callback/google
   http://localhost:5173/api/auth/callback/google
   ```
6. Copy Client ID and Secret → `wrangler secret put`

> **Real-world gotcha:** Google OAuth requires the authorized redirect URI to exactly match what BetterAuth sends. If you get `redirect_uri_mismatch`, check that `BETTER_AUTH_URL` in `wrangler.jsonc` matches your production domain exactly (no trailing slash).

### 9. Resend

1. [resend.com](https://resend.com) → create account
2. **Domains → Add Domain** → enter your domain
3. Add the DNS records shown into Cloudflare DNS
4. Create API key → `npx wrangler secret put RESEND_API_KEY`
5. Update `from` address in `src/lib/auth.ts`:
   ```ts
   from: `My App <no-reply@yourdomain.com>`
   ```

### 10. Stripe

1. [stripe.com](https://stripe.com) → create account
2. **Developers → API Keys** → copy secret key → `wrangler secret put STRIPE_SECRET_KEY`
3. **Developers → Webhooks → Add endpoint** → `https://yourdomain.com/api/webhooks/stripe`
4. Select events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`
5. Copy webhook secret → `wrangler secret put STRIPE_WEBHOOK_SECRET`

Local webhook testing:
```bash
stripe listen --forward-to localhost:5173/api/webhooks/stripe
```

### 11. Turnstile

1. Cloudflare dashboard → **Turnstile → Add site** → enter your domain
2. Copy **Secret Key** → `npx wrangler secret put TURNSTILE_SECRET_KEY`
3. Copy **Site Key** → add to your signup form (public — not a secret)

Local dev uses Cloudflare's always-pass test key in `.dev.vars`:
```bash
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

### 12. Run migrations

```bash
# Local
pnpm run migrate:dev

# Production
pnpm run migrate:prd
```

### 13. Dev

```bash
pnpm dev
```

---

## Required env vars

| Variable | Where |
|---|---|
| `BETTER_AUTH_SECRET` | `openssl rand -hex 32` |
| `BETTER_AUTH_URL` | Your production URL |
| `RESEND_API_KEY` | [resend.com](https://resend.com) |
| `STRIPE_SECRET_KEY` | [stripe.com](https://stripe.com) |
| `STRIPE_WEBHOOK_SECRET` | Stripe dashboard → Webhooks |
| `TURNSTILE_SECRET_KEY` | Cloudflare dashboard → Turnstile |
| `GOOGLE_CLIENT_ID` | [console.cloud.google.com](https://console.cloud.google.com) |
| `GOOGLE_CLIENT_SECRET` | [console.cloud.google.com](https://console.cloud.google.com) |

Optional:

| Variable | Purpose |
|---|---|
| `PRIMARY_DOMAIN` | www redirect + cookie domain scoping |
| `APP_NAME` | Email subjects and from addresses |
| `API_ENCRYPTION_KEY` | Encrypted DB fields (`openssl rand -hex 32`) |

---

## Real-world gotchas

These burned us in production. Documented so they don't burn you.

**Auth cache TTL:** `AUTH_CACHE_KV` caches org and membership lookups with a 5-10 minute TTL. If an org appears missing right after creation, wait or flush KV manually. Don't add console.log-driven debugging and assume the code is broken — check the cache first.

**`dbInitialized` is per-isolate:** The `let dbInitialized = false` guard in `initializeServices()` works within a single Worker isolate lifetime. Cloudflare can spin up new isolates at any time. This is fine — it just means the DB connection is re-initialized in new isolates. Don't rely on this for request deduplication.

**DO naming matters:** Durable Objects are named with `idFromName(key)`. If you rename the key you use, existing DOs are orphaned (still exist, just unreachable). Be deliberate about DO naming schemes before going to production.

**`window.location.origin` on subdomains:** If you generate URLs client-side using `window.location.origin`, you get the current subdomain (`notryanquinn.yourdomain.com`) not the main domain. For shareable links that should work for anyone, generate the full URL server-side in the API handler using `new URL(request.url)` and stripping the subdomain.

**WebSocket `siteKey` validation:** WebSocket connections don't support custom headers. Pass auth tokens as query params (`?siteKey=xxx`) and validate server-side before upgrading the connection.

**Wildcard subdomain + DO routing:** A request to `org.yourdomain.com/__mydo` hits your Worker via the wildcard CNAME. Make sure your `/__` routes in `worker.tsx` don't depend on `ctx.organization` — by the time they run, org context hasn't been set (and shouldn't be, for `/__` routes).

**Migrations on D1:** D1 migrations are one-way in production. There's no rollback. Always test migrations locally with `migrate:dev` before `migrate:prd`. Keep migration files small and focused.

**`pnpm run release` vs `wrangler deploy`:** Always use `pnpm run release`. It runs prisma generate before building. Skipping this after schema changes will deploy stale types and cause runtime errors that are confusing to debug.

---

## Project structure

```
src/
├── worker.tsx                         # Entry point — routes, middleware, DO exports
├── durableObjects/
│   └── userSessionDO.ts               # Example DO — hibernation + WebSocket pattern
├── session/
│   └── durableObject.ts               # BetterAuth session DO (don't modify)
├── lib/
│   ├── auth.ts                        # BetterAuth server config
│   ├── auth-client.ts                 # BetterAuth client config
│   ├── middlewareFunctions.ts         # Session + org context setup
│   ├── rateLimit.ts                   # KV-backed rate limiter
│   ├── turnstile.ts                   # Turnstile verification
│   ├── encrypt.ts                     # Field encryption utility
│   └── middleware/
│       ├── config.ts                  # ← Route policies, CSP headers, skip rules
│       └── autoCreateOrgMiddleware.ts
├── app/
│   ├── pages/
│   │   ├── user/                      # Login, signup, password reset
│   │   ├── landing/                   # Public landing page
│   │   ├── dashboard/                 # Authenticated home
│   │   ├── legal/                     # Terms, Privacy
│   │   └── errors/                    # OrgNotFound, NoAccess
│   ├── api/
│   │   ├── stripe/                    # create-checkout.ts
│   │   └── webhooks/                  # stripe-wh.ts, lemonsqueezy-wh.ts
│   ├── serverActions/
│   │   ├── admin/
│   │   ├── orgs/
│   │   ├── stripe/
│   │   └── user/
│   ├── hooks/
│   │   └── useUserSession.ts
│   └── components/
│       └── settings/
└── db.ts                              # Prisma client singleton
```

---

## Extending

### New Durable Object

1. Create `src/durableObjects/myDO.ts` — model on `userSessionDO.ts`
2. Export from `worker.tsx`: `export { MyDO } from './durableObjects/myDO'`
3. Add to `wrangler.jsonc` under `durable_objects.bindings`
4. Add migration under `migrations`
5. Wire a route: `route("/__mydo", async ({ request }) => { ... })`

### New API endpoint

```ts
// src/app/api/my-feature.ts
export default async function({ request, ctx, params }: any) {
  return Response.json({ ok: true });
}
// → /api/my-feature immediately, no registration needed
```

### New page

```ts
import MyPage from "@/app/pages/MyPage";
route("/my-page", MyPage),
```

Add its policy to `src/lib/middleware/config.ts`:
```ts
{ prefix: "/my-page", policy: { level: "full" } },
```

### New server action

```ts
"use server";
export async function myAction(input: string) {
  return db.something.create({ data: { input } });
}
```

### New static route

Add to `src/app/pages/static/routes.ts` and add a `"public"` policy entry in `config.ts`. No worker changes needed.

---

## Further reading

- [RedwoodSDK docs](https://docs.rwsdk.com/)
- [BetterAuth docs](https://www.better-auth.com/)
- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Prisma D1 adapter](https://www.prisma.io/docs/orm/overview/databases/cloudflare-d1)
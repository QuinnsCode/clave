# qlave

P2P video calling as a widget. Drop one script tag on any page. Your users get a floating video room — no app, no account, no Discord required.

Built on top of [qstart-rwsdk](./README.md) — read that first if you're unfamiliar with the base stack.

---

## What qlave adds to the starter

- **Widget** — injectable `<script>` tag that renders a draggable pill UI on any third-party site
- **Durable Object signaling** — `QlaveSessionDO` handles WebRTC signaling via WebSocket hibernation
- **Room codes** — short human-readable codes (`abc-xyz1234`) stored in KV, resolve to session UUIDs, expire after 24 hours
- **Site keys** — per-user API keys that authenticate widget embeds and control which sessions are allowed
- **Hosted rooms** — `/s/:code` public room pages, no embed required
- **Usage tracking** — live session state in KV, historical logs in D1
- **Bookmarklet** — drag-to-bookmark widget injection for sites you don't control

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  WIDGET (cdn.qlave.dev/latest/widget.js)                     │
│  Injected pill UI — auth, session join, draggable panel      │
│  Talks to qlave.dev/api/* via fetch                          │
│  Connects to /__qlave/:sessionId via WebSocket               │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  WORKER (src/worker.tsx)                                     │
│  Route: /s/:code        → SessionPage (public)               │
│  Route: /__qlave/:code  → QlaveSessionDO (WebSocket)         │
│  Route: /api/qlave/*    → API handlers (session-authed)      │
│  Route: /dashboard      → DashboardPage (full auth)          │
└──────────────┬──────────────────────┬───────────────────────┘
               │                      │
    ┌──────────▼──────────┐  ┌────────▼──────────────────────┐
    │  SERVICES           │  │  QlaveSessionDO                │
    │                     │  │                                │
    │  siteService.ts     │  │  WebSocket Hibernation API     │
    │  roomCode.ts        │  │  Peer registry                 │
    │  validateSiteKey.ts │  │  Signal relay (offer/answer/   │
    │                     │  │  ice-candidate)                │
    │  KV for:            │  │  KV sync (live state)          │
    │  - room codes       │  │  D1 flush (session end)        │
    │  - live sessions    │  │                                │
    │  - site key cache   │  │  Named by session UUID         │
    │                     │  │  Hibernates between messages   │
    └─────────────────────┘  └────────────────────────────────┘
```

---

## Key concepts

### Site keys

Every user gets a site key — a random token stored in D1 and cached in KV. The widget reads it from `data-site` on the script tag. The DO validates it before accepting WebSocket connections.

```
<script src="https://cdn.qlave.dev/latest/widget.js" data-site="sk_live_abc123"></script>
```

The special value `siteKey=platform` is whitelisted for hosted rooms (`/s/:code`) so guests can join without an embed context. This is validated in `validateSiteKey.ts`.

**Key files:**
- `src/lib/qlave/siteService.ts` — `createSiteForUser()`, `getOrCreateSite()`, `rotateSiteKey()`
- `src/lib/qlave/validateSiteKey.ts` — validates against D1, caches in KV

### Room codes vs session IDs

There are two identifiers in play:

| Identifier | Format | Where stored | Purpose |
|---|---|---|---|
| Room code | `abc-xyz1234` | KV (24hr TTL) | Short, shareable link segment |
| Session ID | UUID | KV value, D1 | Actual DO name, used for WebSocket |

The flow:
1. Dashboard calls `POST /api/qlave/createRoom` → generates code + UUID → stores `room:{code} → { sessionId }` in KV
2. `/s/:code` → `SessionPage` → `resolveRoom(code)` → gets UUID from KV
3. `SessionClient` connects to `/__qlave/{uuid}` via WebSocket
4. DO is named by the UUID via `idFromName(uuid)`

**Never** use the room code as the DO name. The code is just a KV key. The UUID is the stable identity.

### WebSocket signaling — message protocol

The DO (`QlaveSessionDO`) and `SessionClient` must speak the same protocol. This burned us — the original client used `peer-list` and `ice` while the DO sent `joined` and `ice-candidate`. Everything needs to match:

**DO → Client:**
```typescript
{ type: "joined", peerId: string, peers: string[] }   // you joined; existing peer IDs
{ type: "peer-joined", peerId: string }                // new peer arrived
{ type: "peer-left", peerId: string }                  // peer disconnected
```

**Client → Client (relayed via DO):**
```typescript
{ type: "offer",         to, from, sdp }
{ type: "answer",        to, from, sdp }
{ type: "ice-candidate", to, from, candidate }  // NOT "ice"
```

**Client → DO:**
```typescript
{ type: "join" }   // sent on WebSocket open
{ type: "leave" }  // sent before closing
```

The DO relays anything with a `to` field directly to that peer. It handles `join` and `leave` itself and broadcasts `peer-joined` / `peer-left` to the room.

### Usage tracking

Two-tier:
- **KV** (`RATELIMIT_KV`) — live session state, updated on joins/leaves and every 50th message. Key: `usage:site:{siteKey}:session:{sessionId}`. Expires with the session.
- **D1** (`qlaveSessionLog`) — permanent record written when the last peer leaves (DO alarm fires). Stores `sessionId`, `siteKey`, `startedAt`, `endedAt`, `peakPeers`, `messageCount`, `durationMs`.

The dashboard reads from D1 (historical) and KV (live). The DO flushes to D1 via alarm to avoid writing on every message.

---

## File structure

```
src/
├── widget/                            # CDN-deployed widget bundle
│   ├── index.ts                       # Entry — injects pill, handles auth flow
│   ├── pill.ts                        # Draggable pill + panel UI
│   ├── styles.ts                      # Injected CSS
│   ├── auth.ts                        # Widget-side auth (validates session cookie)
│   └── icons.ts                       # Lucide Drum icon as SVG string
│
├── durableObjects/
│   └── qlaveSessionDO.ts              # WebSocket signaling, KV sync, D1 flush
│
├── lib/qlave/
│   ├── siteService.ts                 # createSiteForUser, getOrCreateSite, rotateSiteKey
│   ├── validateSiteKey.ts             # Validates data-site against D1 + KV cache
│   ├── roomCode.ts                    # generateCode, createRoom, resolveRoom (KV)
│   └── types.ts                       # Shared types (Status, Peer, SessionConfig, etc.)
│
├── app/
│   ├── pages/
│   │   ├── session/
│   │   │   └── SessionPage.tsx        # /s/:code — resolves code, renders SessionClient
│   │   └── dashboard/
│   │       └── DashboardPage.tsx      # Server-side: fetches site + session data
│   │
│   ├── components/
│   │   ├── Session/
│   │   │   └── SessionClient.tsx      # Full WebRTC client — lobby + session phases
│   │   └── DashboardClient/
│   │       ├── DashboardClient.tsx    # Client shell with tab nav
│   │       └── HomeTab.tsx            # Room creation, embed code, bookmarklet, stats
│   │
│   └── api/qlave/
│       ├── createRoom.ts              # POST — generates code + UUID, stores in KV
│       ├── usage.ts                   # GET — live KV + D1 historical data
│       └── rotateSiteKey.ts           # POST — rotates site key, busts KV cache
```

---

## Routes

| Route | Auth level | Handler |
|---|---|---|
| `/` | public | `LandingPage` |
| `/s` | public | redirect → `/dashboard` or `/user/login` |
| `/s/:code` | public | `SessionPage` (resolves code, renders room) |
| `/__qlave/:code` | public (validated by siteKey query param) | `QlaveSessionDO` |
| `/api/qlave/createRoom` | session | creates room code + UUID |
| `/api/qlave/usage` | session | dashboard stats |
| `/api/qlave/rotate-site-key` | session | rotates site key |
| `/dashboard` | full | `DashboardPage` |

All `/s` and `/__qlave` routes are in the `"public"` policy tier in `src/lib/middleware/config.ts` — they skip both session and org context. This is required: running org middleware on `/s` caused redirect loops on the main domain.

---

## Setup — qlave-specific steps

This assumes you've already completed the base `qstart-rwsdk` setup (domain, D1, KV, secrets).

### 1. Add qlave KV keys to wrangler.jsonc

qlave uses the existing `RATELIMIT_KV` binding for both rate limiting and session/room state. No new KV namespace needed.

Room codes: `room:{code}` → `{ sessionId, createdAt }` (24hr TTL)
Live sessions: `usage:site:{siteKey}:session:{sessionId}` → session state
Site key cache: `sitekey:{siteKey}` → site record (5min TTL)

### 2. Add the Durable Object

In `wrangler.jsonc`:
```jsonc
"durable_objects": {
  "bindings": [
    { "name": "QLAVE_SESSION_DO", "class_name": "QlaveSessionDO" }
  ]
},
"migrations": [
  { "tag": "v1", "new_classes": ["QlaveSessionDO"] }
]
```

Export from `worker.tsx`:
```typescript
export { QlaveSessionDO } from "./durableObjects/qlaveSessionDO";
```

### 3. Run the D1 migration for session logs

```sql
CREATE TABLE IF NOT EXISTS QlaveSessionLog (
  id          TEXT PRIMARY KEY,
  sessionId   TEXT NOT NULL,
  siteKey     TEXT NOT NULL,
  startedAt   DATETIME NOT NULL,
  endedAt     DATETIME,
  peakPeers   INTEGER DEFAULT 0,
  messageCount INTEGER DEFAULT 0,
  durationMs  INTEGER
);
```

Add to your Prisma schema and run `pnpm run migrate:prd`.

### 4. Deploy the widget to R2

The widget is a separate esbuild bundle deployed to `cdn.qlave.dev` via R2:

```bash
pnpm run build:widget    # esbuild src/widget/index.ts → dist/widget.js
pnpm run deploy:widget   # wrangler r2 object put cdn/latest/widget.js
```

The worker serves R2 objects for `cdn.qlave.dev/*` requests. Make sure your `wrangler.jsonc` has the R2 bucket binding and the CDN subdomain routes to the worker.

### 5. Add CSP for pages that embed the widget

Any page embedding the widget needs to allow the CDN and the qlave WebSocket origin:

```
Content-Security-Policy: script-src 'self' https://cdn.qlave.dev; connect-src 'self' wss://qlave.dev wss://*.qlave.dev
```

The `/qlave-test` route in the dashboard has this pre-configured as a test bed.

---

## Real-world bugs we hit

**`/s` redirect loop on main domain:**
`setupOrganizationContext` ran on `/s` routes, found no org for `qlave.dev` (no subdomain), and redirected. Fix: add `/s` to the `"public"` policy in `config.ts`. This was the most confusing bug — looked like auth was broken but it was org middleware firing on a public route.

**Message type mismatch (DO vs SessionClient):**
Original `SessionClient` listened for `peer-list` and `ice`. The DO sent `joined` and `ice-candidate`. Nothing worked. Always write the protocol down in one place and make both sides reference it. See the protocol table above.

**`/s/:sessionId` param name:**
Worker route was `/s/:sessionId` but `SessionPage` read `params.code`. Route params are positional by name — a mismatch silently passes `undefined`. Changed worker route to `/s/:code` to match.

**Room URL showing `undefined`:**
`HomeTab` was doing `${window.location.origin}${url}` but `url` from the API was already a full path `/s/code`. The concatenation produced `https://qlave.devundefined` in some cases. Fix: API returns full URL (`https://qlave.dev/s/{code}`), client uses it directly.

**Subdomain in room URLs:**
`createRoom` was called from `notryanquinn.qlave.dev/dashboard`. `new URL(request.url).origin` returned the subdomain origin. Guests clicking the link got org middleware firing on them. Fix: strip subdomain server-side when building the room URL, always return `qlave.dev/s/{code}`.

```typescript
// createRoom.ts
const reqUrl = new URL(request.url);
const isLocal = reqUrl.hostname.includes("localhost");
const baseUrl = isLocal
  ? `${reqUrl.protocol}//${reqUrl.host}`
  : `https://${reqUrl.hostname.split(".").slice(-2).join(".")}`;

return Response.json({ code, url: `${baseUrl}/s/${code}` });
```

**WebSocket auth — no custom headers:**
WebSocket upgrades don't support custom headers in browsers. Passing the site key as a query param (`?siteKey=xxx`) is correct and necessary. Validate it server-side in the DO route before forwarding to the DO.

**DO named by room code instead of UUID:**
Early versions named the DO with `idFromName(roomCode)`. The room code is a KV key, not an identity — it expires after 24hr and could theoretically collide. The DO should be named by the UUID session ID. The room code is just how you look up the UUID.

**`params.code` vs `params.sessionId` in DO route:**
The DO route was `/__qlave/:code` but the code inside read `params.sessionId`. CF Workers route params are named by what you put in the route pattern. Rename to match or it's silently `undefined`.

**`Permissions-Policy: camera=*, microphone=*` missing on `/s`:**
Browsers block camera/mic access without this header. `/s` routes need it. It's now set in `config.ts` as part of the `/s` route policy so it applies automatically.

---

## Widget deployment

The widget lives at `cdn.qlave.dev/latest/widget.js`. It's a self-contained IIFE — no dependencies, no framework. Build and deploy:

```bash
# Build
npx esbuild src/widget/index.ts \
  --bundle \
  --format=iife \
  --global-name=QlaveWidget \
  --outfile=dist/widget.js \
  --minify

# Deploy to R2
npx wrangler r2 object put qlave-cdn/latest/widget.js \
  --file dist/widget.js \
  --content-type "application/javascript"
```

The worker serves this via a CDN passthrough route that reads from R2:

```typescript
// worker.tsx
route("/cdn/*", async ({ request }) => {
  const url = new URL(request.url);
  const key = url.pathname.replace("/cdn/", "");
  const obj = await env.CDN_BUCKET.get(key);
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(obj.body, {
    headers: { "Content-Type": "application/javascript", "Cache-Control": "public, max-age=86400" }
  });
}),
```

`cdn.qlave.dev` is a CNAME to `qlave.dev` — the worker intercepts based on hostname.

---

## Hosted rooms vs embedded widget

| | Hosted room (`/s/:code`) | Embedded widget |
|---|---|---|
| URL | `qlave.dev/s/abc-xyz1234` | Any third-party site |
| Auth | None required to join | Site key validated |
| siteKey used | `platform` (whitelisted) | User's real site key |
| Created by | Dashboard "Open room" button | Widget init on page load |
| Use case | Ad-hoc calls, share a link | Persistent widget on your site |

Both end up in the same `QlaveSessionDO`. The only difference is which site key authenticated the connection.

---

## Bookmarklet

The bookmarklet injects the widget onto any page without an embed. Generated per-user with their site key baked in:

```javascript
javascript:(function(){
  var s = document.createElement('script');
  s.src = 'https://cdn.qlave.dev/latest/widget.js';
  s.dataset.site = 'USER_SITE_KEY';
  document.body.appendChild(s);
})();
```

The dashboard renders this as a draggable `<a>` element. Users drag it to their bookmarks bar and click it on any page to launch qlave.

---

## Future work

- **Private rooms** — `visibility: "public" | "private"` already planned in `createRoom`. Private rooms check `ctx.user` belongs to owner's org before rendering `SessionClient`.
- **Peer names in DO** — the DO currently only tracks peer IDs. Names would need to be passed through the `join` message and stored in DO state.
- **TURN servers** — currently using only Google STUN. Symmetric NAT will cause connection failures. Add TURN for production reliability.
- **Room persistence** — 24hr TTL is intentional for MVP. Permanent rooms (personal meeting URL style) are a natural next feature.
- **npx qlave init** — self-host story. Deploy the full stack to your own CF account in one command.
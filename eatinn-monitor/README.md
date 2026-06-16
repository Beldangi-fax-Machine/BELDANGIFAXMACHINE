# EatInnMonitor — Admin Control Center

A secure backend monitoring console for the (fictional) **EatInn** food-delivery
platform. It lets an authorized admin:

- **Securely log into the backend** (email + password + 2FA, session-scoped, audit-logged).
- **Inspect Sentry errors at scale** — issue list, severity, affected users, stack traces.
- **Talk to a Claude assistant with MCP access** to those issues, the bug reports
  and the ban ledger. Claude explains larger fixes in plain language and summarizes
  *what users are actually saying* in bug reports.
- **Get notified when things go bad** — live alerts when error rates or risk scores cross thresholds.
- **Run a ban system** — watch bad-actor accounts live, run a risk analysis, then
  **temporarily block or permanently ban** them.
- **Watch a live movement map** — a self-contained canvas map of users/riders with
  no external map/tile dependencies, color-coded by risk.

The UI is strongly built, fully responsive, and runs two ways.

---

## 1. Static demo (GitHub Pages) — zero setup

The front-end (`index.html`, `styles.css`, `app.js`, `data.js`) is a self-contained
single-page app. With no backend it uses realistic mock data and a local,
deterministic Claude *simulation* so every screen is interactive.

**Run locally:**
```bash
cd eatinn-monitor
python3 -m http.server 5500
# open http://localhost:5500
```

**Demo login:** `admin@eatinn.io` / `monitor` / `123456`

**On GitHub Pages:** enable Pages for this repo; the app is served at
`/<repo>/eatinn-monitor/`.

---

## 2. Live mode (real Claude + real Sentry)

The `server/` folder is a small Express backend that adds real auth, real Sentry
data, and a real Claude assistant **with MCP access to the hosted Sentry MCP
server** — so Claude can pull issue detail itself, not just what we hand it.

```bash
cd eatinn-monitor/server
cp .env.example .env        # fill in keys
npm install
npm start                   # http://localhost:8787  (also serves the UI)
```

Then point the front-end at the backend by setting, before `app.js` loads:
```html
<script>window.EATINN_API_BASE = "http://localhost:8787";</script>
```
(or serve the UI from the same origin, which the backend already does).

### What you need
| Capability | Env var(s) |
|---|---|
| Claude assistant | `ANTHROPIC_API_KEY` (model defaults to `claude-opus-4-8`) |
| Sentry issues | `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` |
| Claude → Sentry MCP | `SENTRY_MCP_URL` (default `https://mcp.sentry.dev/mcp`), `SENTRY_MCP_TOKEN` |
| Admin login | `ADMIN_EMAIL`, `ADMIN_PASSWORD` |

Everything degrades gracefully — missing keys fall back to stubs so the app stays usable.

---

## Architecture

```
 Browser (static SPA)
   ├─ Login gate ──────────────► POST /api/login   (session cookie + audit)
   ├─ Sentry view ─────────────► GET  /api/issues  ── Sentry REST API
   ├─ Claude assistant ────────► POST /api/claude  ── Anthropic API
   │                                                    └─ MCP ─► Sentry MCP server
   ├─ Ban control ─────────────► POST /api/enforce (ban ledger + audit)
   ├─ Live map (canvas) ───────► local movement feed (no external tiles)
   └─ Notifications / toasts ──► threshold alerts
```

Key endpoints (`server/server.js`): `/api/login`, `/api/issues`, `/api/claude`,
`/api/enforce`, `/api/ledger`, `/api/audit`, `/healthz`.

## Files
```
eatinn-monitor/
├─ index.html        # app shell + login
├─ styles.css        # full dark admin theme
├─ app.js            # views, charts, live map, Claude bridge
├─ data.js           # seed/mock signals for the offline demo
├─ server/
│  ├─ server.js      # Express: auth, Sentry, Claude+MCP, ban ledger, audit
│  ├─ package.json
│  └─ .env.example
└─ README.md
```

## Security notes
- 2FA is demo-only (any 6-digit code). Wire a real TOTP secret before production.
- Sessions and the ban ledger are in-memory — back them with Redis/Postgres for real use.
- Sentry/Anthropic tokens stay server-side; the browser never sees them.
- Every privileged action (login, ban, Claude query) is written to the audit log.

> This is a security/operations *defensive* tool: it surfaces errors and abuse so
> an authorized admin can respond. The ban system requires an authenticated admin
> session and logs every enforcement action.

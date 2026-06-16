/**
 * EatInnMonitor — backend
 *
 * Responsibilities:
 *   1. Secure admin login (session cookie + audit log).
 *   2. Read Sentry issues (live Sentry API when SENTRY_AUTH_TOKEN is set).
 *   3. A Claude assistant that reasons over those issues, the bug reports and
 *      the ban ledger — with MCP access to the hosted Sentry MCP server so it
 *      can pull issue detail itself, not just what we hand it.
 *   4. Ban-ledger enforcement (temporary block / permanent ban) with audit.
 *
 * Everything degrades gracefully: with no API keys it still serves the UI and
 * returns helpful stub responses, so you can demo before wiring real services.
 */

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8787;
const MODEL = process.env.EATINN_MODEL || "claude-opus-4-8";

/* ---- config (env) ---- */
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@eatinn.io";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "monitor";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN || "";
const SENTRY_ORG = process.env.SENTRY_ORG || "";
const SENTRY_PROJECT = process.env.SENTRY_PROJECT || "";
// Hosted Sentry MCP server — lets Claude fetch issue detail on its own.
const SENTRY_MCP_URL = process.env.SENTRY_MCP_URL || "https://mcp.sentry.dev/mcp";
const SENTRY_MCP_TOKEN = process.env.SENTRY_MCP_TOKEN || SENTRY_AUTH_TOKEN;

const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

/* ---- app ---- */
const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "..")));        // serve the static UI

/* ---- tiny session + audit store (swap for Redis/DB in prod) ---- */
const sessions = new Map();          // token -> { email, ts }
const auditLog = [];                 // { ts, actor, action, target }
const banLedger = new Map();         // accountId -> { action, ts, actor }

function audit(actor, action, target) {
    const entry = { ts: new Date().toISOString(), actor, action, target };
    auditLog.push(entry);
    console.log(`[audit] ${entry.ts} ${actor} ${action} ${target ?? ""}`);
}
function requireAdmin(req, res, next) {
    const token = req.cookies.eatinn_session;
    const s = token && sessions.get(token);
    if (!s) return res.status(401).json({ error: "unauthorized" });
    req.admin = s.email;
    next();
}

/* ---- auth ---- */
app.post("/api/login", (req, res) => {
    const { email, password, code } = req.body || {};
    // In production verify against your admin store + a real TOTP secret.
    const okCreds = email === ADMIN_EMAIL && password === ADMIN_PASSWORD;
    const okTotp = /^\d{6}$/.test(String(code || ""));   // demo accepts any 6 digits
    if (!okCreds || !okTotp) {
        audit(email || "unknown", "login_failed", "");
        return res.status(401).json({ error: "invalid credentials or 2FA" });
    }
    const token = crypto.randomBytes(24).toString("hex");
    sessions.set(token, { email, ts: Date.now() });
    audit(email, "login_ok", "");
    res.cookie("eatinn_session", token, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 8 * 3600e3 });
    res.json({ ok: true, operator: { email, role: "Super Admin" } });
});
app.post("/api/logout", requireAdmin, (req, res) => {
    sessions.delete(req.cookies.eatinn_session);
    audit(req.admin, "logout", "");
    res.json({ ok: true });
});

/* ---- Sentry issues ---- */
app.get("/api/issues", requireAdmin, async (req, res) => {
    try {
        res.json({ issues: await fetchSentryIssues() });
    } catch (e) {
        res.status(502).json({ error: "sentry_unavailable", detail: String(e) });
    }
});

async function fetchSentryIssues() {
    if (!SENTRY_AUTH_TOKEN || !SENTRY_ORG || !SENTRY_PROJECT) return [];
    const url = `https://sentry.io/api/0/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/issues/?statsPeriod=24h&query=is:unresolved`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${SENTRY_AUTH_TOKEN}` } });
    if (!r.ok) throw new Error(`sentry ${r.status}`);
    const data = await r.json();
    return data.map((i) => ({
        id: i.shortId, level: i.level, title: i.title || i.metadata?.value,
        culprit: i.culprit, events: Number(i.count), users: i.userCount,
        firstSeen: i.firstSeen, lastSeen: i.lastSeen, permalink: i.permalink,
    }));
}

/* ---- ban enforcement ---- */
app.post("/api/enforce", requireAdmin, (req, res) => {
    const { accountId, action } = req.body || {};
    if (!accountId || !["banned", "blocked"].includes(action))
        return res.status(400).json({ error: "bad_request" });
    banLedger.set(accountId, { action, ts: Date.now(), actor: req.admin });
    audit(req.admin, `account_${action}`, accountId);
    // Real impl: revoke sessions, freeze payouts, notify risk queue, etc.
    res.json({ ok: true, accountId, action });
});
app.get("/api/ledger", requireAdmin, (_req, res) =>
    res.json({ ledger: [...banLedger.entries()].map(([id, v]) => ({ id, ...v })) }));

/* ---- Claude assistant (MCP-connected) ---- */
app.post("/api/claude", requireAdmin, async (req, res) => {
    const payload = req.body || {};
    if (!anthropic) {
        return res.json({ text: "Claude is not configured on this server (set ANTHROPIC_API_KEY). The static UI's offline simulation is being used instead." });
    }
    try {
        const text = await runClaude(payload);
        audit(req.admin, "claude_query", payload.kind || "chat");
        res.json({ text });
    } catch (e) {
        res.status(502).json({ error: "claude_error", detail: String(e) });
    }
});

const SYSTEM_PROMPT = `You are the operations co-pilot inside EatInnMonitor, an admin console for a food-delivery platform.
You help an authorized admin triage production errors, understand what users report in bug reports, and assess risky accounts.
You have MCP access to the Sentry issue tracker — use it to pull stack traces, releases, and event detail when it helps.
Be concrete and decisive: when explaining an error, give the likely root cause and a prioritized, shippable fix.
When assessing an account, weigh order velocity, chargebacks, device spread and geo, then recommend a clear action (no action / temporary block / permanent ban) with a one-line justification.
Lead with the outcome. Keep it readable, not padded.`;

async function runClaude({ kind, prompt, issue, actor }) {
    // Build the user turn with whatever structured context we already hold.
    let userText;
    if (kind === "explain_issue" && issue) {
        userText = `Explain this Sentry issue in plain language and propose a prioritized fix.\n\n${JSON.stringify(issue, null, 2)}\n\nIf useful, pull more detail on issue ${issue.id} via the Sentry MCP tools.`;
    } else if (kind === "assess_actor" && actor) {
        userText = `Run a risk assessment on this account and recommend an enforcement action.\n\n${JSON.stringify(actor, null, 2)}`;
    } else {
        userText = prompt || "Summarize current system health.";
    }

    // Attach the hosted Sentry MCP server so Claude can fetch issue detail itself.
    const useMcp = Boolean(SENTRY_MCP_TOKEN);
    const req = {
        model: MODEL,
        max_tokens: 1600,
        thinking: { type: "adaptive" },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userText }],
    };

    let message;
    if (useMcp) {
        message = await anthropic.beta.messages.create({
            ...req,
            betas: ["mcp-client-2025-11-20"],
            mcp_servers: [{
                type: "url",
                name: "sentry",
                url: SENTRY_MCP_URL,
                authorization_token: SENTRY_MCP_TOKEN,
            }],
        });
    } else {
        message = await anthropic.messages.create(req);
    }

    return message.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim() || "(no text returned)";
}

/* ---- audit + health ---- */
app.get("/api/audit", requireAdmin, (_req, res) => res.json({ audit: auditLog.slice(-200) }));
app.get("/healthz", (_req, res) => res.json({
    ok: true,
    claude: Boolean(anthropic),
    sentry: Boolean(SENTRY_AUTH_TOKEN),
    sentryMcp: Boolean(SENTRY_MCP_TOKEN),
    model: MODEL,
}));

app.listen(PORT, () => {
    console.log(`EatInnMonitor backend on http://localhost:${PORT}`);
    console.log(`  claude=${Boolean(anthropic)} sentry=${Boolean(SENTRY_AUTH_TOKEN)} sentryMcp=${Boolean(SENTRY_MCP_TOKEN)} model=${MODEL}`);
});

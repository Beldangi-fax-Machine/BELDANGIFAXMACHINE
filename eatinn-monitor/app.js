/* ===== EatInnMonitor — front-end controller ===== */
(() => {
"use strict";
const D = window.EATINN;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* If a backend is deployed, point the static UI at it. Leave null for the
   fully-offline GitHub Pages demo (Claude + Sentry are simulated locally). */
const API_BASE = window.EATINN_API_BASE || null;

const state = { issue: null, actor: null, banned: {}, mapRAF: null };

/* ---------- auth ---------- */
const loginForm = $("#login-form");
loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = $("#login-email").value.trim();
    const pw = $("#login-password").value;
    const code = $("#login-2fa").value;
    const err = $("#login-error");
    // Demo credential check (the real backend verifies against the admin store).
    if (email === D.operator.email && pw === "monitor" && code === "123456") {
        err.hidden = true;
        $("#login-screen").hidden = true;
        $("#app").hidden = false;
        boot();
    } else {
        err.textContent = "Invalid credentials or 2FA token.";
        err.hidden = false;
    }
});
$("#logout-btn").addEventListener("click", () => location.reload());

/* ---------- nav ---------- */
const titles = {
    overview: ["Overview", "Real-time system health across the EatInn platform"],
    errors: ["Sentry Errors", "Triage and explain production issues"],
    assistant: ["Claude Assistant", "MCP-connected reasoning over your live signals"],
    bans: ["Ban Control", "Live risk analysis and account enforcement"],
    map: ["Live Map", "User and rider movement in real time"],
    notifications: ["Notifications", "Alerts fired when things go bad"],
};
function go(view) {
    $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    $$(".view").forEach((v) => (v.hidden = v.id !== "view-" + view));
    const [t, s] = titles[view];
    $("#view-title").textContent = t;
    $("#view-sub").textContent = s;
    if (view === "map") startMap(); else stopMap();
}
$$(".nav-item").forEach((b) => b.addEventListener("click", () => go(b.dataset.view)));
document.addEventListener("click", (e) => {
    const j = e.target.closest("[data-jump]");
    if (j) go(j.dataset.jump);
});
$("#refresh-btn").addEventListener("click", () => { renderAll(); toast("ok", "Refreshed", "Pulled latest signals."); });

/* ---------- boot ---------- */
function boot() {
    $("#op-name").textContent = D.operator.name;
    $("#op-avatar").textContent = D.operator.name[0].toUpperCase();
    renderAll();
    // simulate a live alert shortly after login
    setTimeout(() => toast("bad", "Live alert", "payments error rate crossed 11% — notification sent."), 4000);
}
function renderAll() {
    renderOverview(); renderIssues(); renderActors(); renderNotifications(); renderMcpContext();
    $("#nav-error-count").textContent = D.issues.length;
    $("#nav-risk-count").textContent = D.actors.filter((a) => a.risk >= 60).length;
    $("#nav-notif-count").textContent = D.notifications.filter((n) => n.unread).length;
}

/* ---------- overview ---------- */
function renderOverview() {
    const totalEvents = D.issues.reduce((n, i) => n + i.events, 0);
    const totalUsers = D.issues.reduce((n, i) => n + i.users, 0);
    $("#kpi-errors").textContent = totalEvents.toLocaleString();
    $("#kpi-errors-delta").textContent = "▲ 34% vs prior 24h";
    $("#kpi-users").textContent = totalUsers.toLocaleString();
    $("#kpi-risk").textContent = D.actors.filter((a) => a.risk >= 60).length;
    $("#kpi-risk-sub").textContent = "flagged live";
    $("#kpi-sessions").textContent = D.movers.length;
    $("#kpi-sessions-sub").textContent = "on the map now";

    $("#service-health").innerHTML = D.services.map((s) => {
        const cls = s.status === "ok" ? "ok" : s.status === "degraded" ? "warn" : "bad";
        return `<div class="svc"><span class="svc-name"><span class="dot ${cls}"></span> ${s.name}</span>
            <span class="svc-meta">p95 ${s.p95}ms · err ${s.errRate}%</span></div>`;
    }).join("");

    $("#overview-issues").innerHTML = D.issues.slice(0, 3).map(issueRow).join("");
    $$("#overview-issues .issue-row").forEach((r) =>
        r.addEventListener("click", () => { go("errors"); selectIssue(r.dataset.id); }));

    drawSpark();
}
function drawSpark() {
    const c = $("#spark-chart"); if (!c) return;
    const w = c.width = c.clientWidth, h = c.height;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    const pts = [4, 6, 5, 9, 7, 11, 8, 14, 19, 16, 24, 22];
    const max = Math.max(...pts), pad = 16;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#ff6b3d66"); grad.addColorStop(1, "#ff6b3d00");
    ctx.beginPath();
    pts.forEach((p, i) => {
        const x = pad + (i / (pts.length - 1)) * (w - pad * 2);
        const y = h - pad - (p / max) * (h - pad * 2);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.strokeStyle = "#ff6b3d"; ctx.lineWidth = 2; ctx.stroke();
    ctx.lineTo(w - pad, h - pad); ctx.lineTo(pad, h - pad); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
}

/* ---------- issues ---------- */
function issueRow(i) {
    return `<div class="issue-row" data-id="${i.id}">
        <div class="sev ${i.level}"></div>
        <div class="issue-main">
            <div class="issue-title">${i.title}</div>
            <div class="issue-sub">${i.culprit} · ${i.id} · ${i.lastSeen}</div>
        </div>
        <div class="issue-count"><b>${i.events.toLocaleString()}</b><span>${i.users} users</span></div>
    </div>`;
}
function renderIssues() {
    const filter = $("#error-filter").value;
    const list = D.issues.filter((i) => filter === "all" || i.level === filter);
    $("#issue-list").innerHTML = list.map(issueRow).join("") || `<div class="empty-state">No issues</div>`;
    $$("#issue-list .issue-row").forEach((r) =>
        r.addEventListener("click", () => selectIssue(r.dataset.id)));
}
$("#error-filter").addEventListener("change", renderIssues);

function selectIssue(id) {
    state.issue = D.issues.find((i) => i.id === id);
    $$("#issue-list .issue-row").forEach((r) => r.classList.toggle("active", r.dataset.id === id));
    const i = state.issue;
    $("#issue-detail").innerHTML = `
        <div class="detail-head">
            <h3>${i.title}</h3>
            <div>
                <span class="tag ${i.level}">${i.level.toUpperCase()}</span>
                <span class="tag">${i.id}</span>
                <span class="tag">${i.release}</span>
                <span class="tag">${i.events.toLocaleString()} events</span>
                <span class="tag">${i.users} users</span>
            </div>
        </div>
        <div class="stack">${i.stack}</div>
        <div class="detail-section">
            <h4>What users are saying (${i.reports.length})</h4>
            ${i.reports.map((r) => `<div class="report"><div class="who">${r.who}</div>${r.text}</div>`).join("")}
        </div>
        <div class="detail-section">
            <div class="ai-box">
                <h4>✦ Claude explanation</h4>
                <div class="ai-text" id="issue-ai">
                    <button class="btn btn-primary btn-sm" id="explain-btn">Explain this error & propose a fix</button>
                </div>
            </div>
        </div>`;
    $("#explain-btn").addEventListener("click", explainIssue);
}
async function explainIssue() {
    const box = $("#issue-ai");
    box.innerHTML = `<span class="chat-bubble typing">✦ Claude is analyzing the stack trace, releases and ${state.issue.reports.length} user reports…</span>`;
    const text = await askClaude({ kind: "explain_issue", issue: state.issue });
    box.textContent = text;
}

/* ---------- assistant ---------- */
const chatBody = $("#chat-body");
$("#chat-form").addEventListener("submit", (e) => { e.preventDefault();
    const v = $("#chat-input").value.trim(); if (!v) return;
    $("#chat-input").value = ""; sendChat(v);
});
$$("#prompt-chips .chip").forEach((c) => c.addEventListener("click", () => sendChat(c.dataset.prompt)));

function bubble(role, text) {
    const el = document.createElement("div");
    el.className = "chat-msg " + role;
    el.innerHTML = `<div class="chat-avatar">${role === "user" ? "A" : "✦"}</div><div class="chat-bubble">${text}</div>`;
    chatBody.appendChild(el); chatBody.scrollTop = chatBody.scrollHeight;
    return el.querySelector(".chat-bubble");
}
async function sendChat(text) {
    bubble("user", escapeHtml(text));
    const b = bubble("assistant", `<span class="typing">✦ thinking…</span>`);
    const reply = await askClaude({ kind: "chat", prompt: text });
    b.textContent = reply;
    chatBody.scrollTop = chatBody.scrollHeight;
}
function renderMcpContext() {
    const hi = D.actors.find((a) => a.risk >= 60);
    $("#mcp-context").innerHTML = `
        <div class="ctx"><div class="ctx-label">Sentry issues</div><div class="ctx-val">${D.issues.length} open · ${D.issues.filter(i=>i.level==="fatal").length} fatal</div></div>
        <div class="ctx"><div class="ctx-label">Bug reports</div><div class="ctx-val">${D.issues.reduce((n,i)=>n+i.reports.length,0)} ingested</div></div>
        <div class="ctx"><div class="ctx-label">Ban ledger</div><div class="ctx-val">${D.actors.length} watched · top risk ${hi ? hi.risk : 0}</div></div>
        <div class="ctx"><div class="ctx-label">Live movers</div><div class="ctx-val">${D.movers.length} sessions</div></div>
        <div class="ctx"><div class="ctx-label">Model</div><div class="ctx-val">claude-opus-4-8</div></div>`;
}

/* ---------- ban control ---------- */
function renderActors() {
    $("#actor-list").innerHTML = D.actors.map((a) => {
        const cls = a.risk >= 70 ? "hi" : a.risk >= 45 ? "md" : "lo";
        const st = state.banned[a.id];
        return `<div class="actor-row" data-id="${a.id}">
            <div class="actor-av">${a.handle[0].toUpperCase()}</div>
            <div class="actor-main">
                <div class="actor-name">${a.handle} ${st ? `· <span class="${st==='banned'?'danger':''}">${st}</span>` : ""}</div>
                <div class="actor-sub">${a.id} · ${a.orders} orders · joined ${a.joined}</div>
            </div>
            <div class="risk-pill ${cls}">${a.risk}</div>
        </div>`;
    }).join("");
    $$("#actor-list .actor-row").forEach((r) =>
        r.addEventListener("click", () => selectActor(r.dataset.id)));
}
function selectActor(id) {
    state.actor = D.actors.find((a) => a.id === id);
    $$("#actor-list .actor-row").forEach((r) => r.classList.toggle("active", r.dataset.id === id));
    const a = state.actor, st = state.banned[a.id];
    $("#actor-detail").innerHTML = `
        <div class="detail-head"><h3>${a.handle}</h3>
            <div><span class="tag">${a.id}</span><span class="tag">${a.device}</span><span class="tag">joined ${a.joined}</span></div>
        </div>
        <div style="margin-top:16px"><div class="ctx-label">Risk score</div>
            <div class="gauge"><i style="width:${a.risk}%"></i></div>
            <div class="risk-pill ${a.risk>=70?'hi':a.risk>=45?'md':'lo'}" style="display:inline-block">${a.risk} / 100</div>
        </div>
        <div class="detail-section"><h4>Behavioral signals</h4>
            ${a.signals.map((s) => `<div class="signal"><span>${s.k}</span><span class="v ${s.flag?'flag':''}">${s.v}${s.flag?" ⚑":""}</span></div>`).join("")}
        </div>
        <div class="detail-section">
            <div class="ai-box"><h4>✦ Claude risk assessment</h4>
                <div class="ai-text" id="actor-ai"><button class="btn btn-primary btn-sm" id="assess-btn">Run risk analysis</button></div>
            </div>
        </div>
        <div class="action-row">
            <button class="btn btn-warn" id="block-btn">⏸ Temporary block (24h)</button>
            <button class="btn btn-danger" id="ban-btn">⛔ Permanent ban</button>
        </div>
        <div id="enforce-status">${st ? statusBanner(st) : ""}</div>`;
    $("#assess-btn").addEventListener("click", assessActor);
    $("#block-btn").addEventListener("click", () => enforce("blocked"));
    $("#ban-btn").addEventListener("click", () => enforce("banned"));
}
function statusBanner(st) {
    return st === "banned"
        ? `<div class="status-banner banned">⛔ Account permanently banned. Sessions revoked, payouts frozen, audit entry written.</div>`
        : `<div class="status-banner blocked">⏸ Account blocked for 24h. Ordering disabled pending review.</div>`;
}
async function assessActor() {
    const box = $("#actor-ai");
    box.innerHTML = `<span class="chat-bubble typing">✦ Correlating velocity, chargebacks, devices and geo…</span>`;
    box.textContent = await askClaude({ kind: "assess_actor", actor: state.actor });
}
function enforce(kind) {
    const a = state.actor; state.banned[a.id] = kind;
    $("#enforce-status").innerHTML = statusBanner(kind);
    renderActors();
    $$("#actor-list .actor-row").forEach((r) => r.classList.toggle("active", r.dataset.id === a.id));
    toast(kind === "banned" ? "bad" : "warn",
        kind === "banned" ? "Account banned" : "Account blocked",
        `${a.handle} (${a.id}) — enforcement applied & logged.`);
    if (API_BASE) fetch(`${API_BASE}/api/enforce`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId: a.id, action: kind })
    }).catch(() => {});
}

/* ---------- live map ---------- */
function startMap() {
    const c = $("#map-canvas"); const ctx = c.getContext("2d");
    const resize = () => { c.width = c.clientWidth; c.height = c.clientHeight; };
    resize();
    const colors = { normal: "#34d399", watched: "#fbbf24", flagged: "#f43f5e" };
    function frame() {
        const W = c.width, H = c.height;
        ctx.clearRect(0, 0, W, H);
        // grid
        ctx.strokeStyle = "#1d2535"; ctx.lineWidth = 1;
        for (let x = 0; x < W; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
        for (let y = 0; y < H; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
        D.movers.forEach((m) => {
            m.x += m.vx; m.y += m.vy;
            if (m.x < .04 || m.x > .96) m.vx *= -1;
            if (m.y < .06 || m.y > .94) m.vy *= -1;
            m.x = Math.min(.96, Math.max(.04, m.x));
            m.y = Math.min(.94, Math.max(.06, m.y));
            const px = m.x * W, py = m.y * H, col = colors[m.t];
            // trail glow
            ctx.beginPath(); ctx.arc(px, py, 16, 0, 7); ctx.fillStyle = col + "22"; ctx.fill();
            ctx.beginPath(); ctx.arc(px, py, 5, 0, 7); ctx.fillStyle = col; ctx.fill();
            ctx.fillStyle = "#cbd4e6"; ctx.font = "11px 'IBM Plex Mono'";
            ctx.fillText(m.label, px + 11, py + 4);
        });
        state.mapRAF = requestAnimationFrame(frame);
    }
    frame();
    $("#map-side").innerHTML = `<h4>Recent movement</h4>` + D.movers.map((m) =>
        `<div class="move-row"><span class="dot ${m.t==='flagged'?'bad':m.t==='watched'?'warn':'ok'}"></span>
        <div><div class="mname">${m.label}</div><div class="mmeta">${m.id} · ${m.t}</div></div></div>`).join("");
    window.addEventListener("resize", resize, { once: true });
}
function stopMap() { if (state.mapRAF) cancelAnimationFrame(state.mapRAF); state.mapRAF = null; }

/* ---------- notifications ---------- */
function renderNotifications() {
    $("#notif-list").innerHTML = D.notifications.map((n) => `
        <div class="notif ${n.unread ? "unread" : ""}">
            <div class="notif-ic ${n.level}">${n.icon}</div>
            <div class="notif-body">
                <div class="notif-title">${n.title}</div>
                <div class="notif-text">${n.text}</div>
                <div class="notif-time">${n.time}</div>
            </div>
        </div>`).join("");
}
$("#mark-read").addEventListener("click", () => {
    D.notifications.forEach((n) => (n.unread = false));
    renderNotifications(); $("#nav-notif-count").textContent = 0;
});

/* ---------- Claude bridge ----------
   Calls the real backend if API_BASE is set, otherwise falls back to a
   local, deterministic simulation so the demo works fully offline. */
async function askClaude(payload) {
    if (API_BASE) {
        try {
            const r = await fetch(`${API_BASE}/api/claude`, {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (r.ok) return (await r.json()).text;
        } catch (_) { /* fall through to offline sim */ }
    }
    await wait(700 + Math.random() * 600);
    return simulateClaude(payload);
}
function simulateClaude(p) {
    if (p.kind === "explain_issue") {
        const i = p.issue;
        return `Root cause (${i.id} · ${i.level}):
calcOrderTotal() in order/totals.ts:88 reads \`cart.total\` before the cart is hydrated. On the confirm path, ${i.culprit.split("·")[1].trim()} can receive a session whose cart promise hasn't resolved — so \`cart\` is undefined and \`.total\` throws.

Why it's spiking: it correlates with ${i.release}; the 612 affected users are concentrated on the order-confirm step, which matches the three reports ("crashes on Place order", "charged but order failed"). The "charged but failed" report is the dangerous one — payment succeeds but the order record never commits.

Proposed fix:
1. Guard calcOrderTotal: \`const total = cart?.total ?? recompute(cart?.items)\` and return a typed error instead of throwing.
2. Make confirmOrder() await cart hydration (or reject early with 409) before charging — never charge ahead of a committed order.
3. Add an idempotency key on /v1/orders/confirm so the "charged but no order" cases auto-reconcile/refund.
4. Backfill: scan payments where order_id is null in the last 9h and refund.

Severity: ship 1–2 as a hotfix on ${i.release}; 3–4 as a same-day follow-up.`;
    }
    if (p.kind === "assess_actor") {
        const a = p.actor;
        const flags = a.signals.filter((s) => s.flag);
        return `Risk assessment — ${a.handle} (${a.id}): ${a.risk}/100.

Strongest signals:
${flags.map((s) => `• ${s.k}: ${s.v}`).join("\n")}

Interpretation: ${a.risk >= 70
            ? "This pattern — high order velocity + repeated chargebacks + many device IDs on one account + impossible-travel geo — is a coordinated promo/chargeback abuse ring, not an unusual-but-legitimate user. The 22% chargeback rate alone is ~30× the platform baseline."
            : a.risk >= 45
            ? "Mixed. Chargebacks and referral self-loops are abuse indicators, but velocity and geo look human. Likely an opportunistic promo abuser rather than fraud-at-scale."
            : "Low. Signals are within normal ranges; this looks like a heavy but legitimate customer."}

Recommended action: ${a.risk >= 70
            ? "Permanent ban + freeze pending payouts + flag linked device IDs for the same treatment."
            : a.risk >= 45
            ? "24h temporary block, revoke promo eligibility, and require re-verification before reinstating."
            : "No action. Keep on passive watch."}`;
    }
    // chat
    const q = p.prompt.toLowerCase();
    if (q.includes("bug report") || q.includes("users are reporting")) {
        return `Bug-report digest (this week, ${D.issues.reduce((n,i)=>n+i.reports.length,0)} reports across 4 services):

1. Checkout crashes (EI-4821, loudest): users report the app crashing on "Place order", lost carts, and at least one "charged but order failed". Highest user pain.
2. Payment timeouts (EI-4799): "card declined but bank says it's fine", spinners that never resolve — several users mention switching to a competitor.
3. Slow nearby-restaurant map (EI-4760): "map takes forever near me" — annoyance, not blocking.
4. Jumpy rider ETA (EI-4744): ETA bouncing 10→45→10 min, erodes trust.

Theme: the money path (checkout → payment) is where users are angriest and where you're losing orders. Fix EI-4821 and EI-4799 first.`;
    }
    if (q.includes("risk") || q.includes("account") || q.includes("ban")) {
        const a = D.actors[0];
        return `Highest-risk account: ${a.handle} (${a.id}) at ${a.risk}/100.
It shows 41 orders in 18h, a 22% chargeback rate, 6 device IDs on one account, and impossible-travel geo (4 cities in 2h). That combination is coordinated abuse. Recommendation: permanent ban + freeze payouts, and review the 12 first-order coupons it redeemed. Open Ban Control to enforce.`;
    }
    if (q.includes("top") && q.includes("error") || q.includes("fatal")) {
        return simulateClaude({ kind: "explain_issue", issue: D.issues[0] });
    }
    return `I have MCP access to ${D.issues.length} Sentry issues, ${D.actors.length} watched accounts, and ${D.movers.length} live sessions. I can: explain any error and propose a fix, summarize what users are saying in bug reports, or run a risk assessment on a flagged account. Which would you like?`;
}

/* ---------- utils ---------- */
function toast(level, title, text) {
    const el = document.createElement("div");
    el.className = "toast " + level;
    el.innerHTML = `<div class="toast-title">${title}</div><div class="toast-text">${text}</div>`;
    $("#toast-host").appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; el.style.transition = ".4s"; setTimeout(() => el.remove(), 400); }, 4200);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function escapeHtml(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
})();

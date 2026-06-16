/* ===== EatInnMonitor — seed/mock data =====
   Stands in for live Sentry + ban-ledger + movement feeds so the static
   GitHub Pages build is fully interactive. The Node backend (server/) replaces
   these with real Sentry MCP + Claude responses when EATINN_API_BASE is set. */

window.EATINN = {
    operator: { name: "admin", email: "admin@eatinn.io", role: "Super Admin" },

    services: [
        { name: "checkout-api", status: "degraded", p95: 842, errRate: 3.1 },
        { name: "menu-service", status: "ok", p95: 121, errRate: 0.2 },
        { name: "rider-dispatch", status: "ok", p95: 240, errRate: 0.6 },
        { name: "payments", status: "down", p95: 1900, errRate: 11.4 },
        { name: "search", status: "ok", p95: 88, errRate: 0.1 },
    ],

    // Sentry-style issues
    issues: [
        {
            id: "EI-4821", level: "fatal", title: "TypeError: cannot read 'total' of undefined",
            culprit: "checkout-api · POST /v1/orders/confirm", events: 1284, users: 612,
            firstSeen: "9h ago", lastSeen: "2m ago", release: "checkout@2.14.0",
            stack: `TypeError: Cannot read properties of undefined (reading 'total')
    at calcOrderTotal (order/totals.ts:88:21)
    at confirmOrder (order/confirm.ts:142:18)
    at /v1/orders/confirm (routes/orders.ts:54:9)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)`,
            reports: [
                { who: "user 88213 · iOS", text: "App crashes the moment I hit 'Place order'. Lost my cart twice." },
                { who: "user 90551 · Android", text: "Payment screen freezes then kicks me out. Can't order dinner." },
                { who: "user 77410 · web", text: "Says order failed but I got charged?? Need help fast." },
            ],
        },
        {
            id: "EI-4799", level: "error", title: "PaymentGatewayTimeout after 8000ms",
            culprit: "payments · charge()", events: 904, users: 430,
            firstSeen: "3h ago", lastSeen: "just now", release: "payments@5.2.1",
            stack: `PaymentGatewayError: upstream timeout (8000ms)
    at chargeCard (payments/gateway.ts:210:13)
    at settleOrder (payments/settle.ts:77:24)
    at async confirmOrder (order/confirm.ts:150:7)`,
            reports: [
                { who: "user 11200 · iOS", text: "Card keeps getting declined but my bank says it's fine." },
                { who: "user 33981 · web", text: "Payment spinner forever. Gave up and ordered on a competitor." },
            ],
        },
        {
            id: "EI-4760", level: "warning", title: "Slow query: restaurants_near_point > 1.2s",
            culprit: "search · geoLookup()", events: 2210, users: 1180,
            firstSeen: "2d ago", lastSeen: "5m ago", release: "search@1.9.4",
            stack: `WARN slow_query restaurants_near_point
    duration=1284ms rows=540
    at geoLookup (search/geo.ts:64:11)`,
            reports: [
                { who: "user 50021 · Android", text: "Map takes forever to show places near me." },
            ],
        },
        {
            id: "EI-4744", level: "error", title: "Unhandled rejection in rider ETA recompute",
            culprit: "rider-dispatch · recomputeEta()", events: 318, users: 201,
            firstSeen: "11h ago", lastSeen: "22m ago", release: "dispatch@3.0.7",
            stack: `UnhandledPromiseRejection: eta_recompute_failed
    at recomputeEta (dispatch/eta.ts:130:9)
    at onRiderPing (dispatch/ws.ts:88:14)`,
            reports: [
                { who: "user 67120 · iOS", text: "ETA jumps from 10 min to 45 min then back. Confusing." },
            ],
        },
    ],

    // Bad-actor watchlist
    actors: [
        {
            id: "u_902184", handle: "ghost_orders_91", joined: "4 days ago", risk: 92,
            country: "—", device: "rooted Android · 6 emulated", orders: 41, chargebacks: 9,
            signals: [
                { k: "Velocity", v: "41 orders / 18h", flag: true },
                { k: "Payment", v: "9 chargebacks (22%)", flag: true },
                { k: "Devices", v: "6 device IDs, 1 account", flag: true },
                { k: "Geo", v: "4 cities in 2h (impossible travel)", flag: true },
                { k: "Promo abuse", v: "12 first-order coupons", flag: true },
            ],
        },
        {
            id: "u_771043", handle: "deals.hunter", joined: "2 weeks ago", risk: 67,
            country: "—", device: "iOS · 2 devices", orders: 28, chargebacks: 2,
            signals: [
                { k: "Velocity", v: "28 orders / 3d", flag: false },
                { k: "Payment", v: "2 chargebacks (7%)", flag: true },
                { k: "Devices", v: "2 device IDs", flag: false },
                { k: "Geo", v: "consistent", flag: false },
                { k: "Promo abuse", v: "5 referral self-loops", flag: true },
            ],
        },
        {
            id: "u_560778", handle: "latenight.bites", joined: "3 months ago", risk: 28,
            country: "—", device: "iOS · 1 device", orders: 64, chargebacks: 0,
            signals: [
                { k: "Velocity", v: "normal", flag: false },
                { k: "Payment", v: "0 chargebacks", flag: false },
                { k: "Devices", v: "1 device ID", flag: false },
                { k: "Geo", v: "consistent", flag: false },
                { k: "Promo abuse", v: "none", flag: false },
            ],
        },
    ],

    // Live map points (x,y normalized 0..1, vx/vy small)
    movers: [
        { id: "u_902184", label: "ghost_orders_91", t: "flagged", x:.32, y:.40, vx:.004, vy:-.002 },
        { id: "u_771043", label: "deals.hunter", t: "watched", x:.61, y:.55, vx:-.002, vy:.003 },
        { id: "u_560778", label: "latenight.bites", t: "normal", x:.48, y:.30, vx:.002, vy:.002 },
        { id: "u_120044", label: "rider · marco", t: "normal", x:.70, y:.66, vx:-.003, vy:-.001 },
        { id: "u_330912", label: "rider · aki", t: "normal", x:.22, y:.62, vx:.003, vy:.001 },
        { id: "u_445120", label: "diner · sora", t: "normal", x:.55, y:.42, vx:.001, vy:-.003 },
        { id: "u_889001", label: "diner · ren", t: "watched", x:.40, y:.72, vx:.002, vy:-.002 },
    ],

    notifications: [
        { level:"bad", icon:"⚠", title:"Payments service DOWN", text:"Error rate 11.4% on payments@5.2.1 — exceeds 5% SLO.", time:"2m ago", unread:true },
        { level:"bad", icon:"⛔", title:"High-risk account spike", text:"ghost_orders_91 hit risk score 92 (promo + chargeback abuse).", time:"6m ago", unread:true },
        { level:"warn", icon:"⚠", title:"Fatal error trending", text:"EI-4821 up 34% in the last hour, 612 users affected.", time:"18m ago", unread:true },
        { level:"info", icon:"✦", title:"Claude summary ready", text:"Weekly bug-report digest generated across 4 services.", time:"1h ago", unread:false },
    ],
};

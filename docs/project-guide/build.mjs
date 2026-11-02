#!/usr/bin/env node
/**
 * Draws the diagrams used by docs/PROJECT_GUIDE.md. Edit a diagram below, then:
 *   node docs/project-guide/build.mjs
 * No dependencies. Helpers and colours are shared with the other docs diagrams
 * in docs/diagram-kit.mjs; it warns when a label is probably wider than its box.
 */
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  arrow, box, circle, finish, legend, LEGEND, lifelines, line, lbl, msg, note, outputTo, panel, svg, text, zone,
} from "../diagram-kit.mjs";

outputTo(dirname(fileURLToPath(import.meta.url)));

const red = (points) => `<path d="M${points.map((p) => p.join(" ")).join(" L")}" fill="none" stroke="#ef4444" stroke-width="1.6" stroke-dasharray="6 5"/>`;

// ── 01 · what CapScreen does ─────────────────────────────────────────────────

svg("01-what-it-does.svg", 1100, 470, "What CapScreen does, and who does each part",
  "Code finds and scores the matches, a model only maps columns and writes text, and a person makes every decision.", () => [
    zone(30, 86, 1040, 90, "PERSON"),
    zone(30, 188, 1040, 104, "CODE"),
    zone(30, 304, 1040, 90, "MODEL"),

    box({ x: 150, y: 106, w: 130, h: 52, cls: "ui", title: "Upload", lines: ["cap table CSV"] }),
    box({ x: 300, y: 206, w: 130, h: 70, title: "Parse CSV", lines: ["strict · aliases"] }),
    box({ x: 450, y: 206, w: 130, h: 70, title: "Build graph", lines: ["chains to UBOs"] }),
    box({ x: 600, y: 206, w: 130, h: 70, title: "Match names", lines: ["Watchman, every", "node in parallel"] }),
    box({ x: 750, y: 206, w: 130, h: 70, title: "Tier + rules", lines: ["score bands", "50% · 25% rules"] }),
    box({ x: 300, y: 322, w: 130, h: 56, cls: "ai", dashed: true, title: "Map columns", lines: ["only if code can't"] }),
    box({ x: 750, y: 322, w: 130, h: 56, cls: "ai", title: "Write notes", lines: ["who · why · next"] }),
    box({ x: 900, y: 322, w: 150, h: 56, cls: "ai", title: "Chat assistant", lines: ["explains, drafts"] }),
    box({ x: 900, y: 106, w: 150, h: 52, cls: "ui", title: "Review + decide", lines: ["graph, table, cards"] }),

    arrow([[215, 158], [215, 241], [300, 241]]),
    arrow([[430, 241], [450, 241]]),
    arrow([[580, 241], [600, 241]]),
    arrow([[730, 241], [750, 241]]),
    arrow([[365, 276], [365, 322]], { dash: true, both: true }),
    arrow([[815, 276], [815, 322]]),
    arrow([[880, 226], [950, 226], [950, 158]]),
    arrow([[1000, 322], [1000, 158]]),

    text(30, 428, "It never decides guilt: it narrows the review set for a compliance officer. If Watchman is down, screening fails instead of", { cls: "t s mut" }),
    text(30, 446, "returning 'clear'. Everything stays on the user's computer unless they assign a cloud model.", { cls: "t s mut" }),
  ]);

// ── 02 · repository ──────────────────────────────────────────────────────────

svg("02-repo.svg", 1100, 560, "The repository: one pnpm workspace, three packages",
  "The desktop package builds and runs the other two. The frontend talks to the backend over HTTP and imports its types.", () => {
    const items = (x, w, list) => list.map(([t, l], i) => box({ x: x + 14, y: 132 + i * 38, w: w - 28, h: 32, left: true, small: true, lines: [`${t}  ·  ${l}`] }));
    return [
      panel(30, 90, 320, 330, "backend/  (vc-screener-backend)"),
      ...items(30, 320, [
        ["src/modules/", "17 feature modules"],
        ["src/lib/", "screening, agent, tools, llm, rag"],
        ["src/models/", "mongoose schemas"],
        ["src/http/, middleware/", "shared HTTP"],
        ["test/", "node:test suites"],
        ["sample-data/, corpus/", "demo + policy"],
        ["api/index.ts", "Vercel auth entry"],
      ]),
      panel(410, 90, 320, 330, "frontend/  (capscreen)"),
      ...items(410, 320, [
        ["src/app/", "routes only"],
        ["src/features/", "one folder per area"],
        ["src/api/", "one client per module"],
        ["src/components/", "ui, layout, chat"],
        ["src/contexts/, hooks/, lib/", "app-wide"],
        ["src/types/", "re-exports backend"],
        ["public/", "logos, brand marks"],
      ]),
      panel(790, 90, 280, 330, "desktop/  (capscreen-desktop)"),
      ...items(790, 280, [
        ["src/main.ts", "entry"],
        ["src/sidecars/", "start + watch"],
        ["src/bridge/", "capscreen://, IPC"],
        ["src/auth/", "PKCE sign-in"],
        ["src/window/", "window, tray"],
        ["scripts/", "bundle + build"],
        ["electron-builder.yml", "installers"],
      ]),
      arrow([[410, 200], [350, 200]], { label: "HTTP", at: [380, 192] }),
      arrow([[410, 360], [350, 360]], { dash: true, label: "types", at: [380, 352] }),
      arrow([[790, 200], [730, 200]], { label: "builds", at: [760, 192] }),
      arrow([[930, 420], [930, 446], [190, 446], [190, 420]], { label: "bundles with esbuild and runs it as a sidecar (plus the Watchman Go binary)", at: [560, 440] }),
      box({ x: 30, y: 480, w: 330, h: 50, cls: "ui", title: "docs/", lines: ["guides + generated diagrams"] }),
      box({ x: 385, y: 480, w: 330, h: 50, cls: "ui", title: ".claude/", lines: ["agents, commands, memory, hooks"] }),
      box({ x: 740, y: 480, w: 330, h: 50, cls: "ui", title: "root", lines: ["pnpm workspace · husky · CI"] }),
    ];
  });

// ── 03 · two databases ───────────────────────────────────────────────────────

svg("03-two-databases.svg", 1000, 460, "Two databases, never connected",
  "Same mongoose models, two stores. CAPSCREEN_DB decides which one a process opens.", () => [
    zone(30, 84, 440, 346, "YOUR COMPUTER"),
    zone(530, 84, 440, 346, "CLOUD · VERCEL + ATLAS"),
    box({ x: 60, y: 116, w: 380, h: 56, title: "Electron shell", lines: ["signs in, keeps the session in the keychain"] }),
    arrow([[250, 172], [250, 204]], { label: "identity.json (email, name)", at: [260, 193], anchor: "start" }),
    box({ x: 60, y: 204, w: 380, h: 56, title: "Desktop backend", lines: ["CAPSCREEN_DB unset → SQLite"] }),
    arrow([[250, 260], [250, 292]]),
    box({ x: 60, y: 292, w: 380, h: 110, cls: "data", title: "SQLite · <userData>/capscreen.db",
      lines: ["startups, cap tables, screenings, reviews", "documents + chunks, chats, workflows", "tabular reviews, audit log"] }),

    box({ x: 560, y: 116, w: 380, h: 56, title: "Auth service (Vercel)", lines: ["CAPSCREEN_DB=mongodb"] }),
    arrow([[750, 172], [750, 292]]),
    box({ x: 560, y: 292, w: 380, h: 110, cls: "data", title: "MongoDB Atlas",
      lines: ["User · AuthToken", "EmailToken · DesktopAuthCode", "accounts only"] }),

    arrow([[440, 144], [560, 144]], { orange: true, both: true, label: "sign-in + tokens", at: [500, 136] }),
    red([[440, 347], [560, 347]]),
    `<circle cx="500" cy="347" r="11" fill="#fef2f2" stroke="#ef4444" stroke-width="1.5"/><path d="M495 342L505 352M505 342L495 352" stroke="#ef4444" stroke-width="2"/>`,
    lbl(500, 378, "never linked"),
  ]);

// ── 04 · app launch ──────────────────────────────────────────────────────────

svg("04-app-launch.svg", 1100, 520, "App launch (desktop/src/main.ts)",
  "Boot and sign-in run at the same time; the app opens when both are done.", () => {
    const lanes = [["WINDOW", 100], ["KEYCHAIN", 150], ["WATCHMAN", 200], ["BACKEND", 250], ["UI", 300], ["SHELL", 350], ["SIGN-IN", 410]];
    const bar = (x, w, y, cls, label, dashed = false) => box({ x, y, w, h: 36, cls, dashed, lines: [label] });
    return [
      ...lanes.map(([l, y]) => text(30, y + 23, l, { cls: "zonet" })),
      bar(150, 620, 100, "ui", "splash page", true),
      bar(800, 140, 100, "ui", "capscreen://app/"),
      bar(955, 115, 100, "ui", "→ /assistant"),
      bar(150, 150, 150, "data", "unseal master key"),
      bar(310, 300, 200, "code", "start Watchman (offline snapshot fallback)"),
      bar(310, 300, 250, "code", "start backend (free port, token, clean env)"),
      bar(310, 230, 300, "code", "start UI (Next standalone)"),
      bar(620, 150, 350, "code", "protocol + pollers"),
      bar(150, 200, 410, "code", "restore session"),
      bar(360, 410, 410, "ext", "sign-in gate, if needed (browser + PKCE)", true),
      line([[785, 92], [785, 456]], true),
      lbl(785, 474, "both done"),
      arrow([[785, 118], [800, 118]]),
      arrow([[150, 492], [1070, 492]], { label: "time", at: [1040, 484] }),
    ];
  });

// ── 05 · screening pipeline ──────────────────────────────────────────────────

svg("05-screening-pipeline.svg", 1150, 640, "Screening a cap table, step by step",
  "From the startup page to the saved result. Only step 3 (as a fallback) and step 9 call a model.", () => {
    const row1 = [
      ["warn", "1 · Watchman up?", ["no → fail (503)"]],
      ["code", "2 · List info", ["counts + SHA-256"]],
      ["code", "3 · Ingest CSV", ["strict → aliases → model"]],
      ["code", "4 · Entity hints", ["alt names, DOB, country"]],
      ["code", "5 · Ownership graph", ["nodes, edges, startup"]],
    ];
    const row2 = [
      ["code", "6 · Search", ["every node, parallel", "cached 5 min"]],
      ["code", "7 · Tier", ["≥ 0.95 flagged", "≥ 0.80 review"]],
      ["code", "8 · Paths + UBOs", ["BFS, cycle-safe"]],
      ["ai", "9 · Notes", ["utility model,", "review + flagged"]],
      ["code", "10 · Rules", ["50% · 25%,", "escalation"]],
      ["code", "11 · Sort", ["+ confidence 0–100"]],
    ];
    const out = [
      box({ x: 30, y: 92, w: 210, h: 56, cls: "ui", title: "Startup page", lines: ["pick or drop a CSV"] }),
      arrow([[240, 120], [262, 120]]),
      box({ x: 262, y: 92, w: 260, h: 56, title: "POST …/csvs/analyze", lines: ["preview: graph stats + time estimate"] }),
      arrow([[522, 120], [544, 120]]),
      box({ x: 544, y: 92, w: 260, h: 56, title: "POST …/csvs", lines: ["store the CSV · audit csv_uploaded"] }),
      arrow([[804, 120], [826, 120]]),
      box({ x: 826, y: 92, w: 294, h: 56, title: "POST …/screen", lines: ["{ csvId, purpose }"] }),
      arrow([[973, 148], [973, 176]]),
      zone(30, 176, 1090, 262, "runScreening  (lib/screening/runScreening.ts)"),
    ];
    row1.forEach(([cls, t, l], i) => {
      const x = 50 + i * 214;
      out.push(box({ x, y: 212, w: 200, h: 66, cls, title: t, lines: l }));
      if (i < row1.length - 1) out.push(arrow([[x + 200, 245], [x + 214, 245]]));
    });
    out.push(arrow([[1006, 278], [1006, 302], [132, 302], [132, 330]]));
    row2.forEach(([cls, t, l], i) => {
      const x = 50 + i * 178;
      out.push(box({ x, y: 330, w: 164, h: 74, cls, title: t, lines: l }));
      if (i < row2.length - 1) out.push(arrow([[x + 164, 367], [x + 178, 367]]));
    });
    out.push(line([[575, 438], [575, 460]]), line([[150, 460], [995, 460]]));
    const saves = [
      ["data", "Save the result", ["on the startup (cap table,", "co-investor or vendor slot)"]],
      ["code", "Snapshot + delta", ["what got worse", "since last time"]],
      ["code", "Portfolio grid", ["sync the monitoring", "review"]],
      ["data", "Audit log", ["screening_completed"]],
    ];
    saves.forEach(([cls, t, l], i) => {
      const x = 30 + i * 280;
      out.push(arrow([[x + 120, 460], [x + 120, 480]]));
      out.push(box({ x, y: 480, w: 250, h: 64, cls, title: t, lines: l }));
    });
    out.push(box({ x: 30, y: 568, w: 1090, h: 46, cls: "ui", title: "ScreeningResultsPanel: ownership graph · risk table · risk cards" }));
    return out;
  });

// ── 06 · sign-in ─────────────────────────────────────────────────────────────

svg("06-sign-in.svg", 1100, 620, "Desktop sign-in (RFC 8252 loopback + PKCE)",
  "Like Claude Code: the browser signs in, a one-time code comes back to a loopback listener, the app swaps it for tokens.", () => {
    const A = 110, L = 330, B = 550, S = 770, K = 990;
    return [
      lifelines([
        { x: A, name: "Desktop app", cls: "code" },
        { x: L, name: "Loopback listener", cls: "code" },
        { x: B, name: "Browser", cls: "ui" },
        { x: S, name: "Auth service", cls: "ext" },
        { x: K, name: "OS keychain", cls: "data" },
      ], 84, 600),
      note(A, 156, 200, "PKCE verifier + state"),
      msg(A, L, 190, "listen on 127.0.0.1:<random>/callback"),
      msg(A, B, 226, "open /desktop/authorize?redirect_uri&state&code_challenge"),
      msg(B, S, 262, "user signs in on the hosted portal", { orange: true }),
      msg(S, B, 298, "one-time code (loopback redirect URIs only)", { dash: true }),
      msg(B, L, 334, "GET /callback?code&state"),
      msg(L, A, 370, "code (state checked)", { dash: true }),
      msg(A, S, 406, "POST /api/auth/desktop/token (code + verifier)", { orange: true }),
      msg(S, A, 442, "access + refresh token", { dash: true }),
      msg(A, K, 478, "seal the session (safeStorage)"),
      note(A, 514, 200, "write identity.json"),
      note(B, 560, 520, "refresh every 12 h · 14 days offline grace · revoked on sign-out", "ui"),
    ];
  });

// ── 07 · backend request ─────────────────────────────────────────────────────

svg("07-backend-request.svg", 1110, 500, "A request through the backend (src/app.ts)",
  "Middleware first, then one feature module, split into the same layers everywhere.", () => {
    const mw = [
      [30, 110, "ui", "Request", []],
      [160, 140, "code", "helmet · CORS", ["loopback origins"]],
      [320, 160, "warn", "desktopToken", ["x-capscreen-token", "else 403"]],
      [500, 120, "code", "body ≤ 10 MB", []],
      [640, 160, "code", "requireAuth", ["local-user + identity"]],
      [820, 160, "code", "connectDatabase", ["open the DB once"]],
    ];
    const out = [];
    mw.forEach(([x, w, cls, t, l], i) => {
      out.push(box({ x, y: 92, w, h: 64, cls, title: t, lines: l }));
      if (i < mw.length - 1) out.push(arrow([[x + w, 124], [mw[i + 1][0], 124]]));
    });
    out.push(arrow([[900, 156], [900, 188], [100, 188], [100, 216]]));
    const layers = [
      ["routes.ts", ["prefix → module"]],
      ["x.routes.ts", ["paths, guards"]],
      ["x.controller", ["read req, send res"]],
      ["x.service", ["rules, HttpError"]],
      ["x.repository", ["mongoose queries"]],
      ["models/*", ["schemas"]],
      ["db → store", ["SQLite (or Atlas)"]],
    ];
    layers.forEach(([t, l], i) => {
      const x = 30 + i * 152;
      out.push(box({ x, y: 216, w: 140, h: 64, cls: i === 6 ? "data" : "code", title: t, mono: true, lines: l }));
      if (i < layers.length - 1) out.push(arrow([[x + 140, 248], [x + 152, 248]]));
    });
    out.push(arrow([[556, 280], [556, 336]]));
    out.push(box({ x: 406, y: 336, w: 300, h: 64, cls: "ai", title: "src/lib engines", lines: ["screening · agent · tools · llm · rag · infra"] }));
    out.push(arrow([[706, 368], [708, 368], [708, 280]], { dash: true, label: "via repositories", at: [716, 320], anchor: "start" }));
    out.push(arrow([[610, 280], [610, 300], [950, 300], [950, 336]], { dash: true, label: "throw badRequest / notFound", at: [850, 294] }));
    out.push(box({ x: 830, y: 336, w: 250, h: 64, cls: "warn", title: "errorHandler", lines: ["HttpError → { detail } · else 500"] }));
    out.push(text(30, 446, "Each layer has one job: routes have no logic, controllers don't touch the database, services never see req/res,", { cls: "t s mut" }));
    out.push(text(30, 466, "repositories hold no rules. lib/ engines are HTTP-free and read data only through repositories.", { cls: "t s mut" }));
    return out;
  });

// ── 08 · ownership example ───────────────────────────────────────────────────

svg("08-ownership-example.svg", 1100, 560, "Ownership graph: a worked example",
  "Arrows point from owner to owned. Effective stake multiplies along each path and adds up across paths.", () => [
    box({ x: 60, y: 96, w: 170, h: 56, cls: "warn", title: "Person X", lines: ["Watchman hit"] }),
    box({ x: 300, y: 96, w: 170, h: 56, cls: "ui", title: "Person Y", lines: ["no hit"] }),
    arrow([[145, 152], [225, 220]], { label: "75%", at: [168, 192] }),
    arrow([[385, 152], [305, 220]], { label: "25%", at: [362, 192] }),
    box({ x: 170, y: 220, w: 190, h: 56, cls: "prompt", title: "Holding C", lines: ["blockable: 75% by X"] }),
    box({ x: 30, y: 344, w: 160, h: 56, cls: "ui", title: "Alice", lines: ["person, no hit"] }),
    box({ x: 410, y: 344, w: 180, h: 56, cls: "code", title: "Fund B", lines: ["70% held by LPs"] }),
    arrow([[330, 276], [460, 344]], { label: "30%", at: [410, 302] }),
    arrow([[255, 276], [290, 460]], { label: "25%", at: [290, 372] }),
    arrow([[110, 400], [235, 460]], { label: "40%", at: [160, 438] }),
    arrow([[500, 400], [370, 460]], { label: "35%", at: [452, 438] }),
    box({ x: 200, y: 460, w: 220, h: 56, cls: "data", title: "NexaFlow AI Inc", lines: ["the startup"] }),

    panel(640, 92, 430, 430, "The numbers"),
    text(656, 146, "Effective stake in NexaFlow", { cls: "t s" }),
    ...[["Holding C", "25% + 30% × 35%", "35.5%"], ["Person X", "75% × 35.5%", "26.6%"], ["Person Y", "25% × 35.5%", "8.9%"], ["Alice", "direct", "40.0%"]]
      .map(([n, f, v], i) => text(656, 168 + i * 20, n, { cls: "t s" }) + text(756, 168 + i * 20, f, { cls: "t s mono" }) + text(1050, 168 + i * 20, v, { cls: "t s mono", anchor: "end" })),
    text(656, 266, "What the rules do", { cls: "t s" }),
    text(656, 290, "Person X: tier from its score; flag ubo_25 (26.6% ≥ 25%)"),
    text(656, 314, "Holding C: no hit, but X owns ≥ 50%, so it is blockable;"),
    text(656, 330, "it starts at review and ofac_50 escalates it to flagged"),
    text(656, 354, "Fund B: blockable owners hold 30% < 50%, not blockable"),
    text(656, 378, "Alice: ubo_25 flag (40%), but no hit, so she stays clear"),
    text(656, 416, "Ownership path for X (BFS from the startup):", { cls: "t s" }),
    text(656, 438, "NexaFlow → Holding C → Person X", { cls: "t s mono" }),
    text(656, 474, "Any non-clear entity counts as sanctioned for the"),
    text(656, 492, "50% rule (section 20.3). Thresholds: Settings → Screening."),
  ]);

// ── 09 · risk tiers ──────────────────────────────────────────────────────────

svg("09-risk-tiers.svg", 1000, 440, "From match score to risk tier",
  "Watchman's top score sets the starting tier; ownership rules can only move an entity up.", () => [
    `<rect class="data bx" x="80" y="100" width="360" height="40" rx="6"/>`,
    `<rect class="prompt bx" x="440" y="100" width="320" height="40" rx="6"/>`,
    `<rect class="warn bx" x="760" y="100" width="160" height="40" rx="6"/>`,
    text(260, 125, "clear  ·  no hit at or above 0.80", { cls: "t s", anchor: "middle" }),
    text(600, 125, "review  ·  0.80 to < 0.95", { cls: "t s", anchor: "middle" }),
    text(840, 125, "flagged  ·  ≥ 0.95", { cls: "t s", anchor: "middle" }),
    ...[[80, "0"], [440, "0.80"], [760, "0.95"], [920, "1.0"]].map(([x, l]) => line([[x, 140], [x, 150]]) + text(x, 166, l, { cls: "t xs mut", anchor: "middle" })),
    text(80, 190, "Not to scale. Watchman returns nothing below 0.80 (its minimum match), so a low score means 'no hit'.", { cls: "t xs mut" }),

    text(80, 236, "Then the ownership rules", { cls: "t b" }),
    box({ x: 120, y: 260, w: 180, h: 56, cls: "data", title: "clear" }),
    box({ x: 420, y: 260, w: 180, h: 56, cls: "prompt", title: "review" }),
    box({ x: 720, y: 260, w: 180, h: 56, cls: "warn", title: "flagged" }),
    arrow([[300, 288], [420, 288]], { label: "ubo_25 + a hit", at: [360, 280] }),
    arrow([[600, 288], [720, 288]], { label: "ofac_50", at: [660, 280] }),
    arrow([[510, 372], [510, 316]], { label: "blockable company with no hit of its own starts here", at: [510, 390] }),
    text(80, 424, "Thresholds (0.95, 0.80, 50%, 25%) can be tightened in Settings → Screening and are recorded on every result.", { cls: "t s mut" }),
  ]);

// ── 10 · monitoring ──────────────────────────────────────────────────────────

svg("10-monitoring.svg", 1070, 330, "Background re-screening (modules/portfolio/rescreen.service.ts)",
  "Sanctions lists change; saved screenings are re-run on a schedule and new problems raise a notification.", () => {
    const steps = [
      ["code", "Scheduler", ["checks every", "15 minutes"]],
      ["code", "Due?", ["enabled, last digest", "older than 24 h"]],
      ["code", "Re-screen", ["each startup's cap", "table, co-investors,", "vendors"]],
      ["code", "Snapshot + delta", ["what got worse"]],
      ["data", "Digest", ["saved; optional", "webhook POST"]],
      ["ext", "Notification", ["desktop poller →", "native alert →", "deep link"]],
    ];
    const out = [];
    steps.forEach(([cls, t, l], i) => {
      const x = 30 + i * 172;
      out.push(box({ x, y: 110, w: 150, h: 96, cls, title: t, lines: l }));
      if (i < steps.length - 1) out.push(arrow([[x + 150, 158], [x + 172, 158]]));
    });
    out.push(arrow([[277, 206], [277, 246], [105, 246], [105, 206]], { label: "not due yet", at: [191, 240] }));
    out.push(text(30, 296, "Interval and on/off live in settings.json (Settings → Sanctions data). The webhook URL is DIGEST_WEBHOOK_URL.", { cls: "t s mut" }));
    return out;
  });

// ── 11 · SQLite store ────────────────────────────────────────────────────────

svg("11-sqlite-store.svg", 1000, 540, "SQLite behind mongoose (lib/infra/sqliteStore/)",
  "The store implements the parts of the MongoDB driver mongoose uses, so ~170 query call sites never changed.", () => [
    box({ x: 60, y: 92, w: 580, h: 56, title: "Mongoose models and queries", lines: ["unchanged from the Atlas days"] }),
    arrow([[350, 148], [350, 176]]),
    box({ x: 60, y: 176, w: 580, h: 56, title: "Driver surface", lines: ["SqliteClient · SqliteDb · SqliteCollection · SqliteCursor"] }),
    arrow([[150, 232], [150, 262]]), arrow([[350, 232], [350, 262]]), arrow([[550, 232], [550, 262]]),
    box({ x: 60, y: 262, w: 180, h: 64, title: "query.ts", mono: true, lines: ["filters, dotted paths"] }),
    box({ x: 260, y: 262, w: 180, h: 64, title: "update.ts", mono: true, lines: ["$set, $inc, $push …"] }),
    box({ x: 460, y: 262, w: 180, h: 64, title: "aggregate", mono: true, lines: ["$match … $vectorSearch"] }),
    arrow([[350, 326], [350, 356]]),
    box({ x: 60, y: 356, w: 580, h: 52, cls: "data", title: "All documents in memory", lines: ["loaded on open · reads never touch the disk"] }),
    arrow([[350, 408], [350, 444]], { label: "every write goes straight through", at: [360, 431], anchor: "start" }),
    box({ x: 60, y: 444, w: 580, h: 60, cls: "data", title: "capscreen.db (WAL)", lines: ["documents(collection, id, body EJSON, updated_at) · meta(schema_version)"] }),

    arrow([[640, 120], [830, 120], [830, 176]], { dash: true, label: "CAPSCREEN_DB=mongodb", at: [735, 112] }),
    box({ x: 700, y: 176, w: 260, h: 56, title: "MongoDB driver", lines: ["auth service only"] }),
    arrow([[718, 232], [718, 444]], { orange: true }),
    box({ x: 700, y: 444, w: 260, h: 60, cls: "ext", title: "MongoDB Atlas", lines: ["accounts"] }),
    box({ x: 740, y: 268, w: 220, h: 120, cls: "ui", left: true, small: true, title: "Also", lines: [
      "TTL sweeper every minute",
      "sessions / transactions: no-ops",
      "unknown operator →",
      "UnsupportedOperatorError",
    ] }),
  ]);

// ── 12 · backup, restore, audit chain ────────────────────────────────────────

svg("12-backup-restore.svg", 1100, 560, "Backup, restore and the audit chain (lib/infra/backup.ts)",
  "Backups are encrypted with a password; restores swap data in before the database opens; the audit export is hash-chained.", () => {
    const seg = [
      [30, 180, "ui", "\"CAPSCREENBAK1\\n\""],
      [210, 90, "code", "salt · 16"],
      [300, 80, "code", "iv · 12"],
      [380, 90, "code", "tag · 16"],
      [470, 600, "data", "AES-256-GCM( gzip( manifest + files ) )"],
    ];
    const out = [text(30, 100, "1 · The backup file", { cls: "t b" })];
    for (const [x, w, cls, l] of seg) out.push(box({ x, y: 112, w, h: 40, cls, lines: [l] }));
    out.push(text(30, 176, "key = scrypt(password, salt) · holds the database snapshot, files, settings and model choices · never API keys", { cls: "t s mut" }));

    out.push(text(30, 224, "2 · Restoring", { cls: "t b" }));
    const steps = [
      ["ui", ["pick the file", "+ password"]],
      ["code", ["decrypt and", "validate"]],
      ["code", ["unpack into", "restore-staging/"]],
      ["code", ["write restore-", "pending.json"]],
      ["warn", ["backend exits", "with code 75"]],
      ["code", ["supervisor", "restarts it"]],
      ["data", ["applyPending-", "Restore() before", "the DB opens"]],
    ];
    steps.forEach(([cls, l], i) => {
      const x = 30 + i * 150;
      out.push(box({ x, y: 238, w: 136, h: 70, cls, lines: l }));
      if (i < steps.length - 1) out.push(arrow([[x + 136, 273], [x + 150, 273]]));
    });

    out.push(text(30, 362, "3 · The audit export (GET /api/desktop/audit-export)", { cls: "t b" }));
    ["entry 1", "entry 2", "entry 3", "entry 4"].forEach((e, i) => {
      const x = 30 + i * 240;
      out.push(box({ x, y: 378, w: 200, h: 64, cls: "data", title: e, lines: [i === 0 ? "hash = sha256(entry)" : "hash = sha256(prev + entry)"] }));
      if (i < 3) out.push(arrow([[x + 200, 410], [x + 240, 410]]));
    });
    out.push(box({ x: 30, y: 466, w: 920, h: 44, cls: "warn", title: "Edit, delete or reorder any line and every hash after it stops matching" }));
    out.push(text(30, 536, "The database file itself is not encrypted at rest; API keys and backups are.", { cls: "t s mut" }));
    return out;
  });

// ── 13 · desktop request path ────────────────────────────────────────────────

svg("13-desktop-request.svg", 1100, 470, "How the window reaches the backend",
  "Page code never sees the backend's port or token: the main process adds them.", () => [
    zone(30, 84, 300, 330, "RENDERER · SANDBOXED"),
    zone(370, 84, 330, 330, "ELECTRON MAIN"),
    zone(740, 84, 330, 330, "LOOPBACK SERVICES + OS"),
    box({ x: 50, y: 128, w: 260, h: 70, cls: "ui", title: "Page (Next.js app)", lines: ["fetch('capscreen://app/__api/…')"] }),
    arrow([[180, 198], [180, 290]], { label: "window.capscreenDesktop", at: [190, 250], anchor: "start" }),
    box({ x: 50, y: 290, w: 260, h: 70, cls: "ui", title: "Preload bridge", lines: ["typed, no Node access"] }),

    box({ x: 390, y: 120, w: 290, h: 90, title: "bridge/protocol.ts", mono: true, lines: ["capscreen://app → proxy", "adds x-capscreen-token to /__api/*", "rewrites redirects to the app origin"] }),
    box({ x: 390, y: 290, w: 290, h: 70, title: "bridge/ipc.ts", mono: true, lines: ["validated handlers only"] }),
    arrow([[310, 163], [390, 163]]),
    arrow([[310, 325], [390, 325]], { label: "IPC", at: [350, 317] }),

    box({ x: 760, y: 124, w: 290, h: 56, title: "UI server", lines: ["capscreen://app/… pages"] }),
    box({ x: 760, y: 196, w: 290, h: 56, title: "Backend", lines: ["/__api/* · checks the token"] }),
    box({ x: 760, y: 290, w: 290, h: 70, cls: "ui", title: "OS", lines: ["save file · open link · notify · print"] }),
    arrow([[680, 145], [740, 145], [740, 152], [760, 152]]),
    arrow([[680, 185], [740, 185], [740, 224], [760, 224]]),
    text(905, 274, "both on 127.0.0.1:<random port>", { cls: "t xs mut", anchor: "middle" }),
    arrow([[680, 325], [760, 325]]),
    text(30, 446, "Ports change every launch. The fixed capscreen://app origin keeps the page's local storage stable across launches.", { cls: "t s mut" }),
  ]);

// ── 14 · packaging ───────────────────────────────────────────────────────────

svg("14-packaging.svg", 1100, 450, "Building the installers (desktop/scripts, electron-builder.yml)",
  "Four build steps feed electron-builder. Build each OS on that OS.", () => {
    const rows = [
      ["backend/src", "esbuild bundle", "node22 CJS · corpus · pdf worker", "resources/backend/"],
      ["frontend/", "next build (standalone)", "flatten node_modules · drop .env*", "resources/frontend/"],
      ["Watchman v1.2.1 (Go)", "go build per OS/arch", "pure Go, no libpostal", "resources/bin/"],
      ["desktop/src", "tsc", "main process", "dist/main.js"],
    ];
    const out = [];
    rows.forEach(([src, step, detail, outp], i) => {
      const y = 96 + i * 80;
      out.push(box({ x: 30, y, w: 180, h: 58, cls: "ui", title: src }));
      out.push(arrow([[210, y + 29], [236, y + 29]]));
      out.push(box({ x: 236, y, w: 270, h: 58, title: step, lines: [detail] }));
      out.push(arrow([[506, y + 29], [532, y + 29]]));
      out.push(box({ x: 532, y, w: 200, h: 58, cls: "data", title: outp, mono: true }));
      out.push(arrow([[732, y + 29], [770, y + 29]]));
    });
    out.push(box({ x: 770, y: 96, w: 140, h: 298, cls: "code", title: "electron-builder", lines: ["+ icons", "per-OS binary"] }));
    [["DMG", "arm64 + x64"], ["NSIS", "Windows"], ["AppImage", "Linux"]].forEach(([t, l], i) => {
      const y = 110 + i * 96;
      out.push(arrow([[910, y + 34], [940, y + 34]]));
      out.push(box({ x: 940, y, w: 140, h: 68, cls: "ext", title: t, lines: [l] }));
    });
    out.push(text(30, 428, "Unsigned unless CSC_* signing variables are set. Next's traced sharp binary is platform-specific, so build on the target OS.", { cls: "t s mut" }));
    return out;
  });

// ── 15 · frontend layers ─────────────────────────────────────────────────────

svg("15-frontend.svg", 1180, 420, "Frontend layers (frontend/src/)",
  "Routes are thin; each feature owns its components, hooks and helpers; every backend call goes through api/.", () => [
    box({ x: 30, y: 110, w: 150, h: 70, cls: "ui", title: "app/", mono: true, lines: ["routes, thin pages"] }),
    arrow([[180, 145], [205, 145]]),
    box({ x: 205, y: 110, w: 190, h: 70, cls: "ui", title: "features/<f>/", mono: true, lines: ["components/ incl.", "the <Name>Page"] }),
    arrow([[395, 145], [420, 145]]),
    box({ x: 420, y: 110, w: 170, h: 70, title: "hooks/", mono: true, lines: ["data loading, SSE"] }),
    arrow([[590, 145], [615, 145]]),
    box({ x: 615, y: 110, w: 170, h: 70, title: "api/<module>.ts", mono: true, lines: ["one per backend", "module"] }),
    arrow([[785, 145], [810, 145]]),
    box({ x: 810, y: 110, w: 160, h: 70, title: "client.ts", mono: true, lines: ["apiBase() picks", "the origin"] }),
    arrow([[970, 132], [995, 132], [995, 112], [1010, 112]]),
    arrow([[970, 158], [995, 158], [995, 186], [1010, 186]]),
    box({ x: 1010, y: 88, w: 150, h: 50, title: "desktop", lines: ["capscreen://app/__api"] }),
    box({ x: 1010, y: 162, w: 150, h: 50, cls: "ui", title: "pnpm dev", lines: ["localhost:3001"] }),

    box({ x: 205, y: 260, w: 580, h: 64, cls: "ui", title: "Shared code", lines: ["components/ (ui, layout, chat, common) · contexts/ · hooks/ · lib/ (desktop bridge) · types/"] }),
    arrow([[300, 260], [300, 180]]),
    arrow([[505, 260], [505, 180]]),
    arrow([[785, 292], [840, 292]], { dash: true, label: "types", at: [812, 284] }),
    box({ x: 840, y: 260, w: 320, h: 64, cls: "code", title: "backend/src/types/screening.ts", mono: true, lines: ["one contract, imported type-only"] }),
    text(30, 376, "A file used by one feature lives in that feature; a file used by several lives in components/, hooks/, lib/ or types/.", { cls: "t s mut" }),
  ]);

// ── 16 · tabular review ──────────────────────────────────────────────────────

svg("16-tabular.svg", 1100, 430, "Tabular reviews: three kinds and the Status write-back",
  "A review is a grid. Where its cells come from depends on the kind; the Status column is the person's decision.", () => [
    box({ x: 30, y: 92, w: 330, h: 84, cls: "ai", title: "standard", mono: true, lines: ["rows = documents", "cells written by the model from each document"] }),
    box({ x: 385, y: 92, w: 330, h: 84, title: "entity_screening", mono: true, lines: ["rows = entities from a screen", "cells straight from the screening result"] }),
    box({ x: 740, y: 92, w: 330, h: 84, title: "portfolio_monitoring", mono: true, lines: ["rows = startups", "kept in sync after every screen"] }),

    box({ x: 30, y: 250, w: 220, h: 70, title: "Screen / re-screen", lines: ["new result for a startup"] }),
    arrow([[250, 285], [300, 285]]),
    box({ x: 300, y: 240, w: 240, h: 90, cls: "ui", title: "Grid", lines: ["Status cell:", "cleared · escalated", "blocked · pending"] }),
    arrow([[540, 285], [590, 285]], { both: true }),
    box({ x: 590, y: 250, w: 220, h: 70, title: "reviewStatusSync", mono: true, lines: ["keeps both sides equal"] }),
    arrow([[810, 285], [860, 285]], { both: true }),
    box({ x: 860, y: 250, w: 210, h: 70, cls: "data", title: "Decisions", lines: ["EntityReview or the", "startup's portfolio status"] }),
    text(30, 372, "Grid chat sees the grid as a Markdown table (first 80 rows) and uses the same agent and tools as the assistant.", { cls: "t s mut" }),
    text(30, 392, "Grids export to Excel in the browser.", { cls: "t s mut" }),
  ]);

// ── 17 · security ────────────────────────────────────────────────────────────

svg("17-security.svg", 1000, 580, "Security boundaries",
  "Each ring is a boundary with its own control. The innermost ring is where the data lives.", () => [
    `<rect class="ext bx dash" x="30" y="84" width="940" height="466" rx="18"/>`,
    text(50, 108, "THE INTERNET", { cls: "zonet" }),
    text(50, 126, "Leaves the machine: list downloads · sign-in · cloud models only if assigned (local-only blocks) · web_search asks first"),
    `<rect class="ui bx" x="70" y="140" width="860" height="390" rx="16"/>`,
    text(90, 164, "YOUR MACHINE", { cls: "zonet" }),
    text(90, 182, "Backend, UI and Watchman bind to 127.0.0.1 only · secrets sealed by the OS keychain · desktop never reads .env"),
    `<rect class="code bx" x="110" y="196" width="780" height="314" rx="14"/>`,
    text(130, 220, "LOCAL API", { cls: "zonet" }),
    text(130, 238, "Per-launch token (x-capscreen-token, constant-time check) added by the main process · sandboxed renderer, validated IPC"),
    `<rect class="data bx" x="150" y="252" width="700" height="238" rx="12"/>`,
    text(170, 276, "DATA  ·  <userData>", { cls: "zonet" }),
    box({ x: 170, y: 292, w: 200, h: 70, cls: "data", title: "API keys", lines: ["AES-256-GCM,", "master key in keychain"] }),
    box({ x: 400, y: 292, w: 200, h: 70, cls: "data", title: "Backups", lines: ["AES-256-GCM,", "key from your password"] }),
    box({ x: 630, y: 292, w: 200, h: 70, cls: "warn", title: "Database", lines: ["not encrypted at rest", "(rely on FileVault)"] }),
    box({ x: 170, y: 384, w: 660, h: 84, cls: "ui", title: "Prompts and audit", lines: [
      "uploaded text and entity names are escaped and fenced in prompts",
      "audit log for uploads, screens, reviews, documents, tool approvals · hash-chained export"] }),
  ]);

// ── 18 · module dependencies ─────────────────────────────────────────────────

svg("18-module-deps.svg", 1100, 590, "Backend module dependencies",
  "Arrows mean 'calls'. Modules handle HTTP; lib/ engines do the work; all data goes through repositories.", () => [
    box({ x: 40, y: 96, w: 300, h: 56, title: "modules/assistant, tabularReviews", lines: ["agentStream.ts"] }),
    box({ x: 400, y: 96, w: 300, h: 56, title: "modules/screening, capTables", lines: ["startups, documents"] }),
    box({ x: 760, y: 96, w: 300, h: 56, title: "modules/portfolio", lines: ["rescreen.service.ts"] }),

    box({ x: 40, y: 200, w: 180, h: 56, cls: "prompt", title: "lib/chat", lines: ["prompt, @-mentions"] }),
    box({ x: 250, y: 200, w: 200, h: 56, cls: "ai", title: "lib/agent", lines: ["agentGraph, runTools"] }),
    box({ x: 480, y: 200, w: 200, h: 56, title: "lib/tools", lines: ["registry + 13 tools"] }),

    box({ x: 40, y: 320, w: 200, h: 64, cls: "ai", title: "lib/llm", lines: ["providers,", "controlCenter"] }),
    box({ x: 270, y: 320, w: 160, h: 64, title: "lib/rag", lines: ["parse, chunk,", "embed, retrieve"] }),
    box({ x: 460, y: 320, w: 160, h: 64, title: "lib/documents", lines: ["memo writers"] }),
    box({ x: 650, y: 320, w: 260, h: 64, title: "lib/screening", lines: ["ingest, graph, watchman,", "classify, exposure, explain"] }),
    box({ x: 930, y: 320, w: 140, h: 64, title: "lib/tabular", lines: ["grid rows"] }),

    arrow([[190, 152], [130, 200]]),
    arrow([[190, 152], [350, 200]]),
    arrow([[450, 228], [480, 228]]),
    arrow([[300, 256], [140, 320]]),
    arrow([[520, 256], [380, 320]]),
    arrow([[580, 256], [540, 320]]),
    arrow([[640, 256], [740, 320]]),
    arrow([[680, 152], [800, 320]]),
    arrow([[910, 152], [840, 320]]),
    arrow([[960, 152], [1000, 320]]),
    arrow([[270, 352], [240, 352]]),
    arrow([[700, 384], [700, 404], [140, 404], [140, 384]], { dash: true, label: "explain + CSV mapping (utility model)", at: [420, 398] }),

    box({ x: 160, y: 452, w: 240, h: 56, title: "modules/*/…repository", lines: ["queries, no rules"] }),
    arrow([[400, 480], [450, 480]]),
    box({ x: 450, y: 452, w: 140, h: 56, title: "models/*", lines: ["schemas"] }),
    arrow([[590, 480], [630, 480]]),
    box({ x: 630, y: 452, w: 150, h: 56, title: "lib/infra/db", lines: ["picks the store"] }),
    arrow([[780, 480], [820, 480]]),
    box({ x: 820, y: 452, w: 240, h: 56, cls: "data", title: "sqliteStore", lines: ["(MongoDB for auth)"] }),
    arrow([[350, 384], [300, 452]]),
    text(40, 548, "lib/tools, lib/rag and lib/chat read data only through repositories. Every module's service also calls its own repository.", { cls: "t s mut" }),
  ]);

// ── 19 · study order ─────────────────────────────────────────────────────────

svg("19-study-order.svg", 1100, 420, "A path through the code",
  "Ten stops, in order. Each builds on the one before.", () => {
    const steps = [
      ["Big picture", ["README, sections 1 + 3"]],
      ["Sample data", ["sample CSV + DEMO.md", "ownership.test.ts"]],
      ["Engine", ["runScreening → ingest", "→ graph → classify"]],
      ["API", ["app.ts → routes.ts →", "modules/screening"]],
      ["Agent", ["AGENT_HARNESS.md →", "agentGraph, tools"]],
      ["Models", ["providers/registry →", "controlCenter/store"]],
      ["Storage", ["infra/db.ts →", "sqliteStore + tests"]],
      ["Desktop", ["main.ts → sidecars →", "protocol.ts → auth/"]],
      ["UI", ["StartupScreenerPage →", "ScreeningResultsPanel"]],
      ["Run it", ["pnpm desktop, set up AI,", "screen the sample CSV"]],
    ];
    const out = [];
    steps.forEach(([t, l], i) => {
      const row = i < 5 ? 0 : 1;
      const col = row === 0 ? i : 9 - i;
      const x = 30 + col * 212;
      const y = 100 + row * 160;
      out.push(box({ x, y, w: 190, h: 96, cls: i === 9 ? "data" : i === 4 ? "ai" : "code", title: t, lines: l }));
      out.push(circle(x + 18, y + 18, 12));
      out.push(`<text class="xs" x="${x + 18}" y="${y + 22}" text-anchor="middle" fill="#fff" font-weight="700">${i + 1}</text>`);
      if (i < 4) out.push(arrow([[x + 190, y + 48], [x + 212, y + 48]]));
      if (i === 4) out.push(arrow([[x + 95, y + 96], [x + 95, y + 160]]));
      if (i > 4 && i < 9) out.push(arrow([[x, y + 48], [x - 22, y + 48]]));
    });
    out.push(text(30, 396, "Steps 3, 5 and 7 have their own deep dives: section 7, docs/AGENT_HARNESS.md and section 10.", { cls: "t s mut" }));
    return out;
  });

finish();

/**
 * Shared drawing helpers for the diagrams in docs/. Each folder's build.mjs
 * imports this, calls outputTo(itsFolder) and draws with the helpers below.
 *
 * Colours carry meaning in every diagram: blue = code (deterministic),
 * violet = a model call, amber = prompt text, green = storage,
 * orange = network, red = errors / limits, white = UI.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

let OUT = ".";

/** Write the next diagrams into `dir`. */
export function outputTo(dir) {
  OUT = dir;
}

const STYLE = `
.bg{fill:#f8fafc}
.t{fill:#0f172a}
.h{font-size:20px;font-weight:700}
.b{font-size:14px;font-weight:700}
.m{font-size:13px}
.s{font-size:12px}
.xs{font-size:11px}
.mut{fill:#475569}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.bx{stroke-width:1.5}
.dash{stroke-dasharray:6 4}
.code{fill:#eff6ff;stroke:#3b82f6}
.ai{fill:#f5f3ff;stroke:#8b5cf6}
.prompt{fill:#fffbeb;stroke:#d97706}
.data{fill:#f0fdf4;stroke:#16a34a}
.ext{fill:#fff7ed;stroke:#ea580c}
.ui{fill:#ffffff;stroke:#94a3b8}
.warn{fill:#fef2f2;stroke:#ef4444}
.hl{fill:#fde68a;opacity:.45}
.zone{fill:none;stroke:#94a3b8;stroke-width:1.5;stroke-dasharray:8 6}
.zonet{fill:#64748b;font-size:12px;font-weight:700;letter-spacing:.06em}
.ln{fill:none;stroke:#475569;stroke-width:1.6}
.lnd{stroke-dasharray:6 5}
.lno{fill:none;stroke:#ea580c;stroke-width:1.6;stroke-dasharray:6 5}
.ahf{fill:#475569}
.aho{fill:#ea580c}
.life{stroke:#cbd5e1;stroke-width:1.5;stroke-dasharray:4 4}
.lbl{fill:#475569;paint-order:stroke;stroke:#f8fafc;stroke-width:5px;stroke-linejoin:round}
.dot{fill:#475569}
`;

const MARKERS = `
<marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path class="ahf" d="M0 0L10 5L0 10z"/></marker>
<marker id="ao" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path class="aho" d="M0 0L10 5L0 10z"/></marker>`;

// ── helpers ──────────────────────────────────────────────────────────────────

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const warnings = [];
let current = "";

/** Rough rendered width of a label, used only for the overflow warning. */
function textWidth(text, size, { bold = false, mono = false } = {}) {
  return text.length * size * (mono ? 0.62 : bold ? 0.58 : 0.5);
}
function fit(text, size, max, opts) {
  const w = textWidth(text, size, opts);
  if (w > max) warnings.push(`${current}: "${text}" ≈${Math.round(w)}px in ${Math.round(max)}px`);
}

function svg(name, w, h, title, subtitle, body) {
  current = name;
  const parts = typeof body === "function" ? body() : body;
  const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" role="img" aria-labelledby="title desc">
<title id="title">${esc(title)}</title>
<desc id="desc">${esc(subtitle ?? title)}</desc>
<defs><style>${STYLE}</style>${MARKERS}</defs>
<rect class="bg" width="${w}" height="${h}"/>
<text class="t h" x="30" y="40">${esc(title)}</text>
${subtitle ? `<text class="t m mut" x="30" y="62">${esc(subtitle)}</text>` : ""}
${parts.flat(Infinity).join("\n")}
</svg>
`;
  writeFileSync(join(OUT, name), out);
}

/** A rounded box with a bold title and smaller lines, centred (or left-aligned). */
function box({ x, y, w, h, cls = "code", title, lines = [], dashed = false, mono = false, small = false, left = false }) {
  const out = [`<rect class="${cls} bx${dashed ? " dash" : ""}" x="${x}" y="${y}" width="${w}" height="${h}" rx="9"/>`];
  const lineH = small ? 15 : 16;
  const titleH = title ? (lines.length ? 20 : 14) : 0;
  const total = titleH + lines.length * lineH;
  let ty = y + h / 2 - total / 2 + (title ? 13 : 12);
  const tx = left ? x + 14 : x + w / 2;
  const anchor = left ? "start" : "middle";
  if (title) {
    fit(title, 14, w - 18, { bold: true, mono });
    out.push(`<text class="t b${mono ? " mono" : ""}" x="${tx}" y="${ty}" text-anchor="${anchor}">${esc(title)}</text>`);
    ty += titleH;
  }
  for (const l of lines) {
    const size = small ? 11 : 12;
    fit(l, size, w - 18);
    out.push(`<text class="t ${small ? "xs" : "s"} mut" x="${tx}" y="${ty}" text-anchor="${anchor}">${esc(l)}</text>`);
    ty += lineH;
  }
  return out.join("");
}

function pathData(points) {
  return "M" + points.map((p) => `${p[0]} ${p[1]}`).join(" L");
}

/** Arrow along a polyline. `orange` marks traffic that leaves the machine. */
function arrow(points, { dash = false, orange = false, both = false, label, at, anchor = "middle" } = {}) {
  const cls = orange ? "lno" : `ln${dash ? " lnd" : ""}`;
  const m = orange ? "url(#ao)" : "url(#ah)";
  let s = `<path class="${cls}" d="${pathData(points)}" marker-end="${m}"${both ? ` marker-start="${m}"` : ""}/>`;
  if (label) s += lbl(at[0], at[1], label, anchor);
  return s;
}
const line = (points, dash = false) => `<path class="ln${dash ? " lnd" : ""}" d="${pathData(points)}"/>`;
const lbl = (x, y, t, anchor = "middle") => `<text class="s lbl" x="${x}" y="${y}" text-anchor="${anchor}">${esc(t)}</text>`;
const text = (x, y, t, { cls = "t s mut", anchor = "start" } = {}) =>
  `<text class="${cls}" x="${x}" y="${y}" text-anchor="${anchor}">${esc(t)}</text>`;

function zone(x, y, w, h, label) {
  return `<rect class="zone" x="${x}" y="${y}" width="${w}" height="${h}" rx="14"/>` +
    (label ? `<text class="zonet" x="${x + 16}" y="${y + 22}">${esc(label)}</text>` : "");
}

function pill(x, y, label, cls) {
  const w = Math.round(label.length * 6.3 + 18);
  return { w, svg: `<rect class="${cls} bx" x="${x}" y="${y}" width="${w}" height="20" rx="10"/><text class="t xs" x="${x + w / 2}" y="${y + 14}" text-anchor="middle">${esc(label)}</text>` };
}

function legend(x, y, items) {
  const out = [];
  for (const [cls, label] of items) {
    out.push(`<rect class="${cls} bx" x="${x}" y="${y - 11}" width="16" height="14" rx="4"/>`);
    out.push(text(x + 22, y, label));
    x += 22 + textWidth(label, 12) + 26;
  }
  return out.join("");
}

/** A white panel with its title in the top-left corner. */
function panel(x, y, w, h, title) {
  return `<rect class="ui bx" x="${x}" y="${y}" width="${w}" height="${h}" rx="9"/>` + text(x + 16, y + 26, title, { cls: "t b" });
}

function circle(cx, cy, r, cls = "dot") {
  return `<circle class="${cls}" cx="${cx}" cy="${cy}" r="${r}"/>`;
}

// Sequence diagrams
function lifelines(actors, top, bottom) {
  return actors.map(({ x, name, cls }) => [
    `<line class="life" x1="${x}" y1="${top + 44}" x2="${x}" y2="${bottom}"/>`,
    box({ x: x - 88, y: top, w: 176, h: 44, cls, title: name }),
  ]);
}
function msg(x1, x2, y, label, { dash = false, orange = false } = {}) {
  fit(label, 12, Math.max(Math.abs(x2 - x1) + 120, 160));
  return arrow([[x1, y], [x2, y]], { dash, orange, label, at: [(x1 + x2) / 2, y - 7] });
}
function note(cx, y, w, label, cls = "code") {
  fit(label, 12, w - 14);
  return `<rect class="${cls} bx" x="${cx - w / 2}" y="${y - 15}" width="${w}" height="26" rx="6"/>` +
    text(cx, y + 3, label, { cls: "t s", anchor: "middle" });
}

const LEGEND = [
  ["code", "Code (deterministic)"],
  ["ai", "Model call"],
  ["prompt", "Prompt text"],
  ["data", "Storage"],
  ["ext", "Network"],
  ["ui", "UI"],
];

/** Print the overflow warnings collected while drawing. */
export function finish() {
  if (warnings.length) {
    console.warn(`Labels that may not fit (${warnings.length}):`);
    for (const w of warnings) console.warn(`  ${w}`);
  } else {
    console.log("All diagrams written; no overflow warnings.");
  }
}

export { svg, box, arrow, line, lbl, text, zone, pill, legend, panel, circle, lifelines, msg, note, fit, textWidth, esc, LEGEND };

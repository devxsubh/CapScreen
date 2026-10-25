import fs from "fs";
import { app } from "electron";
import path from "path";
import { resourcesDir } from "./paths";

/** Inline brand mark; recoloured via CSS so it inverts in dark mode. */
function markSvg(): string {
  const file = app.isPackaged
    ? resourcesDir("frontend", "frontend", "public", "capscreen-mark.svg")
    : path.join(__dirname, "..", "..", "frontend", "public", "capscreen-mark.svg");
  try {
    return fs.readFileSync(file, "utf8").replace(/<\?xml[^>]*>/, "").replace("<svg ", '<svg class="mark" width="56" height="56" ');
  } catch {
    return "";
  }
}

const BASE_CSS = `
  :root { color-scheme: light dark; --bg:#fff; --fg:#111; --muted:#6b7280; --line:#e5e7eb; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0b0b0c; --fg:#f3f4f6; --muted:#9ca3af; --line:#27272a; } }
  * { box-sizing: border-box; }
  body { margin:0; height:100vh; display:flex; align-items:center; justify-content:center; background:var(--bg); color:var(--fg);
         font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; -webkit-app-region: drag; }
  .card { max-width: 520px; padding: 32px; text-align:center; }
  h1 { font: 500 28px/1.2 Georgia, "Times New Roman", serif; margin: 16px 0 8px; }
  p { color: var(--muted); margin: 6px 0; }
  .spinner { width: 28px; height: 28px; border: 2.5px solid var(--line); border-top-color: var(--fg); border-radius: 50%;
             margin: 0 auto; animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .mark { display:block; margin: 0 auto 4px; }
  .mark circle { fill: var(--fg); } .mark path { fill: var(--bg); }
  pre { text-align:left; white-space:pre-wrap; word-break:break-word; background: rgba(127,127,127,.08); border:1px solid var(--line);
        border-radius: 8px; padding: 12px; font: 12px/1.45 ui-monospace, Menlo, monospace; max-height: 200px; overflow:auto; }
  .row { display:flex; gap:8px; justify-content:center; margin-top: 16px; -webkit-app-region: no-drag; }
  a.btn { padding: 8px 14px; border-radius: 8px; border:1px solid var(--line); color: var(--fg); text-decoration:none; }
  a.btn.primary { background: var(--fg); color: var(--bg); border-color: var(--fg); }
`;

export function splashHtml(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>CapScreen</title><style>${BASE_CSS}</style></head>
  <body><div class="card">${markSvg()}<h1>CapScreen</h1><div class="spinner"></div>
  <p>Starting the on-device screening engine…</p>
  <p style="font-size:12px">Your data stays on this computer.</p></div></body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function errorHtml(message: string, logsDir: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>CapScreen</title><style>${BASE_CSS}</style></head>
  <body><div class="card">${markSvg()}<h1>CapScreen couldn't start</h1>
  <p>One of the local services failed to launch.</p>
  <pre>${escapeHtml(message)}</pre>
  <p style="font-size:12px">Logs: ${escapeHtml(logsDir)}</p>
  <div class="row"><a class="btn" href="about:blank#logs">Open logs</a><a class="btn primary" href="about:blank#retry">Retry</a></div>
  </div></body></html>`;
}

export type SignInView = { state: "idle" } | { state: "waiting" } | { state: "error"; message: string };

/**
 * Gate shown until the user signs in. Buttons navigate to about:blank#… and
 * main.ts intercepts them (the page itself has no privileges).
 */
export function signInHtml(view: SignInView): string {
  const body =
    view.state === "waiting"
      ? `<div class="spinner"></div>
         <p>Finish signing in in your browser.</p>
         <p style="font-size:12px">Didn't see a browser window?</p>
         <div class="row"><a class="btn" href="about:blank#reopen">Open sign-in page again</a><a class="btn" href="about:blank#cancel">Cancel</a></div>`
      : `<p>Sign in with your CapScreen account to continue.</p>
         <p style="font-size:12px">Your account controls access only. Cap tables, documents and screenings stay on this computer.</p>
         ${view.state === "error" ? `<pre>${escapeHtml(view.message)}</pre>` : ""}
         <div class="row"><a class="btn primary" href="about:blank#signin">Sign in with browser</a><a class="btn" href="about:blank#signup">Create account</a></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>CapScreen</title><style>${BASE_CSS}</style></head>
  <body><div class="card">${markSvg()}<h1>Welcome to CapScreen</h1>${body}</div></body></html>`;
}

/** Shown in the browser tab after it hands the sign-in back to the app. */
export function authDonePage(ok: boolean, message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>CapScreen</title><style>${BASE_CSS}
  body { -webkit-app-region: none; }</style></head>
  <body><div class="card">${markSvg()}<h1>${ok ? "You're signed in" : "Sign-in didn't complete"}</h1>
  <p>${escapeHtml(message)}</p></div></body></html>`;
}

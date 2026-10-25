// Builds the Next.js UI in standalone mode and stages it for packaging:
// desktop/resources/frontend/frontend/server.js (+ traced node_modules, static, public).
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const fe = path.join(root, "frontend");
const out = path.join(root, "desktop", "resources", "frontend");

execFileSync(path.join(fe, "node_modules", ".bin", process.platform === "win32" ? "next.cmd" : "next"), ["build"], {
  cwd: fe,
  stdio: "inherit",
  env: { ...process.env, CAPSCREEN_DESKTOP_BUILD: "1", NEXT_TELEMETRY_DISABLED: "1" },
});

/** Recursive copy that replaces every symlink with the real file/dir (pnpm layout). */
function copyResolved(src, dest) {
  const real = fs.realpathSync(src);
  const st = fs.statSync(real);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(real)) copyResolved(path.join(src, name), path.join(dest, name));
  } else {
    fs.copyFileSync(real, dest);
    fs.chmodSync(dest, st.mode);
  }
}

fs.rmSync(out, { recursive: true, force: true });
// pnpm symlinks don't survive packaging (fs.cpSync's dereference is top-level only).
copyResolved(path.join(fe, ".next", "standalone"), out);
// Flatten pnpm's layout into the server's own node_modules. electron-builder
// drops a top-level node_modules from extraResources (it treats it as app
// deps) and skips the hidden .pnpm store, so lift the hoisted packages into
// frontend/frontend/node_modules — the first place Node resolves from.
const rootModules = path.join(out, "node_modules");
const serverModules = path.join(out, "frontend", "node_modules");
const hoisted = path.join(rootModules, ".pnpm", "node_modules");
fs.mkdirSync(serverModules, { recursive: true });
for (const dir of [hoisted, rootModules]) {
  if (!fs.existsSync(dir)) continue;
  for (const name of fs.readdirSync(dir)) {
    if (name === ".pnpm") continue;
    const target = path.join(serverModules, name);
    if (!fs.existsSync(target)) fs.renameSync(path.join(dir, name), target);
  }
}
fs.rmSync(rootModules, { recursive: true, force: true });

// Next expects static assets and public/ next to the server; standalone omits them.
fs.cpSync(path.join(fe, ".next", "static"), path.join(out, "frontend", ".next", "static"), { recursive: true });
if (fs.existsSync(path.join(fe, "public"))) {
  fs.cpSync(path.join(fe, "public"), path.join(out, "frontend", "public"), { recursive: true });
}
// No secrets in the shipped UI: drop any env files the trace picked up.
for (const f of fs.readdirSync(path.join(out, "frontend"))) {
  if (f.startsWith(".env")) fs.rmSync(path.join(out, "frontend", f));
}
if (!fs.existsSync(path.join(out, "frontend", "server.js"))) throw new Error("standalone server.js missing");
console.log(`frontend staged → ${path.relative(root, out)}`);

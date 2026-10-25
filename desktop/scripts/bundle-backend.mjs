// Bundles the Express backend into one file for the packaged app:
// desktop/resources/backend/index.js (+ compliance corpus).
import { build } from "esbuild";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const out = path.join(root, "desktop", "resources", "backend");
fs.rmSync(out, { recursive: true, force: true });

await build({
  entryPoints: [path.join(root, "backend", "src", "index.ts")],
  outfile: path.join(out, "index.js"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: "linked",
  minify: false,
  legalComments: "linked",
  // Optional native/cloud add-ons of the MongoDB driver and SDKs — loaded in
  // try/catch by their owners and unused by the desktop app.
  external: [
    "kerberos",
    "snappy",
    "@mongodb-js/zstd",
    "mongodb-client-encryption",
    "gcp-metadata",
    "socks",
    "aws4",
    "@aws-sdk/credential-providers",
    "@napi-rs/canvas",
    "canvas",
  ],
  logLevel: "warning",
});

fs.cpSync(path.join(root, "backend", "compliance-corpus"), path.join(out, "compliance-corpus"), { recursive: true });

// pdf.js loads its worker from next to the running module (our index.js).
const pdfParseDir = fs.realpathSync(path.join(root, "backend", "node_modules", "pdf-parse"));
fs.copyFileSync(path.join(pdfParseDir, "dist", "pdf-parse", "cjs", "pdf.worker.mjs"), path.join(out, "pdf.worker.mjs"));
const size = fs.statSync(path.join(out, "index.js")).size;
console.log(`backend bundle: ${(size / 1024 / 1024).toFixed(1)} MB → ${path.relative(root, out)}`);

// Renders CapScreen icons with Chromium from the brand mark (frontend/public/capscreen-mark.svg):
//   resources/icons/icon.png               1024px app icon (white rounded square + mark)
//   resources/icons/trayTemplate(@2x).png  macOS menu-bar template (letters knocked out)
// Run: electron scripts/make-icons.js
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const markSvg = fs.readFileSync(path.join(root, "..", "frontend", "public", "capscreen-mark.svg"), "utf8");
const lettersPath = /<path fill="#FFFFFF" d="([^"]+)"/.exec(markSvg)[1];

/** Render at ≥256px (tiny offscreen windows fail to load) and downscale. */
async function render(html, size) {
  const canvas = Math.max(size, 256);
  const win = new BrowserWindow({ width: canvas, height: canvas, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } });
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(`<html><body style="margin:0;background:transparent">${html}</body></html>`));
  await new Promise((r) => setTimeout(r, 300));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: canvas, height: canvas });
  win.destroy();
  return img.resize({ width: size, height: size, quality: "best" }).toPNG();
}

// Each render closes its window; don't let "all windows closed" quit mid-run.
app.on("window-all-closed", () => {});

app.whenReady().then(async () => {
  const out = path.join(root, "resources", "icons");
  const S = 1024;
  // macOS icon grid: 824px rounded square inside 1024 canvas; mark at ~66% of the tile.
  const tile = 824;
  const mark = Math.round(tile * 0.66);
  const appIcon = `
    <div style="width:${S}px;height:${S}px;display:flex;align-items:center;justify-content:center">
      <div style="width:${tile}px;height:${tile}px;border-radius:${tile * 0.2237}px;background:linear-gradient(180deg,#ffffff,#f4f4f5);
                  box-shadow:0 10px 24px rgba(0,0,0,.18), inset 0 0 0 1px rgba(0,0,0,.06);display:flex;align-items:center;justify-content:center">
        ${markSvg.replace("<svg ", `<svg width="${mark}" height="${mark}" `)}
      </div>
    </div>`;
  fs.writeFileSync(path.join(out, "icon.png"), await render(appIcon, S));

  // Template image: opaque circle, transparent letters (macOS tints it).
  const template = (size) => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 391 391" width="${size}" height="${size}">
      <defs><mask id="m"><rect width="391" height="391" fill="#fff"/><path fill="#000" d="${lettersPath}"/></mask></defs>
      <circle cx="195.5" cy="195.5" r="180" fill="#000" mask="url(#m)"/>
    </svg>`;
  fs.writeFileSync(path.join(out, "trayTemplate.png"), await render(template(256), 18));
  fs.writeFileSync(path.join(out, "trayTemplate@2x.png"), await render(template(256), 36));
  console.log("icons written to resources/icons");
  app.quit();
});

import { Menu, nativeImage, shell, Tray } from "electron";
import { resourcesDir, userData } from "../paths";
import { navigate, quit, showWindow } from "./mainWindow";

let tray: Tray | null = null;

function trayIcon(): Electron.NativeImage {
  const img = nativeImage.createFromPath(resourcesDir("icons", "trayTemplate.png"));
  if (process.platform === "darwin") img.setTemplateImage(true);
  return img;
}

/** Menu-bar / system-tray icon: CapScreen keeps running here when the window is closed. */
export function buildTray(opts: { signOut: () => void }): void {
  tray = new Tray(trayIcon());
  tray.setToolTip("CapScreen — background screening active");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open CapScreen", click: () => showWindow() },
      { label: "AI Control Center", click: () => navigate("/settings/ai") },
      { label: "Portfolio monitoring", click: () => navigate("/startups") },
      { type: "separator" },
      { label: "Open logs folder", click: () => void shell.openPath(userData("logs")) },
      { type: "separator" },
      { label: "Sign out", click: () => opts.signOut() },
      { label: "Quit CapScreen", click: () => quit() },
    ]),
  );
  tray.on("click", () => showWindow());
}

import { app, BrowserWindow, shell } from "electron";
import path from "path";
import { APP_ORIGIN } from "../bridge/protocol";
import { appUrl, getRuntime } from "../runtime";
import { splashHtml } from "./shellPages";

/**
 * The one app window. Closing it hides to the tray (background re-screening
 * keeps running); only quit() really exits.
 */

let mainWindow: BrowserWindow | null = null;
let quitting = false;

export function hasWindow(): boolean {
  return mainWindow !== null;
}

export function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    title: "CapScreen",
    backgroundColor: "#ffffff",
    show: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      // Compiled next to main.js in dist/.
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  // Everything external opens in the user's browser; the app never navigates away.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url) && !url.startsWith(getRuntime()?.frontendUrl ?? "\0")) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (e, url) => {
    const runtime = getRuntime();
    const allowed = url.startsWith(APP_ORIGIN) || (runtime && url.startsWith(runtime.frontendUrl)) || url.startsWith("data:");
    if (!allowed) {
      e.preventDefault();
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    }
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());

  // Closing the window keeps CapScreen in the tray so background re-screening runs.
  mainWindow.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      mainWindow?.hide();
      if (process.platform === "darwin") app.dock?.hide();
    }
  });
  mainWindow.on("show", () => {
    if (process.platform === "darwin") void app.dock?.show();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (getRuntime()) void mainWindow.loadURL(appUrl());
  else void mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml())}`);
}

export function showWindow(): void {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

/** Open an in-app route (menu, tray, notifications). */
export function navigate(route: string): void {
  showWindow();
  mainWindow?.webContents.send("capscreen:navigate", route);
}

/** Show one of the shell's own HTML pages (splash, sign-in, error). */
export function showPage(html: string): Promise<void> {
  return mainWindow?.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`) ?? Promise.resolve();
}

/** Load the app itself, once the sidecars are running. */
export async function loadApp(): Promise<void> {
  if (getRuntime()) await mainWindow?.loadURL(appUrl());
}

/** Let the window actually close (quit from the menu, tray or OS). */
export function setQuitting(): void {
  quitting = true;
}

export function quit(): void {
  quitting = true;
  app.quit();
}

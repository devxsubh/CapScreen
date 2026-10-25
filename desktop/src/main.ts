import crypto from "crypto";
import fs from "fs";
import { app, BrowserWindow, Menu, nativeImage, shell, Tray, type MenuItemConstructorOptions } from "electron";
import path from "path";
import { registerIpc } from "./ipc";
import { isDev, resourcesDir, userData } from "./paths";
import { API_PREFIX, APP_ORIGIN, handleAppProtocol, injectTokenForDev, registerSchemes } from "./protocol";
import { onSidecarEvent, startBackend, startFrontend, startWatchman, stopAll, watchSanctionsSettings, type RuntimeInfo } from "./sidecars";
import { startNotificationPoller } from "./notifications";
import { loadMasterKey } from "./vault";
import { splashHtml, errorHtml, signInHtml, type SignInView } from "./splash";
import { AUTH_URL, beginSignIn, currentSession, onSessionExpired, restoreSession, signOut } from "./session";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let runtime: RuntimeInfo | null = null;
let quitting = false;

// Dev-only: run without the cloud auth service.
const skipAuth = isDev && process.env.CAPSCREEN_SKIP_AUTH === "1";
let gateResolve: (() => void) | null = null;
let pendingSignIn: Awaited<ReturnType<typeof beginSignIn>> | null = null;

const appUrl = () => (isDev ? runtime!.frontendUrl : `${APP_ORIGIN}/`);
// Empty until boot completes (the splash page's preload asks too).
const apiBase = () => (!runtime ? "" : isDev ? runtime.backendUrl : `${APP_ORIGIN}${API_PREFIX}`);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());
}

registerSchemes();
app.setName("CapScreen");

// Log main-process failures to logs/main.log instead of a blocking modal dialog.
const rawConsoleError = console.error.bind(console);
function logMainError(kind: string, err: unknown): void {
  const line = `${new Date().toISOString()} ${kind}: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`;
  rawConsoleError(line);
  try {
    fs.mkdirSync(userData("logs"), { recursive: true });
    fs.appendFileSync(userData("logs", "main.log"), line);
  } catch {
    /* logging must never throw */
  }
}
process.on("uncaughtException", (err) => logMainError("uncaughtException", err));
if (!isDev) {
  // Packaged builds have no terminal: mirror console.error into main.log.
  console.error = (...args: unknown[]) =>
    logMainError("error", args.map((a) => (a instanceof Error ? (a.stack ?? a.message) : String(a))).join(" "));
}
process.on("unhandledRejection", (err) => logMainError("unhandledRejection", err));

// Dev-only automation hook (CDP on loopback) for end-to-end testing.
if (isDev && process.env.CAPSCREEN_REMOTE_DEBUG) {
  app.commandLine.appendSwitch("remote-debugging-port", process.env.CAPSCREEN_REMOTE_DEBUG);
  app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
}

function navigate(route: string): void {
  showWindow();
  mainWindow?.webContents.send("capscreen:navigate", route);
}

function showWindow(): void {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createWindow(): void {
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
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  // Everything external opens in the user's browser; the app never navigates away.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url) && !url.startsWith(runtime?.frontendUrl ?? "\0")) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (e, url) => {
    // Buttons on the sign-in gate.
    const gateAction = /^about:blank#(signin|signup|reopen|cancel)$/.exec(url)?.[1];
    if (gateAction) {
      e.preventDefault();
      void handleGateAction(gateAction);
      return;
    }
    // Buttons on the boot error page.
    if (url === "about:blank#retry" || url === "about:blank#logs") {
      e.preventDefault();
      if (url.endsWith("#logs")) void shell.openPath(userData("logs"));
      else void mainWindow?.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml())}`).then(start);
      return;
    }
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

  if (runtime) void mainWindow.loadURL(appUrl());
  else void mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml())}`);
}

function trayIcon(): Electron.NativeImage {
  const img = nativeImage.createFromPath(resourcesDir("icons", "trayTemplate.png"));
  if (process.platform === "darwin") img.setTemplateImage(true);
  return img;
}

function buildTray(): void {
  tray = new Tray(trayIcon());
  tray.setToolTip("CapScreen — background screening active");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open CapScreen", click: () => showWindow() },
      { label: "AI Control Center", click: () => navigate("/ai") },
      { label: "Portfolio monitoring", click: () => navigate("/startups") },
      { type: "separator" },
      { label: "Open logs folder", click: () => void shell.openPath(userData("logs")) },
      { type: "separator" },
      { label: "Sign out", click: () => void signOutAndGate() },
      { label: "Quit CapScreen", click: () => quit() },
    ]),
  );
  tray.on("click", () => showWindow());
}

function buildMenu(): void {
  const isMac = process.platform === "darwin";
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: "CapScreen",
            submenu: [
              { role: "about" },
              { type: "separator" },
              { label: "AI Control Center…", accelerator: "Cmd+,", click: () => navigate("/ai") },
              { label: "Data & Backup…", click: () => navigate("/settings/data") },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { type: "separator" },
              { label: "Quit CapScreen", accelerator: "Cmd+Q", click: () => quit() },
            ],
          } as MenuItemConstructorOptions,
        ]
      : []),
    {
      label: "File",
      submenu: [
        { label: "New Startup", accelerator: "CmdOrCtrl+N", click: () => navigate("/startups?new=1") },
        { type: "separator" },
        ...(!isMac
          ? ([
              { label: "AI Control Center…", accelerator: "Ctrl+,", click: () => navigate("/ai") },
              { label: "Data & Backup…", click: () => navigate("/settings/data") },
              { type: "separator" },
              { label: "Quit", accelerator: "Ctrl+Q", click: () => quit() },
            ] as MenuItemConstructorOptions[])
          : [{ role: "close" } as MenuItemConstructorOptions]),
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        ...(isDev ? ([{ role: "toggleDevTools" }] as MenuItemConstructorOptions[]) : []),
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        { label: "Open logs folder", click: () => void shell.openPath(userData("logs")) },
        { label: "Open data folder", click: () => void shell.openPath(userData()) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function boot(): Promise<void> {
  const token = crypto.randomBytes(32).toString("base64url");
  const masterKey = loadMasterKey();

  const watchmanUrl = await startWatchman();
  const [frontendUrl, backendUrl] = await Promise.all([
    startFrontend(),
    startBackend({
      watchmanUrl,
      token,
      masterKey,
      frontendOrigin: APP_ORIGIN,
      apiOrigin: (port) => (isDev ? `http://127.0.0.1:${port}` : `${APP_ORIGIN}${API_PREFIX}`),
    }),
  ]);
  runtime = { watchmanUrl, backendUrl, frontendUrl, token };

  if (isDev) injectTokenForDev(runtime);
  else handleAppProtocol(runtime);

  startNotificationPoller(runtime, navigate);
  watchSanctionsSettings();
}

function showPage(html: string): Promise<void> {
  return mainWindow?.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`) ?? Promise.resolve();
}

function showGate(view: SignInView): void {
  void showPage(signInHtml(view));
}

/** Show the sign-in gate and resolve once the user is signed in. */
function requireSignIn(): Promise<void> {
  showGate({ state: "idle" });
  return new Promise<void>((resolve) => (gateResolve = resolve));
}

async function handleGateAction(action: string): Promise<void> {
  if (action === "reopen" && pendingSignIn) {
    await shell.openExternal(pendingSignIn.handle.authorizeUrl);
    return;
  }
  if (action === "cancel") {
    pendingSignIn?.handle.cancel();
    return;
  }
  // signin / signup: start a fresh browser round-trip.
  pendingSignIn?.handle.cancel();
  try {
    const flow = await beginSignIn();
    pendingSignIn = flow;
    await shell.openExternal(flow.handle.authorizeUrl + (action === "signup" ? "#signup" : ""));
    showGate({ state: "waiting" });
    await flow.done;
    pendingSignIn = null;
    showWindow();
    gateResolve?.();
    gateResolve = null;
  } catch (err) {
    pendingSignIn = null;
    const message = err instanceof Error ? err.message : String(err);
    showGate(message === "Sign-in cancelled" ? { state: "idle" } : { state: "error", message });
  }
}

async function start(): Promise<void> {
  // Local services start while the user signs in.
  const bootTask = boot();
  bootTask.catch(() => {}); // surfaced below
  try {
    if (!skipAuth && !(await restoreSession())) {
      await requireSignIn();
      await showPage(splashHtml());
    }
    await bootTask;
    if (!mainWindow) createWindow();
    else await mainWindow.loadURL(appUrl());
  } catch (err) {
    console.error("[boot]", err);
    stopAll();
    const message = err instanceof Error ? err.message : String(err);
    await showPage(errorHtml(message, userData("logs")));
  }
}

/** Sign out (menu, tray, or account page) → gate → back into the app. */
async function signOutAndGate(): Promise<void> {
  await signOut();
  await requireSignIn();
  if (runtime) await mainWindow?.loadURL(appUrl());
}

onSessionExpired(() => {
  void (async () => {
    showWindow();
    await requireSignIn();
    if (runtime) await mainWindow?.loadURL(appUrl());
  })();
});

function quit(): void {
  quitting = true;
  app.quit();
}

app.on("before-quit", () => {
  quitting = true;
  stopAll();
});

// kill / OS shutdown: quit through Electron so sidecars are stopped too.
for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"] as const) {
  process.on(signal, () => quit());
}

app.on("activate", () => showWindow());
app.on("window-all-closed", () => {
  /* stay alive in the tray */
});

onSidecarEvent((name, event, detail) => {
  console.warn(`[sidecar] ${name} ${event}: ${detail}`);
});

void app.whenReady().then(() => {
  registerIpc({
    apiBase,
    navigate,
    session: () => {
      const s = currentSession();
      return s ? { user: s.user, offline: s.offline } : null;
    },
    signOut: signOutAndGate,
    accountUrl: () => AUTH_URL,
  });
  buildMenu();
  buildTray();
  createWindow();
  void start();
});

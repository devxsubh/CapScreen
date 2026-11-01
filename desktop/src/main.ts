import crypto from "crypto";
import { app, shell } from "electron";
import { requireSignIn, handleGateAction } from "./auth/signInGate";
import { AUTH_URL, currentSession, onSessionExpired, restoreSession, signOut } from "./auth/session";
import { registerIpc } from "./bridge/ipc";
import { API_PREFIX, APP_ORIGIN, handleAppProtocol, injectTokenForDev, registerSchemes } from "./bridge/protocol";
import { installErrorLogging } from "./logging";
import { startNotificationPoller } from "./notifications";
import { isDev, userData } from "./paths";
import { apiBase, setRuntime } from "./runtime";
import { startBackend } from "./sidecars/backend";
import { startFrontend } from "./sidecars/frontend";
import { onSidecarEvent, stopAll } from "./sidecars/supervisor";
import { startWatchman, watchSanctionsSettings } from "./sidecars/watchman";
import { loadMasterKey } from "./vault";
import { createWindow, hasWindow, loadApp, navigate, quit, setQuitting, showPage, showWindow } from "./window/mainWindow";
import { buildMenu } from "./window/menu";
import { errorHtml, splashHtml } from "./window/shellPages";
import { buildTray } from "./window/tray";

/**
 * Electron entry point: start the sidecars, gate on sign-in, then load the app.
 * The pieces live in auth/, bridge/, sidecars/ and window/.
 */

// Dev-only: run without the cloud auth service.
const skipAuth = isDev && process.env.CAPSCREEN_SKIP_AUTH === "1";

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());
}

registerSchemes();
app.setName("CapScreen");
installErrorLogging();

// Dev-only automation hook (CDP on loopback) for end-to-end testing.
if (isDev && process.env.CAPSCREEN_REMOTE_DEBUG) {
  app.commandLine.appendSwitch("remote-debugging-port", process.env.CAPSCREEN_REMOTE_DEBUG);
  app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
}

/** Start Watchman, then the backend and UI, and route the window to them. */
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
  const runtime = { watchmanUrl, backendUrl, frontendUrl, token };
  setRuntime(runtime);

  if (isDev) injectTokenForDev(runtime);
  else handleAppProtocol(runtime);

  startNotificationPoller(runtime, navigate);
  watchSanctionsSettings();
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
    if (!hasWindow()) createWindow();
    else await loadApp();
  } catch (err) {
    console.error("[boot]", err);
    stopAll();
    const message = err instanceof Error ? err.message : String(err);
    await showPage(errorHtml(message, userData("logs")));
  }
}

/** Buttons on the shell pages (window/shellPages.ts), sent over IPC. */
function handleShellAction(action: string): void {
  switch (action) {
    case "signin":
    case "signup":
    case "reopen":
    case "cancel":
      void handleGateAction(action);
      break;
    case "logs":
      void shell.openPath(userData("logs"));
      break;
    case "retry":
      void showPage(splashHtml()).then(start);
      break;
  }
}

/** Sign out (menu, tray, or account page) → gate → back into the app. */
async function signOutAndGate(): Promise<void> {
  await signOut();
  await requireSignIn();
  await loadApp();
}

onSessionExpired(() => {
  void (async () => {
    showWindow();
    await requireSignIn();
    await loadApp();
  })();
});

app.on("before-quit", () => {
  setQuitting();
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
    shellAction: handleShellAction,
  });
  buildMenu();
  buildTray({ signOut: () => void signOutAndGate() });
  createWindow();
  void start();
});

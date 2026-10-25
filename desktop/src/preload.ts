import { contextBridge, ipcRenderer } from "electron";

/**
 * window.capscreenDesktop — keep in sync with frontend/src/lib/desktop.ts.
 * Sandboxed preload: everything goes through validated IPC in ipc.ts.
 */
const boot = ipcRenderer.sendSync("capscreen:bootstrap") as {
  apiBase: string;
  platform: NodeJS.Platform;
  appVersion: string;
  dataDir: string;
  user: { email: string; displayName: string | null; organisation: string | null } | null;
  offline: boolean;
};

contextBridge.exposeInMainWorld("capscreenDesktop", {
  ...boot,
  openExternal: (url: string) => ipcRenderer.invoke("capscreen:open-external", url),
  revealInFolder: (p: string) => ipcRenderer.invoke("capscreen:reveal", p),
  saveFile: (opts: unknown) => ipcRenderer.invoke("capscreen:save-file", opts),
  pickFolder: (opts?: unknown) => ipcRenderer.invoke("capscreen:pick-folder", opts),
  pickFile: (opts?: unknown) => ipcRenderer.invoke("capscreen:pick-file", opts),
  notify: (opts: unknown) => ipcRenderer.invoke("capscreen:notify", opts),
  printToPdf: (opts: unknown) => ipcRenderer.invoke("capscreen:print-pdf", opts),
  signOut: () => ipcRenderer.invoke("capscreen:sign-out"),
  openAccount: () => ipcRenderer.invoke("capscreen:open-account"),
  // Buttons on the shell's own pages (sign-in gate, boot error); ignored from the app UI.
  shellAction: (action: string) => ipcRenderer.send("capscreen:shell-action", action),
  onNavigate: (cb: (route: string) => void) => {
    const listener = (_e: unknown, route: string) => cb(route);
    ipcRenderer.on("capscreen:navigate", listener);
    return () => ipcRenderer.removeListener("capscreen:navigate", listener);
  },
});

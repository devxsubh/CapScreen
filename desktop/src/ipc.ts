import fs from "fs/promises";
import { app, BrowserWindow, dialog, ipcMain, Notification, shell, type IpcMainInvokeEvent } from "electron";
import { userData } from "./paths";

type FileFilter = { name: string; extensions: string[] };

function win(e: IpcMainInvokeEvent): BrowserWindow | undefined {
  return BrowserWindow.fromWebContents(e.sender) ?? undefined;
}

function filters(v: unknown): FileFilter[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v
    .filter((f): f is FileFilter => !!f && typeof f.name === "string" && Array.isArray(f.extensions))
    .map((f) => ({ name: f.name.slice(0, 60), extensions: f.extensions.map(String).slice(0, 10) }));
}

type SessionInfo = { user: { email: string; displayName: string | null; organisation: string | null }; offline: boolean } | null;

export function registerIpc(opts: {
  apiBase: () => string;
  navigate: (route: string) => void;
  session: () => SessionInfo;
  signOut: () => Promise<void>;
  accountUrl: () => string;
}): void {
  const navigate = opts.navigate;
  ipcMain.on("capscreen:bootstrap", (e) => {
    const s = opts.session();
    e.returnValue = {
      apiBase: opts.apiBase(),
      platform: process.platform,
      appVersion: app.getVersion(),
      dataDir: userData(),
      user: s ? { email: s.user.email, displayName: s.user.displayName, organisation: s.user.organisation } : null,
      offline: s?.offline ?? false,
    };
  });

  // Fire-and-forget: the window navigates to the sign-in gate.
  ipcMain.handle("capscreen:sign-out", () => {
    void opts.signOut();
  });

  ipcMain.handle("capscreen:open-account", async () => {
    const url = opts.accountUrl();
    if (url) await shell.openExternal(url);
  });

  ipcMain.handle("capscreen:open-external", async (_e, url: unknown) => {
    const u = new URL(String(url));
    if (!["https:", "http:", "mailto:"].includes(u.protocol)) throw new Error("Blocked URL scheme");
    await shell.openExternal(u.toString());
  });

  ipcMain.handle("capscreen:reveal", (_e, p: unknown) => {
    shell.showItemInFolder(String(p));
  });

  ipcMain.handle("capscreen:save-file", async (e, opts: { defaultName?: unknown; data?: unknown; filters?: unknown }) => {
    const res = await dialog.showSaveDialog(win(e)!, {
      defaultPath: String(opts?.defaultName ?? "export"),
      filters: filters(opts?.filters),
    });
    if (res.canceled || !res.filePath) return null;
    const raw = opts.data;
    const data =
      raw instanceof ArrayBuffer
        ? Buffer.from(raw)
        : ArrayBuffer.isView(raw)
          ? Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength)
          : Buffer.from(String(raw ?? ""), "utf8");
    await fs.writeFile(res.filePath, data);
    return res.filePath;
  });

  ipcMain.handle("capscreen:pick-folder", async (e, opts: { title?: unknown } | undefined) => {
    const res = await dialog.showOpenDialog(win(e)!, {
      title: opts?.title ? String(opts.title) : undefined,
      properties: ["openDirectory", "createDirectory"],
    });
    return res.canceled ? null : (res.filePaths[0] ?? null);
  });

  ipcMain.handle("capscreen:pick-file", async (e, opts: { title?: unknown; filters?: unknown } | undefined) => {
    const res = await dialog.showOpenDialog(win(e)!, {
      title: opts?.title ? String(opts.title) : undefined,
      properties: ["openFile"],
      filters: filters(opts?.filters),
    });
    return res.canceled ? null : (res.filePaths[0] ?? null);
  });

  ipcMain.handle("capscreen:notify", (_e, opts: { title?: unknown; body?: unknown; route?: unknown }) => {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title: String(opts?.title ?? "CapScreen").slice(0, 120), body: String(opts?.body ?? "").slice(0, 400) });
    const route = typeof opts?.route === "string" && opts.route.startsWith("/") ? opts.route : null;
    if (route) n.on("click", () => navigate(route));
    n.show();
  });

  /** Render HTML off-screen and save it as a PDF (IC memos, screening reports). */
  ipcMain.handle("capscreen:print-pdf", async (e, opts: { html?: unknown; defaultName?: unknown }) => {
    const res = await dialog.showSaveDialog(win(e)!, {
      defaultPath: String(opts?.defaultName ?? "report.pdf"),
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (res.canceled || !res.filePath) return null;
    const off = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
    try {
      await off.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(String(opts?.html ?? ""))}`);
      const pdf = await off.webContents.printToPDF({ printBackground: true, pageSize: "A4" });
      await fs.writeFile(res.filePath, pdf);
      return res.filePath;
    } finally {
      off.destroy();
    }
  });
}

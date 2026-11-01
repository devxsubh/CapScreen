import { Menu, shell, type MenuItemConstructorOptions } from "electron";
import { isDev, userData } from "../paths";
import { navigate, quit } from "./mainWindow";

/** The application menu bar (macOS app menu, File, Edit, View, Window, Help). */
export function buildMenu(): void {
  const isMac = process.platform === "darwin";
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: "CapScreen",
            submenu: [
              { role: "about" },
              { type: "separator" },
              { label: "AI Control Center…", accelerator: "Cmd+,", click: () => navigate("/settings/ai") },
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
              { label: "AI Control Center…", accelerator: "Ctrl+,", click: () => navigate("/settings/ai") },
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

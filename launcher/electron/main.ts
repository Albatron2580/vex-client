import { app, BrowserWindow, ipcMain, dialog, shell, Notification } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { initLogger, log, logsDir, setVerbose } from "./ipc/logger";
import { readJson, writeJson } from "./ipc/jsonStore";
import { lookupSkin } from "./ipc/skins";
import { getVersions } from "./ipc/versions";
import { listSkins, addSkin, removeSkin } from "./ipc/skinLibrary";
import { shortcutStatus, setShortcut } from "./ipc/shortcuts";
import initSqlJs from "sql.js";
import { defaultRoots, findModrinth, findCurseForge, findPrismLike, findVanilla, findInFolder, copyParts, measure, type FoundInstance, type ImportPart } from "./ipc/importers";
import { initAccount, setServiceUrl, accountState, login, cancelLogin, logout, friends } from "./ipc/account";
import { setupState, startSetup, provideModrinth, openHelper, setConnectHandler } from "./ipc/onlineSetup";
import { checkForUpdates, getUpdateState, installAndRestart, startAutoCheck } from "./ipc/updater";
import { defaultMinecraftDir, instancesRoot, safeFileName, isInside } from "./ipc/paths";
import { validateSettings, validateInstance, type LauncherSettings, type Instance } from "./shared/settingsModel";

let win: BrowserWindow | null = null;
let settings: LauncherSettings;

function loadSettings() {
  settings = validateSettings(readJson("settings.json"));
  setVerbose(settings.verboseLogging);
}
function loadInstances(): Instance[] {
  const raw = readJson("instances.json");
  return Array.isArray(raw) ? (raw.map(validateInstance).filter(Boolean) as Instance[]) : [];
}
const saveInstances = (list: Instance[]) => writeJson("instances.json", list);

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 1024, minHeight: 680,
    frame: false, backgroundColor: "#120910", show: false, title: "VEX CLIENT",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.once("ready-to-show", () => win?.show());
  // Links open in the user's browser, never inside the launcher.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith(process.env.VITE_DEV_SERVER_URL ?? "file://")) e.preventDefault(); });
  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

function registerIpc() {
  // Window chrome
  ipcMain.handle("win:minimize", () => win?.minimize());
  ipcMain.handle("win:maximize", () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
  ipcMain.handle("win:close", () => win?.close());

  // App info
  ipcMain.handle("app:info", () => ({
    version: app.getVersion(), platform: process.platform,
    totalMemMb: Math.floor(os.totalmem() / 1024 / 1024),
    defaultMinecraftDir: defaultMinecraftDir(),
    defaultMinecraftDirExists: fs.existsSync(defaultMinecraftDir()),
    downloadsDir: app.getPath("downloads"),
  }));

  // Settings (validated on every write; invalid fields fall back to defaults)
  ipcMain.handle("settings:get", () => settings);
  ipcMain.handle("settings:set", (_e, next: unknown) => {
    settings = validateSettings(next);
    writeJson("settings.json", settings);
    setVerbose(settings.verboseLogging);
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: settings.openAtLogin });
    setServiceUrl(settings.onlineServiceUrl).catch(() => {});
    return settings;
  });

  // Instances (records only in Stage 3 — installing/launching arrives in Stage 4)
  ipcMain.handle("instances:list", () => loadInstances());
  ipcMain.handle("instances:save", (_e, raw: unknown) => {
    const inst = validateInstance(raw);
    if (!inst) throw new Error("That instance is missing a name or a valid version.");
    if (!inst.gameDir) inst.gameDir = path.join(instancesRoot(), inst.id);
    fs.mkdirSync(inst.gameDir, { recursive: true });
    const list = loadInstances().filter((i) => i.id !== inst.id);
    list.push(inst); saveInstances(list);
    log("info", `Saved instance ${inst.name} (${inst.version}, ${inst.loader}) at ${inst.gameDir}`);
    return inst;
  });
  ipcMain.handle("instances:delete", (_e, id: string, deleteFiles: boolean) => {
    const list = loadInstances(); const inst = list.find((i) => i.id === id);
    if (!inst) return false;
    // Only ever remove folders VEX created inside its own instances root.
    if (deleteFiles && isInside(inst.gameDir, instancesRoot())) fs.rmSync(inst.gameDir, { recursive: true, force: true });
    saveInstances(list.filter((i) => i.id !== id));
    log("info", `Deleted instance ${inst.name}${deleteFiles ? " and its files" : ""}`);
    return true;
  });
  ipcMain.handle("instances:newId", () => crypto.randomUUID());
  ipcMain.handle("versions:list", () => getVersions());

  // Skins
  ipcMain.handle("skins:lookup", (_e, name: string) => lookupSkin(String(name ?? "")));
  ipcMain.handle("skins:library", () => listSkins());
  ipcMain.handle("skins:add", (_e, name: string, model: string, bytes: Uint8Array) => addSkin(name, model, bytes));
  ipcMain.handle("skins:remove", (_e, id: string) => removeSkin(String(id)));

  // Files
  ipcMain.handle("files:saveAs", async (_e, suggestedName: string, ext: "png" | "zip" | "json", bytes: Uint8Array) => {
    if (!["png", "zip", "json"].includes(ext)) throw new Error("Unsupported file type.");
    const defaultDir = settings.downloadDir || app.getPath("downloads");
    const r = await dialog.showSaveDialog(win!, {
      defaultPath: path.join(defaultDir, safeFileName(suggestedName, "." + ext)),
      filters: [{ png: { name: "PNG image", extensions: ["png"] }, zip: { name: "Resource pack", extensions: ["zip"] }, json: { name: "VEX theme", extensions: ["json"] } }[ext] ?? { name: "File", extensions: ["*"] }],
    });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    fs.writeFileSync(r.filePath, Buffer.from(bytes));
    log("info", `Saved ${r.filePath}`);
    return { ok: true, path: r.filePath };
  });
  ipcMain.handle("files:installPack", (_e, target: string, fileName: string, bytes: Uint8Array) => {
    const gameDir = target === "default" ? (settings.minecraftDir || defaultMinecraftDir()) : loadInstances().find((i) => i.id === target)?.gameDir;
    if (!gameDir) throw new Error("That instance no longer exists.");
    if (!fs.existsSync(gameDir)) throw new Error(`The game folder ${gameDir} doesn't exist. Run Minecraft once, or pick another instance.`);
    const dir = path.join(gameDir, "resourcepacks");
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, safeFileName(fileName, ".zip"));
    fs.writeFileSync(dest, Buffer.from(bytes));
    const size = fs.statSync(dest).size;
    if (size !== bytes.byteLength) throw new Error("The pack was not written completely. Check free disk space.");
    log("info", `Installed resource pack ${dest} (${size} bytes)`);
    return { ok: true, path: dest };
  });
  ipcMain.handle("files:pickDir", async (_e, title: string) => {
    const r = await dialog.showOpenDialog(win!, { title, properties: ["openDirectory", "createDirectory"] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle("files:open", async (_e, what: "logs" | "userData" | "path", p?: string) => {
    const target = what === "logs" ? logsDir() : what === "userData" ? app.getPath("userData") : p;
    if (!target || !fs.existsSync(target)) return "That folder doesn't exist yet.";
    return shell.openPath(target);
  });

  // Desktop / Start menu shortcuts
  ipcMain.handle("shortcuts:status", () => shortcutStatus());
  ipcMain.handle("shortcuts:set", (_e, kind: "desktop" | "startMenu", enabled: boolean) => {
    if (kind !== "desktop" && kind !== "startMenu") throw new Error("Unknown shortcut.");
    return setShortcut(kind, !!enabled);
  });

  // Import from other launchers (read-only on the source)
  const sqlLoader = () => initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") }) as any;
  ipcMain.handle("import:scan", async () => {
    const r = defaultRoots();
    const mc = settings.minecraftDir || defaultMinecraftDir();
    const results = await Promise.allSettled([
      findModrinth(r.modrinth, sqlLoader), Promise.resolve(findCurseForge(r.curseforge)), Promise.resolve(findPrismLike(r.prism, "prism")),
      Promise.resolve(r.multimc.flatMap((d) => findPrismLike(d, "multimc"))), Promise.resolve(findVanilla(mc)),
    ]);
    const found = results.flatMap((x) => (x.status === "fulfilled" ? x.value : []));
    log("info", `Import scan found ${found.length} instance(s)`);
    return found;
  });
  ipcMain.handle("import:pickFolder", async () => {
    const r = await dialog.showOpenDialog(win!, { title: "Choose an instance or launcher folder", properties: ["openDirectory"] });
    return r.canceled ? null : findInFolder(r.filePaths[0]);
  });
  ipcMain.handle("import:measure", (_e, inst: FoundInstance, parts: ImportPart[]) => measure(inst, parts));
  ipcMain.handle("import:run", async (e, inst: FoundInstance, parts: ImportPart[], name: string, version: string) => {
    if (!fs.existsSync(inst.gameDir)) throw new Error("That instance folder no longer exists.");
    const id = crypto.randomUUID();
    const dest = path.join(instancesRoot(), id);
    log("info", `Importing ${inst.sourceLabel} “${inst.name}” (${parts.join(", ")}) into ${dest}`);
    try {
      const res = await copyParts(inst, parts, dest, (done, total, item) => e.sender.send("import:progress", { pct: Math.floor((done / total) * 100), item }));
      const saved = validateInstance({ id, name, version, loader: inst.loader, gameDir: dest, memoryMb: 4096, jvmArgs: "", createdAt: Date.now(), lastPlayed: null, installed: false });
      if (!saved) throw new Error("The imported instance needs a name and version.");
      const list = loadInstances(); list.push(saved); saveInstances(list);
      log("info", `Import done: ${res.copied.join(", ")} (${res.bytes} bytes)`);
      return saved;
    } catch (err) {
      fs.rmSync(dest, { recursive: true, force: true }); // undo a half-finished import; the source is never touched
      throw err;
    }
  });

  // Account (Modrinth sign-in) + friends
  ipcMain.handle("account:get", () => accountState());
  ipcMain.handle("account:login", () => login());
  ipcMain.handle("account:cancel", () => cancelLogin());
  ipcMain.handle("account:logout", () => logout());
  ipcMain.handle("friends:list", () => friends.list());
  ipcMain.handle("friends:search", (_e, q: string) => friends.search(String(q ?? "")));
  ipcMain.handle("friends:add", (_e, id: string) => friends.add(String(id)));
  ipcMain.handle("friends:remove", (_e, id: string) => friends.remove(String(id)));

  // In-app setup of the VEX online service
  setConnectHandler(async (url) => {
    settings = validateSettings({ ...settings, onlineServiceUrl: url });
    writeJson("settings.json", settings);
    await setServiceUrl(url);
    BrowserWindow.getAllWindows().forEach((w) => w.webContents.send("settings:changed", settings));
  });
  ipcMain.handle("online-setup:state", () => setupState());
  ipcMain.handle("online-setup:start", () => startSetup());
  ipcMain.handle("online-setup:modrinth", (_e, clientId: string, secret: string) => provideModrinth(clientId, secret));
  ipcMain.handle("online-setup:open", (_e, which: "modrinth" | "cloudflare") => openHelper(which === "cloudflare" ? "cloudflare" : "modrinth"));

  // Updates
  ipcMain.handle("updater:state", () => getUpdateState());
  ipcMain.handle("updater:check", () => checkForUpdates(true));
  ipcMain.handle("updater:install", () => installAndRestart());

  // Notifications + renderer logging
  ipcMain.handle("notify", (_e, title: string, body: string) => {
    if (settings.notifications && Notification.isSupported()) new Notification({ title, body }).show();
  });
  ipcMain.handle("log", (_e, level: "info" | "warn" | "error", msg: string) => log(level, `[ui] ${String(msg).slice(0, 2000)}`));
}

app.whenReady().then(() => {
  if (process.platform === "win32") app.setAppUserModelId("net.vexclient.launcher");
  initLogger();
  loadSettings();
  registerIpc();
  initAccount(settings.onlineServiceUrl).catch(() => {});
  createWindow();
  startAutoCheck();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
process.on("uncaughtException", (e) => log("error", `Uncaught: ${e.stack ?? e.message}`));

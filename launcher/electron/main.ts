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
import { initAccount, setServiceUrl, accountState, login, cancelLogin, logout, friends, setMinecraftTokenSource, linkMinecraft, publicHome, serviceVersion, online, adminApi } from "./ipc/account";
import { listMods, setModEnabled, removeMod, addMods, modInfo, installedLoaderVersions } from "./ipc/mods";
import { buildRecipe, installRecipeMods, serverStatus, type Recipe } from "./ipc/collab";
import { connectGithub, disconnectGithub, publishStatus, publishUpdate } from "./ipc/publish";
import { setupState, startSetup, provideModrinth, openHelper, setConnectHandler, setupProgress } from "./ipc/onlineSetup";
import { logSessions, onGameStarting, activeMinecraftToken, initGame, accountsStatus, addMicrosoftAccount, setActiveAccount, signOutAccount, accountSkin, accountCapes, setAccountCape, gameSettings, setGameSettings, gameState, launchInstance, stopGame, gameLogPath } from "./ipc/game";
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
  win.on("closed", () => { win = null; if (logsWin && !logsWin.isDestroyed()) logsWin.close(); });
  // Links open in the user's browser, never inside the launcher.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith(process.env.VITE_DEV_SERVER_URL ?? "file://")) e.preventDefault(); });
  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

// The "Minecraft Logs" window: opens when a game starts. Closing it only hides the log — the game keeps running.
let logsWin: BrowserWindow | null = null;
function openLogsWindow() {
  if (logsWin && !logsWin.isDestroyed()) { if (logsWin.isMinimized()) logsWin.restore(); logsWin.showInactive(); return; }
  logsWin = new BrowserWindow({
    width: 1200, height: 800, minWidth: 720, minHeight: 420, frame: false, backgroundColor: "#0c0f14", show: false, title: "Minecraft Logs",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  logsWin.once("ready-to-show", () => logsWin?.showInactive());
  logsWin.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  logsWin.webContents.on("will-navigate", (e) => e.preventDefault());
  logsWin.on("closed", () => { logsWin = null; });
  if (process.env.VITE_DEV_SERVER_URL) logsWin.loadURL(process.env.VITE_DEV_SERVER_URL + "#logs");
  else logsWin.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash: "logs" });
}

function registerIpc() {
  // Window chrome
  const senderWin = (e: Electron.IpcMainInvokeEvent) => BrowserWindow.fromWebContents(e.sender);
  ipcMain.handle("win:minimize", (e) => senderWin(e)?.minimize());
  ipcMain.handle("win:maximize", (e) => { const w = senderWin(e); if (w?.isMaximized()) w.unmaximize(); else w?.maximize(); });
  ipcMain.handle("win:close", (e) => senderWin(e)?.close());

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

  // Instances (game files download on first Play — see ipc/game.ts)
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
  ipcMain.handle("online-setup:progress", () => setupProgress());
  ipcMain.handle("online-setup:start", () => startSetup());
  ipcMain.handle("online-setup:modrinth", (_e, clientId: string, secret: string) => provideModrinth(clientId, secret));
  ipcMain.handle("online-setup:open", (_e, which: "modrinth" | "cloudflare") => openHelper(which === "cloudflare" ? "cloudflare" : "modrinth"));

  // Microsoft accounts + launching Minecraft
  initGame({
    instances: () => loadInstances(),
    updateInstance: (id, patch) => {
      const list = loadInstances().map((i) => (i.id === id ? { ...i, ...patch } : i));
      saveInstances(list);
      BrowserWindow.getAllWindows().forEach((w) => w.webContents.send("instances:changed"));
    },
    afterLaunch: () => settings.afterLaunch,
    onLaunched: (id) => {
      settings = validateSettings({ ...settings, recentInstanceIds: [id, ...settings.recentInstanceIds.filter((x) => x !== id)].slice(0, 8) });
      writeJson("settings.json", settings);
      BrowserWindow.getAllWindows().forEach((w) => w.webContents.send("settings:changed", settings));
    },
  });
  ipcMain.handle("ms:status", () => accountsStatus());
  setMinecraftTokenSource(activeMinecraftToken);
  ipcMain.handle("ms:add", async () => { const r = await addMicrosoftAccount(); linkMinecraft().catch(() => {}); return r; });
  ipcMain.handle("ms:setActive", (_e, uuid: string) => { const r = setActiveAccount(uuid); linkMinecraft().catch(() => {}); return r; });
  ipcMain.handle("ms:signOut", (_e, uuid: string) => signOutAccount(uuid));
  ipcMain.handle("ms:skin", (_e, uuid: string) => accountSkin(uuid));
  ipcMain.handle("ms:capes", (_e, uuid: string) => accountCapes(uuid));
  ipcMain.handle("ms:setCape", (_e, uuid: string, id: string | null) => setAccountCape(uuid, id));
  ipcMain.handle("game:settings", () => gameSettings());
  ipcMain.handle("game:setSettings", (_e, patch: unknown) => setGameSettings((patch ?? {}) as any));
  ipcMain.handle("game:state", () => gameState());
  ipcMain.handle("game:launch", (_e, id: string, join?: { host: string; port: number }) => launchInstance(String(id), join));
  ipcMain.handle("game:stop", () => stopGame());
  ipcMain.handle("game:openLog", () => shell.openPath(gameLogPath()));
  ipcMain.handle("logs:sessions", () => logSessions());
  ipcMain.handle("logs:open", () => openLogsWindow());
  onGameStarting(() => openLogsWindow());

  // Mods inside an instance
  const instDir = (id: string) => { const i = loadInstances().find((x) => x.id === id); if (!i) throw new Error("That instance no longer exists."); return i.gameDir; };
  ipcMain.handle("mods:list", (_e, id: string) => listMods(instDir(String(id))));
  ipcMain.handle("mods:info", (_e, hashes: string[]) => modInfo(Array.isArray(hashes) ? hashes.slice(0, 1000).map(String) : []));
  ipcMain.handle("mods:toggle", (_e, id: string, file: string, enabled: boolean) => setModEnabled(instDir(String(id)), String(file), !!enabled));
  ipcMain.handle("mods:remove", (_e, id: string, file: string) => removeMod(instDir(String(id)), String(file)));
  ipcMain.handle("mods:add", async (_e, id: string) => {
    const dir = instDir(String(id));
    const r = await dialog.showOpenDialog(win!, { title: "Add mods (.jar)", properties: ["openFile", "multiSelections"], filters: [{ name: "Minecraft mods", extensions: ["jar"] }] });
    return r.canceled ? null : addMods(dir, r.filePaths);
  });
  ipcMain.handle("instances:loaderVersions", () => installedLoaderVersions(path.join(app.getPath("userData"), "game", "minecraft")));

  // VEX online: news, bug reports, Collab, admin
  ipcMain.handle("online:home", () => publicHome());
  ipcMain.handle("online:serviceVersion", () => serviceVersion());
  ipcMain.handle("online:bundledServerVersion", () => {
    try { return JSON.parse(fs.readFileSync(path.join(app.isPackaged ? path.join(process.resourcesPath, "online-server") : path.join(__dirname, "..", "..", "server"), "package.json"), "utf8")).version; } catch { return null; }
  });
  ipcMain.handle("online:link", () => linkMinecraft());
  ipcMain.handle("online:reportBug", (_e, title: string, body: string) => online.reportBug(String(title ?? ""), String(body ?? ""), app.getVersion()));
  ipcMain.handle("online:serverStatus", (_e, address: string) => serverStatus(String(address ?? "")));
  ipcMain.handle("collab:shares", () => online.shares());
  ipcMain.handle("collab:dismiss", (_e, id: number) => online.dismissShare(id));
  ipcMain.handle("collab:share", async (_e, instanceId: string, friendId: string) => {
    const inst = loadInstances().find((i) => i.id === instanceId);
    if (!inst) throw new Error("That instance no longer exists.");
    const recipe = await buildRecipe(inst);
    await online.share(friendId, recipe);
    return { mods: recipe.mods.length, missing: recipe.missing };
  });
  ipcMain.handle("collab:install", async (e, recipe: Recipe) => {
    const id = crypto.randomUUID();
    const inst = validateInstance({ id, name: `${String(recipe?.name ?? "Shared").slice(0, 30)} (shared)`, version: recipe?.version, loader: recipe?.loader, gameDir: path.join(instancesRoot(), id),
      memoryMb: recipe?.memoryMb ?? 4096, jvmArgs: "", createdAt: Date.now(), lastPlayed: null, installed: false });
    if (!inst) throw new Error("That shared instance is broken.");
    fs.mkdirSync(inst.gameDir, { recursive: true });
    try {
      const r = await installRecipeMods(recipe, inst.gameDir, (done, total, title) => e.sender.send("collab:progress", { done, total, title }));
      const list = loadInstances(); list.push(inst); saveInstances(list);
      BrowserWindow.getAllWindows().forEach((w) => w.webContents.send("instances:changed"));
      return { instance: inst, ...r };
    } catch (err) { fs.rmSync(inst.gameDir, { recursive: true, force: true }); throw err; }
  });
  ipcMain.handle("admin:overview", () => adminApi.overview());
  ipcMain.handle("admin:users", (_e, q: string, filter: string) => adminApi.users(q, filter));
  ipcMain.handle("admin:ban", (_e, id: string, banned: boolean) => adminApi.ban(id, banned));
  ipcMain.handle("admin:announce", (_e, t: string, b: string, k: string) => adminApi.announce(String(t ?? ""), String(b ?? ""), String(k ?? "news")));
  ipcMain.handle("admin:unannounce", (_e, id: number) => adminApi.unannounce(id));
  ipcMain.handle("admin:setFeatured", (_e, f: unknown) => adminApi.setFeatured(f));
  ipcMain.handle("admin:clearFeatured", () => adminApi.clearFeatured());
  ipcMain.handle("admin:bugs", (_e, status: string) => adminApi.bugs(String(status ?? "open")));
  ipcMain.handle("admin:setBug", (_e, id: number, status: string) => adminApi.setBug(id, String(status)));
  ipcMain.handle("admin:githubStatus", () => publishStatus());
  ipcMain.handle("admin:githubConnect", (_e, token: string) => connectGithub(token));
  ipcMain.handle("admin:githubDisconnect", () => disconnectGithub());
  ipcMain.handle("admin:publish", (_e, bump: string, notes: string) => publishUpdate(String(bump), String(notes ?? "")));

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

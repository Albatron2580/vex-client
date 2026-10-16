const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, clipboard, Menu } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { pathToFileURL } = require('url');

const store = require('./lib/store');
const net = require('./lib/net');
const javaLib = require('./lib/java');
const versions = require('./lib/versions');
const auth = require('./lib/auth');
const launch = require('./lib/launch');
const modrinth = require('./lib/modrinth');
const packs = require('./lib/packs');
const media = require('./lib/media');
const diag = require('./lib/diag');
const livemods = require('./lib/livemods');
const appstate = require('./lib/appstate');
const updaterLib = require('./lib/updater');
const adminLib = require('./lib/admin');
const mcServer = require('./lib/server');
const vexAssets = require('./lib/vexassets');

const PKG = require('./package.json');
const VERSION = PKG.version;
const baseDir = path.join(app.getPath('appData'), '.vex');
// Same Electron profile folder for the source build and the installed build, so the key that
// encrypts saved Microsoft sign-ins (stored there by Windows DPAPI) survives the switch and every update.
app.setPath('userData', path.join(app.getPath('appData'), 'vex-client'));

if (!app.requestSingleInstanceLock()) app.quit();
app.setAppUserModelId('com.vex.client');

let win = null;
let updater = null;
let admin = null;
let startInfo = null;
const lastSent = new Map();

// Everything the UI needs to know about progress and the game goes through here.
function emit(evt) {
  // Game events also drive the "mods while running" bookkeeping.
  if (evt.type === 'log') for (const l of evt.lines) livemods.onGameLine(l);
  if (evt.type === 'game' && (evt.state === 'closed' || evt.state === 'idle')) {
    livemods.endSession();
    const p = store.listProfiles().find((x) => x.id === evt.profileId);
    if (p) {
      // The game has let go of its files: apply what was queued while it ran.
      setTimeout(() => {
        try {
          const r = livemods.apply(p);
          if (r.applied.length || r.failed.length) emit({ type: 'mods', profileId: p.id, applied: r.applied.map((o) => o.title), failed: r.failed.map((o) => `${o.title}: ${o.error}`) });
        } catch (e) { emit({ type: 'mods', profileId: p.id, applied: [], failed: [e.message] }); }
      }, 1500); // Windows can hold jar locks for a moment after the process exits
    }
  }
  if (!win || win.isDestroyed()) return;
  if (evt.type === 'task' && !evt.done) {
    const now = Date.now();
    if (now - (lastSent.get(evt.id) || 0) < 100) return;
    lastSent.set(evt.id, now);
  }
  win.webContents.send('vex:event', evt);
}
const onTask = (t) => emit({ type: 'task', ...t });
const ctx = { onTask };

function h(channel, fn) {
  ipcMain.handle(channel, async (e, ...args) => {
    try {
      if (!win || e.sender !== win.webContents) throw new Error('Request refused.');
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      return { ok: false, error: (err && err.message) || String(err) };
    }
  });
}

const prof = () => {
  const p = store.selectedProfile();
  if (!p) throw new Error('Create a profile first.');
  return p;
};

function countMods(p) {
  try { return fs.readdirSync(path.join(store.profileDir(p.id), 'mods')).filter((f) => /\.jar$/i.test(f)).length; } catch { return 0; }
}

async function pick(options) {
  const r = await dialog.showOpenDialog(win, options);
  return r.canceled ? [] : r.filePaths;
}

const ALLOWED_LINKS = ['discord.gg', 'discord.com', 'modrinth.com', 'www.minecraft.net', 'minecraft.net', 'adoptium.net', 'account.microsoft.com', 'github.com'];
function openExternal(url) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !ALLOWED_LINKS.includes(u.hostname)) throw new Error('That link is not allowed.');
  return shell.openExternal(u.href);
}

// ---------- news (cached so it still shows offline) ----------
let newsCache = null;
async function news() {
  if (newsCache && Date.now() - newsCache.at < 30 * 60 * 1000) return newsCache.items;
  const base = net.endpoints.mojangNews;
  const abs = (u) => (!u ? '' : /^https?:/.test(u) ? u : base + (u.startsWith('/') ? '' : '/') + u);
  const file = path.join(store.getBaseDir(), 'cache', 'news.json');
  for (const p of ['/v2/news.json', '/v2/javaPatchNotes.json']) {
    try {
      const j = await net.getJson(base + p, { timeout: 12000 });
      const items = (j.entries || []).slice(0, 6).map((e) => ({
        title: e.title || '',
        text: e.text || e.shortText || '',
        date: e.date || '',
        image: abs((e.playPageImage && e.playPageImage.url) || (e.newsPageImage && e.newsPageImage.url) || (e.image && e.image.url)),
        link: e.readMoreLink || '',
      })).filter((x) => x.title);
      if (items.length) {
        newsCache = { at: Date.now(), items };
        store.writeJson(file, items);
        return items;
      }
    } catch { /* try the next source */ }
  }
  return store.readJson(file, []);
}

// ---------- handlers ----------
h('app:info', () => ({
  version: VERSION,
  electron: process.versions.electron,
  node: process.versions.node,
  platform: `${os.type()} ${os.release()} ${os.arch()}`,
  baseDir: store.getBaseDir(),
  gameRoot: store.gameRoot(),
  totalMemGb: Math.floor(os.totalmem() / 1024 ** 3),
  admins: PKG.vexAdmins || [],
}));

h('settings:get', () => store.settings());

// Background images shipped in renderer/themes/<theme id>/background.(jpg|jpeg|png|webp|avif).
// Returned as paths relative to index.html so they work from the folder and from the packaged app.
h('themes:assets', () => {
  const dir = path.join(__dirname, 'renderer', 'themes');
  const out = {};
  let ids = [];
  try { ids = fs.readdirSync(dir); } catch { return out; }
  for (const id of ids) {
    if (!/^[a-z0-9-]+$/.test(id)) continue;
    let files = [];
    try { files = fs.readdirSync(path.join(dir, id)); } catch { continue; }
    const f = files.find((n) => /^background\.(jpe?g|png|webp|avif)$/i.test(n));
    if (f) out[id] = `themes/${id}/${f}`;
  }
  return out;
});
h('settings:save', (patch) => store.saveSettings(patch));

h('versions:list', () => versions.listVersions());
h('loaders:choices', (loader, mc) => versions.loaderChoices(loader, mc));

h('profiles:list', () => ({
  profiles: store.listProfiles().map((p) => ({ ...p, modCount: countMods(p) })),
  selected: (store.selectedProfile() || {}).id || '',
}));
h('profiles:create', async (data) => {
  try {
    const { versions: list } = await versions.listVersions();
    if (!list.some((v) => v.id === data.version)) throw new Error(`Minecraft ${data.version} is not in Mojang's version list.`);
  } catch (e) { if (!e.offline) throw e; }
  return store.createProfile(data);
});
h('profiles:update', (id, patch) => store.updateProfile(id, patch));
h('profiles:duplicate', (id) => store.duplicateProfile(id));
h('profiles:delete', (id) => store.deleteProfile(id));
h('profiles:select', (id) => { store.getProfile(id); return store.saveSettings({ selectedProfile: id }); });

h('java:detect', (force) => javaLib.detect(!!force));
h('java:browse', async () => {
  const [f] = await pick({ title: 'Choose a Java program', properties: ['openFile'], filters: process.platform === 'win32' ? [{ name: 'java.exe', extensions: ['exe'] }] : undefined });
  if (!f) return null;
  const p = await javaLib.probe(f);
  if (!p) throw new Error("That file isn't a working Java program.");
  return p;
});

// accounts
h('accounts:status', () => auth.status());
h('accounts:login', () => auth.login());
h('accounts:switch', (uuid) => { auth.setActive(uuid); return auth.status(); });
h('accounts:signout', (uuid) => { auth.signOut(uuid); return auth.status(); });
h('accounts:skin', (uuid) => auth.skin(uuid));
h('cape:mojang', (uuid) => auth.capes(uuid));
h('cape:mojangSet', (uuid, id) => auth.setCape(uuid, id || null));

// local capes
h('cape:list', () => media.listCapes());
h('cape:import', async () => {
  const files = await pick({ title: 'Choose cape images', properties: ['openFile', 'multiSelections'], filters: [{ name: 'PNG image', extensions: ['png'] }] });
  return files.length ? media.importCapes(files) : [];
});
h('cape:remove', (name) => media.removeCape(name));
h('cape:select', (name) => media.selectCape(name));

// game
// ---------- the Vex server (package.json -> vexServer) ----------
const SERVER = PKG.vexServer || null;
let serverCache = null;
h('server:info', () => SERVER);
h('server:status', async (force) => {
  if (!SERVER) return null;
  if (!force && serverCache && Date.now() - serverCache.at < 20000) return serverCache.data;
  let data;
  try { data = await mcServer.ping(SERVER.host, SERVER.port || 25565); } catch (e) { data = { online: false, error: e.message }; }
  serverCache = { at: Date.now(), data };
  return data;
});

h('game:state', () => launch.state());
h('game:launch', async (opts = {}) => {
  const profile = prof();
  const s = store.settings();
  if (!s.activeAccount) throw new Error('Sign in with a Microsoft account that owns Minecraft: Java Edition first (Account page).');
  emit({ type: 'status', text: 'Signing in…' });
  const session = await auth.session(s.activeAccount);
  // Anything queued during the last session that could not be applied yet goes in now.
  const queued = livemods.apply(profile);
  if (queued.failed.length) throw new Error(`Some queued mod changes could not be applied: ${queued.failed.map((o) => `${o.title} (${o.error})`).join('; ')}`);
  await launch.launch({
    profile,
    session,
    emit,
    join: opts && opts.join && SERVER ? { host: SERVER.host, port: SERVER.port || 25565 } : null,
    beforeLaunch: async (status) => {
      try { await vexAssets.prepare(profile, { log: (l) => status(l), ctx }); } catch { /* never block a launch on the extras */ }
      if (s.modUpdates !== 'auto' || profile.loader === 'vanilla') return;
      status('Updating mods…');
      try { await modrinth.updateAll(profile, ctx); } catch { /* offline: launch with what is installed */ }
    },
    onStart: () => livemods.startSession(profile),
  });
});
h('game:stop', () => launch.stop());

// mods
h('mods:categories', (type) => modrinth.categories(type || 'mod'));
h('mods:search', (params) => modrinth.search(params));
// While this profile's game runs, mod changes are staged and queued (see lib/livemods.js).
const stageFor = (p) => (livemods.isLive(p) ? { dir: livemods.stageDir(p), add: (name, meta, replaces) => livemods.queueAdd(p, name, meta, replaces) } : null);
h('mods:install', (project) => { const p = prof(); return modrinth.installMod(p, project, ctx, { stage: stageFor(p), pending: livemods.pending(p) }); });
h('mods:installed', () => modrinth.installedMods(prof()));
h('mods:status', () => livemods.status(prof()));
h('mods:remove', (file) => {
  const p = prof();
  if (livemods.isLive(p)) { livemods.queueRemove(p, file); return { queued: true }; }
  modrinth.removeMod(p, file);
  return { queued: false };
});
h('mods:toggle', (file) => {
  const p = prof();
  if (livemods.isLive(p)) { livemods.queueToggle(p, file); return { queued: true }; }
  return { queued: false, file: modrinth.toggleMod(p, file) };
});
h('mods:addLocal', async () => {
  const files = await pick({ title: 'Choose mod files', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Mod (.jar)', extensions: ['jar'] }] });
  if (!files.length) return [];
  const p = prof();
  const stage = stageFor(p);
  if (!stage) return modrinth.addLocalMods(p, files);
  const names = modrinth.addLocalMods({ ...p, stageDir: stage.dir }, files);
  names.forEach((n) => livemods.queueAdd(p, n, null));
  return names;
});
h('mods:checkUpdates', () => modrinth.checkUpdates(prof()));
h('mods:update', (u) => { const p = prof(); return modrinth.updateMod(p, u, ctx, { stage: stageFor(p) }); });
h('mods:updateAll', () => { const p = prof(); return modrinth.updateAll(p, ctx, { stage: stageFor(p) }); });
h('mods:apply', () => {
  const p = prof();
  if (livemods.isLive(p)) throw new Error('Minecraft is still running. Queued changes are applied automatically when it closes.');
  const r = livemods.apply(p);
  return { applied: r.applied.map((o) => o.title), failed: r.failed.map((o) => `${o.title}: ${o.error}`) };
});
h('mods:cancel', (id) => livemods.cancel(prof(), String(id)));
h('mods:liveSupport', () => livemods.liveSupport(prof()));
h('mods:page', (type, slug) => openExternal(`${net.endpoints.modrinthSite}/${encodeURIComponent(type)}/${encodeURIComponent(slug)}`));

// modpacks
h('modpacks:versions', (project) => modrinth.modpackVersions(project));
h('modpacks:install', (versionId) => modrinth.installModpackVersion(versionId, ctx));
h('modpacks:importFile', async () => {
  const [f] = await pick({ title: 'Choose a modpack', properties: ['openFile'], filters: [{ name: 'Modrinth modpack (.mrpack)', extensions: ['mrpack'] }] });
  return f ? modrinth.installMrpack(f, ctx) : null;
});

// resource packs and shaders
h('packs:list', (kind) => (kind === 'shader' ? packs.listShaderPacks(prof()) : packs.listResourcePacks(prof())));
h('packs:import', async (kind, mode) => {
  const files = await pick({
    title: mode === 'folder' ? 'Choose pack folders' : 'Choose pack files',
    properties: mode === 'folder' ? ['openDirectory', 'multiSelections'] : ['openFile', 'multiSelections'],
    filters: mode === 'folder' ? undefined : [{ name: 'Pack (.zip)', extensions: ['zip'] }],
  });
  return files.map((f) => packs.importPack(prof(), kind, f));
});
h('packs:remove', (kind, name) => packs.removePack(prof(), kind, name));
// Minecraft rewrites options.txt / iris.properties when it closes, so changing them while it runs would be lost.
const packGuard = (p, what) => {
  if (livemods.isLive(p)) throw new Error(`Minecraft is running, so ${what} in the game instead: ${what === 'switch shaders' ? 'Options → Video Settings → Shader Packs' : 'Options → Resource Packs'}. Changes there apply right away, without a restart.`);
  return p;
};
h('packs:enable', (name, on) => packs.setPackEnabled(packGuard(prof(), 'turn packs on or off'), name, !!on));
h('packs:move', (name, dir) => packs.movePack(packGuard(prof(), 'reorder packs'), name, dir));
h('packs:shader', (name) => packs.setShader(packGuard(prof(), 'switch shaders'), name || null));
h('packs:live', () => ({ running: livemods.isLive(prof()), support: livemods.liveSupport(prof()) }));
h('packs:install', (kind, project) => modrinth.installPack(prof(), kind, project, ctx));

// screenshots and logs
h('media:screenshots', () => media.listScreenshots(prof()).map((s) => ({ ...s, url: pathToFileURL(s.path).href })));
h('media:deleteShot', (name) => media.deleteScreenshot(prof(), name));
h('media:logs', () => media.listLogs(prof(), launch.logPath()));
h('media:readLog', (id) => media.readLog(prof(), id, launch.logPath()));

// folders, links, clipboard
h('shell:folder', async (which) => {
  const p = store.selectedProfile();
  const dirs = {
    base: () => store.getBaseDir(),
    root: () => store.gameRoot(),
    profile: () => store.profileDir(p.id),
    mods: () => modrinth.modsDir(p),
    resourcepacks: () => packs.dirFor(p, 'resourcepack'),
    shaderpacks: () => packs.dirFor(p, 'shader'),
    screenshots: () => media.shotsDir(p),
    logs: () => path.join(store.profileDir(p.id), 'logs'),
    capes: () => media.capesDir(),
  };
  if (!dirs[which]) throw new Error('Unknown folder.');
  const d = dirs[which]();
  fs.mkdirSync(d, { recursive: true });
  const err = await shell.openPath(d);
  if (err) throw new Error(err);
});
h('shell:link', (url) => openExternal(url));
h('shell:chooseFolder', async () => {
  const [d] = await pick({ title: 'Choose the Minecraft game folder', properties: ['openDirectory', 'createDirectory'] });
  return d || null;
});
h('app:copy', (text) => clipboard.writeText(String(text).slice(0, 200000)));

h('diag:run', async () => {
  const checks = await diag.run();
  const p = store.selectedProfile();
  const report = diag.report(checks, {
    Launcher: VERSION,
    Electron: process.versions.electron,
    Profile: p ? `${p.name} (${p.loader} ${p.version})` : 'none',
    'Game folder': store.gameRoot(),
  });
  return { checks, report };
});
h('news:list', () => news());

// ---------- launcher updates ----------
h('app:ready', () => { appstate.markHealthy(VERSION); return startInfo; });
h('updater:state', () => ({ ...updater.state(), rollbackTarget: appstate.rollbackTarget(VERSION), startInfo }));
h('updater:check', () => updater.check({ manual: true }));
h('updater:download', () => updater.download());
h('updater:install', () => updater.install());
h('updater:skip', () => updater.skip());
h('updater:rollback', (v) => updater.rollback(String(v || appstate.rollbackTarget(VERSION))));
h('updater:openReleases', () => {
  const c = PKG.vexUpdate || {};
  return openExternal(`https://github.com/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/releases`);
});
// ---------- admin panel (release management; see lib/admin.js for how access works) ----------
h('admin:status', () => admin.status());
h('admin:connect', (token) => admin.connect(token));
h('admin:disconnect', () => admin.disconnect());
h('admin:overview', () => admin.overview());
h('admin:publish', (opts) => admin.publish(opts || {}));
h('admin:build', (id) => admin.build(id));
h('admin:rollout', (id, action) => admin.rollout(id, action));
h('admin:open', async (url) => {
  const u = new URL(String(url));
  if (u.protocol !== 'https:' || u.hostname !== 'github.com') throw new Error('That link is not allowed.');
  return shell.openExternal(u.href);
});
h('backups:list', () => appstate.listBackups().map((b) => b.name));
h('backups:restore', (name) => { appstate.restore(String(name)); return store.settings(); });

// ---------- window ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 940,
    minHeight: 600,
    title: 'Vex Client',
    backgroundColor: '#050b1a',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.once('ready-to-show', () => win.show());
  win.webContents.on('render-process-gone', (_e, d) => { try { fs.appendFileSync(launch.logPath(), `RENDERER GONE: ${d.reason}\n`); } catch { /* ignore */ } });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (process.env.VEX_DEBUG) win.webContents.openDevTools({ mode: 'detach' });
}

function setupUpdater() {
  updater = updaterLib.create({
    version: VERSION,
    config: PKG.vexUpdate || {},
    packaged: app.isPackaged,
    getSettings: () => store.settings(),
    saveSettings: (p) => store.saveSettings(p),
    gameRunning: () => launch.state().state !== 'idle',
    emit: (evt) => {
      emit(evt);
      if (win && !win.isDestroyed()) {
        const s = evt.state;
        win.setProgressBar(s.status === 'downloading' && s.progress ? s.progress.percent / 100 : -1);
      }
    },
    log: (m) => { try { fs.appendFileSync(path.join(store.getBaseDir(), 'updater.log'), `${new Date().toISOString()} ${m}\n`); } catch { /* ignore */ } },
  });
}

// A new version that keeps failing to start: offer the last version that worked, or a settings backup.
async function offerRecovery() {
  const target = appstate.rollbackTarget(VERSION);
  if (!startInfo || startInfo.failedStarts < 2) return;
  const buttons = target ? [`Reinstall version ${target}`, 'Restore settings backup', 'Try again'] : ['Restore settings backup', 'Try again'];
  const r = await dialog.showMessageBox({
    type: 'warning',
    title: 'Vex Client',
    message: `Vex Client ${VERSION} did not start properly the last ${startInfo.failedStarts} times.`,
    detail: target ? `You can go back to version ${target}, which worked on this PC. Your settings, sign-ins, profiles and worlds are kept.` : 'Restoring the settings backup made before this update often fixes it. Your worlds and mods are not touched.',
    buttons,
    defaultId: 0,
    cancelId: buttons.length - 1,
  });
  const choice = buttons[r.response] || '';
  if (choice.startsWith('Reinstall')) {
    try {
      await updater.rollback(target);
      updater.install({ force: true });
    } catch (e) {
      dialog.showErrorBox('Vex Client', `Could not reinstall ${target}: ${e.message}\n\nYou can download it from the Releases page instead.`);
    }
  } else if (choice.startsWith('Restore')) {
    const [latest] = appstate.listBackups().filter((b) => !/before-restore/.test(b.name));
    if (latest) appstate.restore(latest.name);
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  store.init(baseDir);
  startInfo = appstate.onStart(VERSION); // backs up settings/profiles/sign-ins when the version changed
  livemods.init({ state: () => launch.state() });
  setupUpdater();
  admin = adminLib.create({ auth, safeStorage, config: PKG.vexUpdate || {}, admins: PKG.vexAdmins || [], version: VERSION });
  auth.init({ safeStorage });
  createWindow();
  javaLib.detect().catch(() => {}); // warm the cache so Play is quick
  updater.start();
  offerRecovery().catch(() => {});
});
app.on('before-quit', (e) => {
  // A verified update waiting to be installed goes in now, unless Minecraft is still running.
  if (updater && updater.onQuit()) e.preventDefault();
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());

process.on('uncaughtException', (e) => { try { fs.appendFileSync(launch.logPath(), `UNCAUGHT: ${e.stack || e}\n`); } catch { /* ignore */ } });

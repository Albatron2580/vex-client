import { contextBridge, ipcRenderer } from "electron";

// The only bridge between the UI and the system. Every call is a named, validated IPC handler.
const api = {
  win: {
    minimize: () => ipcRenderer.invoke("win:minimize"),
    maximize: () => ipcRenderer.invoke("win:maximize"),
    close: () => ipcRenderer.invoke("win:close"),
  },
  appInfo: () => ipcRenderer.invoke("app:info"),
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (s: unknown) => ipcRenderer.invoke("settings:set", s),
  },
  instances: {
    list: () => ipcRenderer.invoke("instances:list"),
    save: (i: unknown) => ipcRenderer.invoke("instances:save", i),
    remove: (id: string, deleteFiles: boolean) => ipcRenderer.invoke("instances:delete", id, deleteFiles),
    newId: () => ipcRenderer.invoke("instances:newId"),
  },
  versions: () => ipcRenderer.invoke("versions:list"),
  skins: {
    lookup: (name: string) => ipcRenderer.invoke("skins:lookup", name),
    library: () => ipcRenderer.invoke("skins:library"),
    texture: (url: string) => ipcRenderer.invoke("skins:texture", url),
    add: (name: string, model: string, bytes: Uint8Array) => ipcRenderer.invoke("skins:add", name, model, bytes),
    remove: (id: string) => ipcRenderer.invoke("skins:remove", id),
  },
  files: {
    saveAs: (name: string, ext: "png" | "zip" | "json", bytes: Uint8Array) => ipcRenderer.invoke("files:saveAs", name, ext, bytes),
    installPack: (target: string, fileName: string, bytes: Uint8Array) => ipcRenderer.invoke("files:installPack", target, fileName, bytes),
    pickDir: (title: string) => ipcRenderer.invoke("files:pickDir", title),
    open: (what: "logs" | "userData" | "path", p?: string) => ipcRenderer.invoke("files:open", what, p),
  },
  shortcuts: {
    status: () => ipcRenderer.invoke("shortcuts:status"),
    set: (kind: "desktop" | "startMenu", enabled: boolean) => ipcRenderer.invoke("shortcuts:set", kind, enabled),
  },
  ms: {
    status: () => ipcRenderer.invoke("ms:status"),
    add: () => ipcRenderer.invoke("ms:add"),
    setActive: (uuid: string) => ipcRenderer.invoke("ms:setActive", uuid),
    signOut: (uuid: string) => ipcRenderer.invoke("ms:signOut", uuid),
    skin: (uuid: string) => ipcRenderer.invoke("ms:skin", uuid),
    capes: (uuid: string) => ipcRenderer.invoke("ms:capes", uuid),
    setCape: (uuid: string, id: string | null) => ipcRenderer.invoke("ms:setCape", uuid, id),
  },
  game: {
    settings: () => ipcRenderer.invoke("game:settings"),
    setSettings: (p: unknown) => ipcRenderer.invoke("game:setSettings", p),
    state: () => ipcRenderer.invoke("game:state"),
    launch: (id: string, join?: { host: string; port: number }) => ipcRenderer.invoke("game:launch", id, join),
    stop: () => ipcRenderer.invoke("game:stop"),
    openLog: () => ipcRenderer.invoke("game:openLog"),
    logSessions: () => ipcRenderer.invoke("logs:sessions"),
    openLogsWindow: () => ipcRenderer.invoke("logs:open"),
    onEvent: (cb: (e: unknown) => void) => {
      const h = (_e: unknown, ev: unknown) => cb(ev);
      ipcRenderer.on("game:event", h);
      return () => { ipcRenderer.removeListener("game:event", h); };
    },
  },
  onInstancesChanged: (cb: () => void) => {
    const h = () => cb();
    ipcRenderer.on("instances:changed", h);
    return () => { ipcRenderer.removeListener("instances:changed", h); };
  },
  mods: {
    list: (id: string) => ipcRenderer.invoke("mods:list", id),
    info: (hashes: string[]) => ipcRenderer.invoke("mods:info", hashes),
    toggle: (id: string, file: string, enabled: boolean) => ipcRenderer.invoke("mods:toggle", id, file, enabled),
    remove: (id: string, file: string) => ipcRenderer.invoke("mods:remove", id, file),
    add: (id: string) => ipcRenderer.invoke("mods:add", id),
    copyFrom: (id: string, inst: unknown) => ipcRenderer.invoke("mods:copyFrom", id, inst),
  },
  loaderVersions: () => ipcRenderer.invoke("instances:loaderVersions"),
  online: {
    home: () => ipcRenderer.invoke("online:home"),
    serviceVersion: () => ipcRenderer.invoke("online:serviceVersion"),
    bundledServerVersion: () => ipcRenderer.invoke("online:bundledServerVersion"),
    link: () => ipcRenderer.invoke("online:link"),
    loginCheck: () => ipcRenderer.invoke("online:loginCheck"),
    reportBug: (title: string, body: string) => ipcRenderer.invoke("online:reportBug", title, body),
    serverStatus: (address: string) => ipcRenderer.invoke("online:serverStatus", address),
  },
  collab: {
    shares: () => ipcRenderer.invoke("collab:shares"),
    dismiss: (id: number) => ipcRenderer.invoke("collab:dismiss", id),
    share: (instanceId: string, friendId: string) => ipcRenderer.invoke("collab:share", instanceId, friendId),
    install: (recipe: unknown) => ipcRenderer.invoke("collab:install", recipe),
    onProgress: (cb: (p: unknown) => void) => {
      const h = (_e: unknown, p: unknown) => cb(p);
      ipcRenderer.on("collab:progress", h);
      return () => { ipcRenderer.removeListener("collab:progress", h); };
    },
  },
  admin: {
    overview: () => ipcRenderer.invoke("admin:overview"),
    users: (q: string, filter: string) => ipcRenderer.invoke("admin:users", q, filter),
    ban: (id: string, banned: boolean) => ipcRenderer.invoke("admin:ban", id, banned),
    announce: (t: string, b: string, k: string) => ipcRenderer.invoke("admin:announce", t, b, k),
    unannounce: (id: number) => ipcRenderer.invoke("admin:unannounce", id),
    setFeatured: (f: unknown) => ipcRenderer.invoke("admin:setFeatured", f),
    clearFeatured: () => ipcRenderer.invoke("admin:clearFeatured"),
    bugs: (status: string) => ipcRenderer.invoke("admin:bugs", status),
    setBug: (id: number, status: string) => ipcRenderer.invoke("admin:setBug", id, status),
    githubStatus: () => ipcRenderer.invoke("admin:githubStatus"),
    githubConnect: (token: string) => ipcRenderer.invoke("admin:githubConnect", token),
    githubDisconnect: () => ipcRenderer.invoke("admin:githubDisconnect"),
    publish: (bump: string, notes: string) => ipcRenderer.invoke("admin:publish", bump, notes),
  },
  account: {
    get: () => ipcRenderer.invoke("account:get"),
    login: () => ipcRenderer.invoke("account:login"),
    cancel: () => ipcRenderer.invoke("account:cancel"),
    logout: () => ipcRenderer.invoke("account:logout"),
    onChange: (cb: (s: unknown) => void) => {
      const h = (_e: unknown, s: unknown) => cb(s);
      ipcRenderer.on("account:changed", h);
      return () => { ipcRenderer.removeListener("account:changed", h); };
    },
  },
  friends: {
    list: () => ipcRenderer.invoke("friends:list"),
    search: (q: string) => ipcRenderer.invoke("friends:search", q),
    add: (id: string) => ipcRenderer.invoke("friends:add", id),
    remove: (id: string) => ipcRenderer.invoke("friends:remove", id),
  },
  onlineSetup: {
    state: () => ipcRenderer.invoke("online-setup:state"),
    progress: () => ipcRenderer.invoke("online-setup:progress"),
    start: () => ipcRenderer.invoke("online-setup:start"),
    open: (which: "modrinth" | "cloudflare") => ipcRenderer.invoke("online-setup:open", which),
    onState: (cb: (s: unknown) => void) => {
      const h = (_e: unknown, s: unknown) => cb(s);
      ipcRenderer.on("online-setup:state", h);
      return () => { ipcRenderer.removeListener("online-setup:state", h); };
    },
  },
  onSettingsChanged: (cb: (s: unknown) => void) => {
    const h = (_e: unknown, s: unknown) => cb(s);
    ipcRenderer.on("settings:changed", h);
    return () => { ipcRenderer.removeListener("settings:changed", h); };
  },
  importer: {
    scan: () => ipcRenderer.invoke("import:scan"),
    pickFolder: () => ipcRenderer.invoke("import:pickFolder"),
    measure: (inst: unknown, parts: string[]) => ipcRenderer.invoke("import:measure", inst, parts),
    run: (inst: unknown, parts: string[], name: string, version: string) => ipcRenderer.invoke("import:run", inst, parts, name, version),
    onProgress: (cb: (p: { pct: number; item: string }) => void) => {
      const h = (_e: unknown, p: { pct: number; item: string }) => cb(p);
      ipcRenderer.on("import:progress", h);
      return () => { ipcRenderer.removeListener("import:progress", h); };
    },
  },
  updater: {
    state: () => ipcRenderer.invoke("updater:state"),
    check: () => ipcRenderer.invoke("updater:check"),
    install: () => ipcRenderer.invoke("updater:install"),
    justUpdated: () => ipcRenderer.invoke("updater:justUpdated"),
    onState: (cb: (s: unknown) => void) => {
      const h = (_e: unknown, s: unknown) => cb(s);
      ipcRenderer.on("updater:state", h);
      return () => { ipcRenderer.removeListener("updater:state", h); };
    },
  },
  notify: (title: string, body: string) => ipcRenderer.invoke("notify", title, body),
  log: (level: "info" | "warn" | "error", msg: string) => ipcRenderer.invoke("log", level, msg),
};
contextBridge.exposeInMainWorld("vex", api);
export type VexApi = typeof api;

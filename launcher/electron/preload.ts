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
    start: () => ipcRenderer.invoke("online-setup:start"),
    modrinth: (clientId: string, secret: string) => ipcRenderer.invoke("online-setup:modrinth", clientId, secret),
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

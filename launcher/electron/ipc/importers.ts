// Finds instances in other launchers and copies them into VEX. Sources are only ever READ:
// nothing in another launcher's folder is moved, changed or deleted.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { Loader } from "../shared/settingsModel";

export type SourceKind = "modrinth" | "curseforge" | "prism" | "multimc" | "vanilla" | "folder";
export interface FoundInstance {
  source: SourceKind; sourceLabel: string;
  name: string; version: string | null; loader: Loader;
  gameDir: string;                 // folder holding mods/, config/, options.txt…
  parts: Record<ImportPart, boolean>; // which parts exist
}
export type ImportPart = "mods" | "config" | "settings" | "resourcepacks" | "shaderpacks" | "worlds";
export const PART_PATHS: Record<ImportPart, string[]> = {
  mods: ["mods"],
  config: ["config", "defaultconfigs"],
  settings: ["options.txt", "optionsof.txt", "optionsshaders.txt", "servers.dat"],
  resourcepacks: ["resourcepacks"],
  shaderpacks: ["shaderpacks"],
  worlds: ["saves"],
};

const exists = (p: string) => { try { fs.accessSync(p); return true; } catch { return false; } };
const isDir = (p: string) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const readJson = (p: string): any => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const subdirs = (p: string) => { try { return fs.readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(p, d.name)); } catch { return []; } };

export function partsIn(gameDir: string): Record<ImportPart, boolean> {
  const out = {} as Record<ImportPart, boolean>;
  for (const [part, rels] of Object.entries(PART_PATHS) as [ImportPart, string[]][]) out[part] = rels.some((r) => exists(path.join(gameDir, r)));
  return out;
}

export function normalizeLoader(s: string | null | undefined): Loader {
  const v = (s ?? "").toLowerCase();
  if (v.includes("neoforge") || v.includes("neoforged")) return "neoforge";
  if (v.includes("quilt")) return "quilt";
  if (v.includes("fabric")) return "fabric";
  if (v.includes("forge")) return "forge";
  return "vanilla";
}

export function defaultRoots() {
  const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  return {
    modrinth: path.join(appData, "ModrinthApp"),
    curseforge: path.join(os.homedir(), "curseforge", "minecraft", "Instances"),
    prism: path.join(appData, "PrismLauncher", "instances"),
    multimc: [path.join(os.homedir(), "MultiMC", "instances"), "C:\\MultiMC\\instances"],
  };
}

// ---------- Modrinth App: profiles/<path>/ + metadata in app.db (SQLite) ----------
type SqlFactory = () => Promise<{ Database: new (data: Uint8Array) => { exec(sql: string): { columns: string[]; values: unknown[][] }[]; close(): void } }>;

export async function findModrinth(root: string, loadSql: SqlFactory): Promise<FoundInstance[]> {
  const profilesDir = path.join(root, "profiles");
  if (!isDir(profilesDir)) return [];
  const meta = new Map<string, { name?: string; version?: string; loader?: string }>();
  const dbFile = path.join(root, "app.db");
  if (exists(dbFile)) {
    try {
      const SQL = await loadSql();
      const db = new SQL.Database(new Uint8Array(fs.readFileSync(dbFile))); // in-memory copy; the real file is untouched
      const [res] = db.exec("SELECT * FROM profiles");
      if (res) for (const row of res.values) {
        const r = Object.fromEntries(res.columns.map((c, i) => [c, row[i]])) as Record<string, any>;
        if (r.path) meta.set(String(r.path), { name: r.name, version: r.game_version, loader: r.mod_loader });
      }
      db.close();
    } catch { /* unknown schema — fall back to profile.json / folder names */ }
  }
  return subdirs(profilesDir).map((dir) => {
    const key = path.basename(dir);
    const legacy = readJson(path.join(dir, "profile.json"))?.metadata; // older Modrinth App versions
    const m = meta.get(key) ?? { name: legacy?.name, version: legacy?.game_version, loader: legacy?.loader };
    return { source: "modrinth" as const, sourceLabel: "Modrinth App", name: m.name || key, version: m.version || null, loader: normalizeLoader(m.loader), gameDir: dir, parts: partsIn(dir) };
  });
}

// ---------- CurseForge: Instances/<name>/minecraftinstance.json ----------
export function findCurseForge(root: string): FoundInstance[] {
  return subdirs(root).flatMap((dir) => {
    const j = readJson(path.join(dir, "minecraftinstance.json"));
    if (!j) return [];
    return [{ source: "curseforge" as const, sourceLabel: "CurseForge", name: j.name || path.basename(dir), version: j.gameVersion || null,
      loader: normalizeLoader(j.baseModLoader?.name), gameDir: dir, parts: partsIn(dir) }];
  });
}

// ---------- Prism / MultiMC: instances/<id>/instance.cfg + mmc-pack.json ----------
export function findPrismLike(root: string, kind: "prism" | "multimc"): FoundInstance[] {
  return subdirs(root).flatMap((dir) => {
    const cfgFile = path.join(dir, "instance.cfg");
    if (!exists(cfgFile)) return [];
    const cfg = Object.fromEntries(fs.readFileSync(cfgFile, "utf8").split(/\r?\n/).map((l) => l.split("=")).filter((p) => p.length >= 2).map(([k, ...v]) => [k.trim(), v.join("=").trim()]));
    const pack = readJson(path.join(dir, "mmc-pack.json"));
    const comps: { uid: string; version?: string }[] = pack?.components ?? [];
    const mc = comps.find((c) => c.uid === "net.minecraft")?.version ?? cfg.IntendedVersion ?? null;
    const loaderComp = comps.find((c) => /fabric-loader|minecraftforge|neoforged|quilt-loader/.test(c.uid));
    const gameDir = [path.join(dir, "minecraft"), path.join(dir, ".minecraft")].find(isDir) ?? path.join(dir, ".minecraft");
    return [{ source: kind, sourceLabel: kind === "prism" ? "Prism Launcher" : "MultiMC", name: cfg.name || path.basename(dir), version: mc,
      loader: normalizeLoader(loaderComp?.uid), gameDir, parts: partsIn(gameDir) }];
  });
}

// ---------- Normal launcher: .minecraft ----------
export function findVanilla(mcDir: string): FoundInstance[] {
  if (!isDir(mcDir)) return [];
  const profiles = readJson(path.join(mcDir, "launcher_profiles.json"))?.profiles ?? {};
  const last = Object.values<any>(profiles).filter((p) => p?.lastVersionId && p.lastUsed).sort((a, b) => String(b.lastUsed).localeCompare(String(a.lastUsed)))[0];
  const id: string = last?.lastVersionId ?? "";
  // "fabric-loader-0.16.9-1.21.11" → the Minecraft version is the last x.y(.z) in the id.
  const version = [...id.matchAll(/(\d+\.\d+(?:\.\d+)?)/g)].pop()?.[1] ?? null;
  return [{ source: "vanilla", sourceLabel: "Minecraft Launcher", name: "Minecraft (.minecraft)", version, loader: normalizeLoader(id), gameDir: mcDir, parts: partsIn(mcDir) }];
}

/** A folder the user picked: either a game folder itself or an instance folder of a known launcher. */
export function findInFolder(dir: string): FoundInstance[] {
  if (exists(path.join(dir, "minecraftinstance.json"))) return findCurseForge(path.dirname(dir)).filter((i) => i.gameDir === dir);
  if (exists(path.join(dir, "instance.cfg"))) return findPrismLike(path.dirname(dir), "multimc").filter((i) => path.dirname(i.gameDir) === dir);
  const nested = [...findPrismLike(dir, "multimc"), ...findCurseForge(dir)];
  if (nested.length) return nested;
  const p = partsIn(dir);
  if (!Object.values(p).some(Boolean)) return [];
  return [{ source: "folder", sourceLabel: "Folder", name: path.basename(dir), version: null, loader: "vanilla", gameDir: dir, parts: p }];
}

// ---------- Copy ----------
export function dirSize(p: string, cap = 50_000): number {
  let total = 0, seen = 0;
  const walk = (q: string) => {
    let st: fs.Stats; try { st = fs.lstatSync(q); } catch { return; }
    if (st.isSymbolicLink()) return;
    if (st.isFile()) { total += st.size; return; }
    if (st.isDirectory() && seen++ < cap) for (const e of fs.readdirSync(q)) walk(path.join(q, e));
  };
  walk(p); return total;
}

export function measure(inst: FoundInstance, parts: ImportPart[]): number {
  return parts.flatMap((p) => PART_PATHS[p]).reduce((n, rel) => n + dirSize(path.join(inst.gameDir, rel)), 0);
}

/** Copies the chosen parts into `dest` (a fresh VEX instance folder). Never overwrites the source. */
export async function copyParts(inst: FoundInstance, parts: ImportPart[], dest: string, onProgress: (done: number, total: number, item: string) => void) {
  const items = parts.flatMap((p) => PART_PATHS[p]).filter((rel) => exists(path.join(inst.gameDir, rel)));
  const total = items.reduce((n, rel) => n + dirSize(path.join(inst.gameDir, rel)), 0) || 1;
  let done = 0;
  fs.mkdirSync(dest, { recursive: true });
  if (path.resolve(dest).startsWith(path.resolve(inst.gameDir) + path.sep) || path.resolve(dest) === path.resolve(inst.gameDir)) throw new Error("Can't import a folder into itself.");
  for (const rel of items) {
    const from = path.join(inst.gameDir, rel), to = path.join(dest, rel);
    onProgress(done, total, rel);
    await fs.promises.cp(from, to, { recursive: true, force: false, errorOnExist: false, dereference: false, preserveTimestamps: true });
    done += dirSize(from);
    onProgress(Math.min(done, total), total, rel);
  }
  return { copied: items, bytes: done };
}

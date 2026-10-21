// Finds instances in other launchers and copies them into VEX. Sources are only ever READ:
// nothing in another launcher's folder is moved, changed or deleted.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { Loader } from "../shared/settingsModel";

export type SourceKind = "modrinth" | "curseforge" | "prism" | "multimc" | "vanilla" | "norisk" | "folder";
export interface FoundInstance {
  source: SourceKind; sourceLabel: string;
  name: string; version: string | null; loader: Loader;
  gameDir: string;                 // folder holding mods/, config/, options.txt…
  parts: Record<ImportPart, boolean>; // which parts exist
  modsDir?: string;                // where the mod jars really are, when not <gameDir>/mods (NoRisk Client)
  extraJars?: string[];            // mod jars kept outside the instance (NoRisk Client's shared mod cache)
  modCount?: number;               // filled in by the scan
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
const subdirs = (p: string) => { try { return fs.readdirSync(p).map((n) => path.join(p, n)).filter(isDir); } catch { return []; } };

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
    norisk: path.join(appData, "norisk", "NoRiskClientV3"),
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
      const q = await openDb(dbFile, loadSql); // includes changes still in the -wal file
      try { for (const r of q.rows("SELECT * FROM profiles")) if (r.path) meta.set(String(r.path), { name: r.name, version: r.game_version, loader: r.mod_loader }); }
      finally { q.close(); }
    } catch { /* unknown schema — fall back to profile.json / folder names */ }
  }
  return subdirs(profilesDir).map((dir) => {
    const key = path.basename(dir);
    const legacy = readJson(path.join(dir, "profile.json"))?.metadata; // older Modrinth App versions
    const m = meta.get(key) ?? { name: legacy?.name, version: legacy?.game_version, loader: legacy?.loader };
    return { source: "modrinth" as const, sourceLabel: "Modrinth App", name: m.name || key, version: m.version || null, loader: normalizeLoader(m.loader), gameDir: dir, parts: partsIn(dir) };
  });
}

/**
 * Opens another launcher's SQLite database read-only. It's copied first (with its -wal/-shm files, which hold
 * changes not yet written into the main file while that launcher runs), so the original is never touched.
 * Uses Node's built-in SQLite (reads the WAL); falls back to sql.js (main file only).
 */
async function openDb(dbFile: string, loadSql: SqlFactory): Promise<{ rows(sql: string): Record<string, any>[]; close(): void }> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vex-db-"));
  const copy = path.join(tmp, "app.db");
  const cleanup = () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ } };
  try {
    fs.copyFileSync(dbFile, copy);
    for (const ext of ["-wal", "-shm"]) if (exists(dbFile + ext)) fs.copyFileSync(dbFile + ext, copy + ext);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(copy);
    return { rows: (sql) => db.prepare(sql).all(), close: () => { try { db.close(); } catch { /* closed */ } cleanup(); } };
  } catch {
    const SQL = await loadSql();
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(dbFile)));
    cleanup();
    return {
      rows: (sql) => { const [r] = db.exec(sql); return r ? r.values.map((row) => Object.fromEntries(r.columns.map((c, i) => [c, row[i]]))) : []; },
      close: () => db.close(),
    };
  }
}

// ---------- NoRisk Client launcher: data/profiles/<path>/, metadata in meta/app.db ----------
// Its own mods live in mods/nrc-<mc>-<loader>[-<id>]/ (the NoRisk Client mods themselves are kept elsewhere).
export async function findNoRisk(root: string, loadSql: SqlFactory): Promise<FoundInstance[]> {
  const profilesDir = path.join(root, "data", "profiles");
  if (!isDir(profilesDir)) return [];
  const out: FoundInstance[] = [];
  const dbFile = [path.join(root, "meta", "app.db"), path.join(root, "app.db")].find(exists);
  if (dbFile) {
    const q = await openDb(dbFile, loadSql);
    try {
      // NoRisk keeps the mods you add in one shared cache (meta/mod_cache) and hands them to the game at launch,
      // so they're not in the instance folder. The list per profile is in profile_mods.
      const cacheDir = path.join(path.dirname(dbFile), "mod_cache");
      const modsOf = (profileId: string): string[] => {
        if (!/^[0-9a-fA-F-]{36}$/.test(profileId)) return [];
        try {
          return q.rows(`SELECT file_name, file_name_override, enabled FROM profile_mods WHERE profile_id = '${profileId}'`)
            .filter((r) => Number(r.enabled) !== 0)
            .map((r) => String(r.file_name_override || r.file_name || ""))
            .filter((f) => /^[^\\/:*?"<>|]+\.jar$/i.test(f))
            .map((f) => path.join(cacheDir, f))
            .filter((f) => { try { return fs.statSync(f).isFile(); } catch { return false; } });
        } catch { return []; }
      };
      for (const r of q.rows("SELECT id, name, path, game_version, loader, group_name, use_shared_minecraft_folder FROM profiles")) {
        const ver = String(r.game_version ?? ""), loader = normalizeLoader(String(r.loader ?? ""));
        const rel = String(r.path ?? "").split("/").filter((x) => x && x !== "..");
        let dir = path.join(profilesDir, ...rel);
        if (Number(r.use_shared_minecraft_folder) && r.group_name) {
          const g = String(r.group_name);
          dir = /norisk/i.test(g) ? path.join(profilesDir, "noriskclient", /^1\.(\d|1[0-2])(\.|$)/.test(ver) ? "legacy" : "new") : path.join(profilesDir, "groups", g.replace(/[^\w.-]/g, "_"));
        }
        const extraJars = modsOf(String(r.id ?? ""));
        if (!isDir(dir) && !extraJars.length) continue;
        const parts = partsIn(dir);
        out.push({ source: "norisk", sourceLabel: "NoRisk Client", name: String(r.name || rel.join("/") || "NoRisk profile"), version: ver || null, loader, gameDir: dir,
          parts: { ...parts, mods: parts.mods || extraJars.length > 0 }, extraJars });
      }
    } catch { /* unknown schema: fall back to the folders */ }
    finally { q.close(); }
  }
  if (out.length) return out;
  // No database: one entry per mods/nrc-<mc>-<loader>* folder.
  const roots = [...subdirs(profilesDir), ...subdirs(path.join(profilesDir, "noriskclient")), ...subdirs(path.join(profilesDir, "groups"))];
  for (const dir of roots) {
    for (const md of subdirs(path.join(dir, "mods"))) {
      const m = /^nrc-(.+?)-(fabric|forge|neoforge|quilt)(?:-[0-9a-f]{4})?$/i.exec(path.basename(md));
      if (m) out.push({ source: "norisk", sourceLabel: "NoRisk Client", name: `${path.basename(dir)} (${m[1]} ${m[2]})`, version: m[1], loader: normalizeLoader(m[2]), gameDir: dir, parts: partsIn(dir), modsDir: md });
    }
  }
  return out;
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
  // Follows links (NoRisk Client links resourcepacks/, saves/… to .minecraft), counting each real folder once.
  let total = 0, seen = 0;
  const visited = new Set<string>();
  const walk = (q: string) => {
    let st: fs.Stats; try { st = fs.statSync(q); } catch { return; }
    if (st.isFile()) { total += st.size; return; }
    if (!st.isDirectory() || seen++ >= cap) return;
    let real: string; try { real = fs.realpathSync(q); } catch { return; }
    if (visited.has(real)) return;
    visited.add(real);
    let entries: string[] = []; try { entries = fs.readdirSync(q); } catch { return; }
    for (const e of entries) walk(path.join(q, e));
  };
  walk(p); return total;
}

/**
 * Copies a file or folder. Links (symlinks and Windows junctions, which NoRisk Client and others use to share
 * folders) are copied as the real files they point to: making links needs admin rights on Windows.
 */
export async function copyReal(from: string, to: string, visited = new Set<string>()): Promise<void> {
  const st = await fs.promises.stat(from); // follows links
  if (st.isFile()) {
    if (fs.existsSync(to)) return; // never overwrite
    await fs.promises.mkdir(path.dirname(to), { recursive: true });
    await fs.promises.copyFile(from, to, fs.constants.COPYFILE_EXCL);
    return;
  }
  if (!st.isDirectory()) return;
  const real = await fs.promises.realpath(from);
  if (visited.has(real)) return; // a link that points back up: don't loop
  visited.add(real);
  await fs.promises.mkdir(to, { recursive: true });
  for (const e of await fs.promises.readdir(from)) {
    try { await copyReal(path.join(from, e), path.join(to, e), visited); }
    catch (err: any) { if (err?.code !== "ENOENT") throw err; } // a dead link: skip it
  }
  visited.delete(real);
}

/** The mod .jar files of an instance: mods/*.jar, plus subfolders made for its Minecraft version (other launchers keep some there). */
export function modJars(inst: FoundInstance): string[] {
  const jars = (d: string) => { try { return fs.readdirSync(d).filter((n) => /\.jar$/i.test(n)).map((n) => path.join(d, n)).filter((f) => { try { return fs.statSync(f).isFile(); } catch { return false; } }); } catch { return []; } };
  const outside = (inst.extraJars ?? []).filter((f) => /\.jar$/i.test(f) && (() => { try { return fs.statSync(f).isFile(); } catch { return false; } })());
  if (inst.modsDir) return [...jars(inst.modsDir), ...outside];
  const top = path.join(inst.gameDir, "mods");
  const extra = subdirs(top).filter((d) => !!inst.version && path.basename(d).includes(inst.version));
  // one file per name (the same mod can be both in the instance and in a cache)
  const seen = new Set<string>();
  return [...jars(top), ...extra.flatMap(jars), ...outside].filter((f) => { const k = path.basename(f).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

/** Copies an instance's mod jars into `destGameDir`/mods. Files that are already there are left alone. */
export async function copyModJars(inst: FoundInstance, destGameDir: string, onFile: (name: string) => void = () => {}) {
  const to = path.join(destGameDir, "mods");
  if (path.resolve(to) === path.resolve(inst.modsDir ?? path.join(inst.gameDir, "mods"))) throw new Error("That's the same mods folder.");
  fs.mkdirSync(to, { recursive: true });
  const have = new Set(fs.readdirSync(to).map((f) => f.toLowerCase().replace(/\.disabled$/, "")));
  let added = 0, skipped = 0, bytes = 0;
  for (const src of modJars(inst)) {
    const name = path.basename(src);
    if (have.has(name.toLowerCase())) { skipped++; continue; }
    onFile(name);
    await fs.promises.copyFile(src, path.join(to, name), fs.constants.COPYFILE_EXCL).then(() => { added++; have.add(name.toLowerCase()); bytes += fs.statSync(src).size; }).catch(() => { skipped++; });
  }
  return { added, skipped, bytes };
}

export function measure(inst: FoundInstance, parts: ImportPart[]): number {
  const jarBytes = parts.includes("mods") ? modJars(inst).reduce((n, f) => { try { return n + fs.statSync(f).size; } catch { return n; } }, 0) : 0;
  return jarBytes + parts.filter((p) => p !== "mods").flatMap((p) => PART_PATHS[p]).reduce((n, rel) => n + dirSize(path.join(inst.gameDir, rel)), 0);
}

/** Copies the chosen parts into `dest` (a fresh VEX instance folder). Never overwrites the source. */
export async function copyParts(inst: FoundInstance, parts: ImportPart[], dest: string, onProgress: (done: number, total: number, item: string) => void) {
  const items = parts.filter((p) => p !== "mods").flatMap((p) => PART_PATHS[p]).filter((rel) => exists(path.join(inst.gameDir, rel)));
  const total = measure(inst, parts) || 1;
  let done = 0;
  fs.mkdirSync(dest, { recursive: true });
  if (path.resolve(dest).startsWith(path.resolve(inst.gameDir) + path.sep) || path.resolve(dest) === path.resolve(inst.gameDir)) throw new Error("Can't import a folder into itself.");
  if (parts.includes("mods")) {
    onProgress(0, total, "mods");
    const r = await copyModJars(inst, dest);
    done += r.bytes;
    if (r.added) items.unshift("mods");
  }
  const skipped: { item: string; reason: string }[] = [];
  for (const rel of items) {
    if (rel === "mods") continue;
    const from = path.join(inst.gameDir, rel), to = path.join(dest, rel);
    onProgress(done, total, rel);
    try { await copyReal(from, to); }
    catch (e: any) { skipped.push({ item: rel, reason: e?.code === "EPERM" || e?.code === "EACCES" ? "Windows didn't allow reading it" : String(e?.message ?? e) }); }
    done += dirSize(from);
    onProgress(Math.min(done, total), total, rel);
  }
  const copied = items.filter((i) => !skipped.some((s) => s.item === i));
  if (!copied.length && items.length) throw new Error(`Nothing could be copied: ${skipped.map((s) => `${s.item} (${s.reason})`).join(", ")}`);
  return { copied, skipped, bytes: done };
}

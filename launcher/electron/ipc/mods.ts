// Mods inside an instance: list, enable/disable (renames to .jar.disabled like other launchers),
// remove, add .jar files, and look up names + icons on Modrinth by file hash.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { log } from "./logger";

export interface ModFile { file: string; enabled: boolean; size: number; sha1: string }
export interface ModInfo { title: string; icon: string | null; slug: string; version: string }

const modsDir = (gameDir: string) => path.join(gameDir, "mods");
const safe = (file: string) => {
  const f = path.basename(String(file ?? ""));
  if (!/\.jar(\.disabled)?$/i.test(f) || f !== String(file)) throw new Error("That isn't a mod file.");
  return f;
};

export function listMods(gameDir: string): ModFile[] {
  const dir = modsDir(gameDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /\.jar(\.disabled)?$/i.test(f)).flatMap((f) => {
    const p = path.join(dir, f);
    try {
      const st = fs.statSync(p);
      if (!st.isFile()) return [];
      return [{ file: f, enabled: !/\.disabled$/i.test(f), size: st.size, sha1: crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex") }];
    } catch { return []; }
  }).sort((a, b) => a.file.localeCompare(b.file, undefined, { sensitivity: "base" }));
}

export function setModEnabled(gameDir: string, file: string, enabled: boolean) {
  const f = safe(file), dir = modsDir(gameDir);
  const base = f.replace(/\.disabled$/i, "");
  const to = enabled ? base : `${base}.disabled`;
  if (f !== to) fs.renameSync(path.join(dir, f), path.join(dir, to));
  return listMods(gameDir);
}

export function removeMod(gameDir: string, file: string) {
  fs.rmSync(path.join(modsDir(gameDir), safe(file)), { force: true });
  log("info", `Removed mod ${file}`);
  return listMods(gameDir);
}

export function addMods(gameDir: string, files: string[]) {
  const dir = modsDir(gameDir);
  fs.mkdirSync(dir, { recursive: true });
  let added = 0;
  for (const src of files) {
    if (!/\.jar$/i.test(src) || !fs.statSync(src).isFile()) continue;
    fs.copyFileSync(src, path.join(dir, path.basename(src)));
    added++;
  }
  return { added, mods: listMods(gameDir) };
}

const infoCache = new Map<string, ModInfo | null>();
/** Names, icons and versions from Modrinth for the given file hashes (unknown files are left out). */
export async function modInfo(hashes: string[]): Promise<Record<string, ModInfo>> {
  const want = [...new Set(hashes.filter((h) => /^[0-9a-f]{40}$/.test(h) && !infoCache.has(h)))];
  if (want.length) {
    try {
      const ua = { "user-agent": "VEX-CLIENT (github.com/Albatron2580/vex-client)", "content-type": "application/json" };
      const vr = await fetch("https://api.modrinth.com/v2/version_files", { method: "POST", headers: ua, body: JSON.stringify({ hashes: want, algorithm: "sha1" }), signal: AbortSignal.timeout(15_000) });
      const versions: Record<string, { project_id: string; version_number: string }> = vr.ok ? await vr.json() : {};
      const ids = [...new Set(Object.values(versions).map((v) => v.project_id))];
      const projects: { id: string; title: string; icon_url: string | null; slug: string }[] = ids.length
        ? await (await fetch(`https://api.modrinth.com/v2/projects?ids=${encodeURIComponent(JSON.stringify(ids))}`, { headers: ua, signal: AbortSignal.timeout(15_000) })).json() : [];
      const byId = new Map(projects.map((p) => [p.id, p]));
      for (const h of want) {
        const v = versions[h], p = v && byId.get(v.project_id);
        infoCache.set(h, p ? { title: p.title, icon: p.icon_url && /^https:\/\/cdn\.modrinth\.com\//.test(p.icon_url) ? p.icon_url : null, slug: p.slug, version: v.version_number } : null);
      }
    } catch { /* offline: show file names */ }
  }
  const out: Record<string, ModInfo> = {};
  for (const h of hashes) { const i = infoCache.get(h); if (i) out[h] = i; }
  return out;
}

/** The mod-loader version installed for each Minecraft version, read from the shared versions folder. */
export function installedLoaderVersions(gameRoot: string): Record<string, string> {
  const out: Record<string, string> = {};
  let names: string[] = [];
  try { names = fs.readdirSync(path.join(gameRoot, "versions")); } catch { return out; }
  for (const n of names) {
    let m = /^fabric-loader-([\d.]+)-(.+)$/.exec(n);
    if (m) { out[`fabric:${m[2]}`] = m[1]; continue; }
    m = /^(.+)-forge-([\d.]+)$/.exec(n);
    if (m) { out[`forge:${m[1]}`] = m[2]; continue; }
    m = /^neoforge-([\d.]+(?:-beta)?)$/.exec(n);
    if (m) { const mc = "1." + m[1].split(".").slice(0, 2).join(".").replace(/\.0$/, ""); out[`neoforge:${mc}`] = m[1]; }
  }
  return out;
}

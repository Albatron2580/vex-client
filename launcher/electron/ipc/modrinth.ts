// Modrinth catalogue: search mods, shaders and resource packs, and install the right version (plus required
// dependencies) into an instance. Public API, no account needed; every download is checked against Modrinth's SHA-1.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { log } from "./logger";
import type { Instance } from "../shared/settingsModel";

const API = "https://api.modrinth.com/v2";
const UA = { "user-agent": "VEX-CLIENT (github.com/Albatron2580/vex-client)" };
export type ProjectType = "mod" | "shader" | "resourcepack";
export interface SearchHit { id: string; slug: string; title: string; author: string; description: string; icon: string | null; downloads: number; follows: number; categories: string[]; type: ProjectType }

async function get<T>(url: string): Promise<T> {
  let r: Response;
  try { r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20_000) }); }
  catch { throw new Error("Couldn't reach Modrinth. Check your internet connection."); }
  if (r.status === 429) throw new Error("Modrinth is busy. Try again in a minute.");
  if (!r.ok) throw new Error(`Modrinth answered ${r.status}.`);
  return r.json() as Promise<T>;
}

const folderFor = (t: ProjectType) => (t === "mod" ? "mods" : t === "shader" ? "shaderpacks" : "resourcepacks");
const loadersFor = (t: ProjectType, inst: Instance) => (t === "mod" ? [inst.loader === "quilt" ? "quilt" : inst.loader] : t === "shader" ? ["iris", "optifine"] : ["minecraft"]);

export async function search(opts: { query: string; type: ProjectType; inst?: Instance | null; sort?: "relevance" | "downloads" | "newest" | "updated"; offset?: number }): Promise<{ hits: SearchHit[]; total: number }> {
  const facets: string[][] = [[`project_type:${opts.type}`]];
  if (opts.inst) {
    facets.push([`versions:${opts.inst.version}`]);
    if (opts.type === "mod" && opts.inst.loader !== "vanilla") facets.push([`categories:${opts.inst.loader}`]);
  }
  const q = new URLSearchParams({ query: opts.query.slice(0, 100), facets: JSON.stringify(facets), limit: "20", offset: String(Math.max(0, opts.offset ?? 0)), index: opts.sort ?? "relevance" });
  const r = await get<{ hits: any[]; total_hits: number }>(`${API}/search?${q}`);
  return {
    total: r.total_hits,
    hits: r.hits.map((h) => ({
      id: String(h.project_id), slug: String(h.slug), title: String(h.title), author: String(h.author ?? ""), description: String(h.description ?? ""),
      icon: typeof h.icon_url === "string" && /^https:\/\/cdn\.modrinth\.com\//.test(h.icon_url) ? h.icon_url : null,
      downloads: Number(h.downloads) || 0, follows: Number(h.follows) || 0, categories: Array.isArray(h.display_categories) ? h.display_categories.map(String).slice(0, 4) : [], type: opts.type,
    })),
  };
}

const sha1 = (f: string) => crypto.createHash("sha1").update(fs.readFileSync(f)).digest("hex");

/** Project ids of the files already in a folder (asks Modrinth by file hash). */
async function installedProjects(dir: string): Promise<Set<string>> {
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.(jar|zip)(\.disabled)?$/i.test(f)) : [];
  if (!files.length) return new Set();
  const hashes = files.map((f) => { try { return sha1(path.join(dir, f)); } catch { return ""; } }).filter(Boolean);
  try {
    const r = await fetch(`${API}/version_files`, { method: "POST", headers: { ...UA, "content-type": "application/json" }, body: JSON.stringify({ hashes, algorithm: "sha1" }), signal: AbortSignal.timeout(20_000) });
    const map: Record<string, { project_id: string }> = r.ok ? await r.json() : {};
    return new Set(Object.values(map).map((v) => v.project_id));
  } catch { return new Set(); }
}

export async function installedIds(inst: Instance, type: ProjectType): Promise<string[]> {
  return [...await installedProjects(path.join(inst.gameDir, folderFor(type)))];
}

/** Installs the newest version of a project that fits the instance, plus its required dependencies. */
export async function install(inst: Instance, projectId: string, type: ProjectType, onStatus: (s: string) => void = () => {}) {
  if (!/^[A-Za-z0-9]{1,20}$/.test(projectId)) throw new Error("Bad project id.");
  const dir = path.join(inst.gameDir, folderFor(type));
  fs.mkdirSync(dir, { recursive: true });
  const have = await installedProjects(dir);
  const added: string[] = [];
  const queue: { id: string; type: ProjectType; required: boolean }[] = [{ id: projectId, type, required: true }];
  const seen = new Set<string>();
  while (queue.length && seen.size < 30) {
    const job = queue.shift()!;
    if (seen.has(job.id)) continue;
    seen.add(job.id);
    const jdir = path.join(inst.gameDir, folderFor(job.type));
    if (job.id !== projectId && have.has(job.id)) continue;
    const q = new URLSearchParams({ game_versions: JSON.stringify([inst.version]), loaders: JSON.stringify(loadersFor(job.type, inst)) });
    const versions = await get<any[]>(`${API}/project/${job.id}/version?${q}`);
    const v = versions.find((x) => x.version_type === "release") ?? versions[0];
    if (!v) {
      if (job.id === projectId) throw new Error(`There's no version of this for ${inst.loader === "vanilla" ? "" : inst.loader + " "}${inst.version}.`);
      continue;
    }
    const file = v.files.find((f: any) => f.primary) ?? v.files[0];
    if (!file || !/^https:\/\/cdn\.modrinth\.com\//.test(file.url) || !/^[^\\/:*?"<>|]+\.(jar|zip)$/i.test(file.filename)) throw new Error("Modrinth sent a file VEX won't install.");
    onStatus(`Downloading ${file.filename}…`);
    const r = await fetch(file.url, { headers: UA, signal: AbortSignal.timeout(180_000) });
    if (!r.ok) throw new Error(`Download failed (${r.status}).`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (file.hashes?.sha1 && crypto.createHash("sha1").update(buf).digest("hex") !== file.hashes.sha1) throw new Error(`${file.filename} didn't match its checksum, so it wasn't installed.`);
    fs.writeFileSync(path.join(jdir, file.filename), buf);
    added.push(file.filename);
    have.add(job.id);
    log("info", `Installed ${file.filename} into ${inst.name}`);
    for (const d of v.dependencies ?? []) if (d.dependency_type === "required" && d.project_id) queue.push({ id: String(d.project_id), type: job.type, required: true });
  }
  return { added };
}

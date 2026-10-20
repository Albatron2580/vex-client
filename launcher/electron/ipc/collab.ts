// Collab: share an instance with a friend as a "recipe" (version, loader, Modrinth mod list),
// and rebuild an instance from a recipe by downloading each mod from Modrinth (hash-checked).
// Only files found on Modrinth travel; anything else is listed as "add it yourself".
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { log } from "./logger";
import type { Instance } from "../shared/settingsModel";

const MODRINTH = "https://api.modrinth.com/v2";
const UA = { "user-agent": "VEX-CLIENT (github.com/Albatron2580/vex-client)" };

export interface RecipeMod { projectId: string; versionId: string; title: string; file: string }
export interface Recipe { name: string; version: string; loader: Instance["loader"]; memoryMb: number; mods: RecipeMod[]; missing: string[] }

const sha1 = (file: string) => crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex");

async function mr<T>(p: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try { r = await fetch(MODRINTH + p, { ...init, headers: { ...UA, ...(init?.body ? { "content-type": "application/json" } : {}) }, signal: AbortSignal.timeout(20_000) }); }
  catch { throw new Error("Couldn't reach Modrinth. Check your internet connection."); }
  if (r.status === 429) throw new Error("Modrinth is busy. Wait a minute and try again.");
  if (!r.ok) throw new Error(`Modrinth answered ${r.status}.`);
  return r.json() as Promise<T>;
}

export async function buildRecipe(inst: Instance): Promise<Recipe> {
  const modsDir = path.join(inst.gameDir, "mods");
  const jars = fs.existsSync(modsDir) ? fs.readdirSync(modsDir).filter((f) => /\.jar$/i.test(f) && fs.statSync(path.join(modsDir, f)).isFile()) : [];
  const byHash = new Map(jars.map((f) => [sha1(path.join(modsDir, f)), f]));
  let found: Record<string, { id: string; project_id: string }> = {};
  if (byHash.size) found = await mr("/version_files", { method: "POST", body: JSON.stringify({ hashes: [...byHash.keys()], algorithm: "sha1" }) });
  const projectIds = [...new Set(Object.values(found).map((v) => v.project_id))];
  const titles = new Map<string, string>();
  for (let i = 0; i < projectIds.length; i += 100) {
    const chunk = projectIds.slice(i, i + 100);
    const projects = await mr<{ id: string; title: string }[]>(`/projects?ids=${encodeURIComponent(JSON.stringify(chunk))}`);
    projects.forEach((p) => titles.set(p.id, p.title));
  }
  const mods: RecipeMod[] = [], missing: string[] = [];
  for (const [hash, file] of byHash) {
    const v = found[hash];
    if (v) mods.push({ projectId: v.project_id, versionId: v.id, title: titles.get(v.project_id) ?? file, file });
    else missing.push(file);
  }
  mods.sort((a, b) => a.title.localeCompare(b.title));
  return { name: inst.name, version: inst.version, loader: inst.loader, memoryMb: inst.memoryMb, mods, missing };
}

/** Downloads the recipe's mods into `gameDir/mods`. Every file is checked against Modrinth's SHA-1. */
export async function installRecipeMods(recipe: Recipe, gameDir: string, onProgress: (done: number, total: number, title: string) => void) {
  const modsDir = path.join(gameDir, "mods");
  fs.mkdirSync(modsDir, { recursive: true });
  const ids = recipe.mods.map((m) => m.versionId).filter((v) => /^[A-Za-z0-9]{6,20}$/.test(v));
  const versions: any[] = [];
  for (let i = 0; i < ids.length; i += 100) versions.push(...await mr<any[]>(`/versions?ids=${encodeURIComponent(JSON.stringify(ids.slice(i, i + 100)))}`));
  const failed: string[] = [];
  let done = 0;
  for (const v of versions) {
    const file = (v.files ?? []).find((f: any) => f.primary) ?? v.files?.[0];
    const title = recipe.mods.find((m) => m.versionId === v.id)?.title ?? v.name;
    onProgress(done, versions.length, title);
    try {
      if (!file || !/^https:\/\/cdn\.modrinth\.com\//.test(file.url) || !/^[\w.+\-() ]+\.jar$/i.test(file.filename)) throw new Error("unexpected file");
      const r = await fetch(file.url, { headers: UA, signal: AbortSignal.timeout(120_000) });
      if (!r.ok) throw new Error(String(r.status));
      const buf = Buffer.from(await r.arrayBuffer());
      if (crypto.createHash("sha1").update(buf).digest("hex") !== file.hashes?.sha1) throw new Error("checksum mismatch");
      fs.writeFileSync(path.join(modsDir, path.basename(file.filename)), buf);
    } catch (e: any) { failed.push(title); log("warn", `Collab: couldn't download ${title}: ${e.message}`); }
    onProgress(++done, versions.length, title);
  }
  return { installed: done - failed.length, failed };
}

/** Live status of a Minecraft server (players online, version) via the public mcsrvstat.us API. */
export async function serverStatus(address: string) {
  if (!/^[a-z0-9.-]{1,253}(:\d{1,5})?$/i.test(address)) throw new Error("Bad address.");
  try {
    const r = await fetch(`https://api.mcsrvstat.us/3/${encodeURIComponent(address)}`, { headers: UA, signal: AbortSignal.timeout(10_000) });
    const j: any = await r.json();
    return { online: !!j.online, players: j.players ? { online: j.players.online ?? 0, max: j.players.max ?? 0 } : null, version: j.version ?? null, motd: Array.isArray(j.motd?.clean) ? j.motd.clean.join(" ").slice(0, 200) : null };
  } catch { return { online: false, players: null, version: null, motd: null, unknown: true }; }
}

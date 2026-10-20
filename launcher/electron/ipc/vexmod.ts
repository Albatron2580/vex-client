// Puts the VEX in-game mod (Right Shift menu, HUD, grey V badge) and Fabric API into Fabric instances
// before Minecraft starts. The mod comes from this repo's "vex-mod" GitHub release and is checked against
// the release's SHA256SUMS.txt; Fabric API comes from Modrinth and is checked against Modrinth's SHA-1.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { app } from "electron";
import { log } from "./logger";
import type { Instance } from "../shared/settingsModel";

/* eslint-disable @typescript-eslint/no-var-requires */
const { withZip } = require("../game/zip");

export const MOD_FILE = "vex-client-mod.jar";
const RELEASE = "https://github.com/Albatron2580/vex-client/releases/download/vex-mod";
const UA = { "user-agent": "VEX-CLIENT (github.com/Albatron2580/vex-client)" };
const CHECK_EVERY_MS = 10 * 60_000;

const cacheDir = () => path.join(app.getPath("userData"), "vex-mod");
const cachedJar = () => path.join(cacheDir(), MOD_FILE);
const sha256 = (f: string) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const sha1Buf = (b: Buffer) => crypto.createHash("sha1").update(b).digest("hex");
let lastCheck = 0;

/** fabric.mod.json of a jar, or null. */
export function modMeta(jar: string): { id?: string; version?: string; depends?: Record<string, unknown> } | null {
  try { return withZip(jar, (z: any) => z.readJson("fabric.mod.json")); } catch { return null; }
}

/** The Minecraft version a jar says it needs ("1.21.11"), from depends.minecraft. */
export function modMinecraft(jar: string): string | null {
  const d = modMeta(jar)?.depends?.minecraft;
  const s = Array.isArray(d) ? String(d[0] ?? "") : String(d ?? "");
  return /(\d+\.\d+(?:\.\d+)?)/.exec(s)?.[1] ?? null;
}

async function get(url: string, timeout = 30_000) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeout) });
  if (!r.ok) throw new Error(`${new URL(url).host} answered ${r.status}`);
  return r;
}

/** Latest VEX mod jar (downloaded when the release changed), or the cached copy when offline. */
export async function ensureModCached(): Promise<string | null> {
  const jar = cachedJar();
  if (fs.existsSync(jar) && Date.now() - lastCheck < CHECK_EVERY_MS) return jar;
  try {
    const sums = await (await get(`${RELEASE}/SHA256SUMS.txt`, 15_000)).text();
    const want = /^([0-9a-f]{64})\s+\*?vex-client-mod\.jar\s*$/m.exec(sums)?.[1];
    if (!want) throw new Error("the release has no checksum for the mod");
    if (!fs.existsSync(jar) || sha256(jar) !== want) {
      const buf = Buffer.from(await (await get(`${RELEASE}/${MOD_FILE}`, 60_000)).arrayBuffer());
      if (crypto.createHash("sha256").update(buf).digest("hex") !== want) throw new Error("the downloaded mod didn't match its checksum");
      fs.mkdirSync(cacheDir(), { recursive: true });
      fs.writeFileSync(jar + ".tmp", buf);
      fs.renameSync(jar + ".tmp", jar);
      log("info", `Downloaded the VEX in-game mod ${modMeta(jar)?.version ?? ""}`);
    }
    lastCheck = Date.now();
  } catch (e: any) {
    log("warn", `Couldn't check for a new VEX in-game mod: ${e.message}`);
  }
  return fs.existsSync(jar) ? jar : null;
}

const jarsIn = (dir: string) => { try { return fs.readdirSync(dir).filter((f) => /\.jar$/i.test(f)); } catch { return []; } };

async function ensureFabricApi(modsDir: string, mc: string, status: (s: string) => void) {
  if (jarsIn(modsDir).some((f) => modMeta(path.join(modsDir, f))?.id === "fabric-api")) return;
  if (fs.readdirSync(modsDir).some((f) => /^fabric-api.*\.jar\.disabled$/i.test(f))) return; // turned off on purpose
  status("Installing Fabric API (needed by the VEX mod)…");
  const q = `https://api.modrinth.com/v2/project/fabric-api/version?game_versions=${encodeURIComponent(JSON.stringify([mc]))}&loaders=${encodeURIComponent('["fabric"]')}`;
  const versions: any[] = await (await get(q, 20_000)).json();
  const file = versions[0]?.files?.find((f: any) => f.primary) ?? versions[0]?.files?.[0];
  if (!file?.url || !/^https:\/\/cdn\.modrinth\.com\//.test(file.url) || !/^[\w.+-]+\.jar$/.test(file.filename)) throw new Error(`no Fabric API for ${mc} on Modrinth`);
  const buf = Buffer.from(await (await get(file.url, 120_000)).arrayBuffer());
  if (file.hashes?.sha1 && sha1Buf(buf) !== file.hashes.sha1) throw new Error("Fabric API didn't match its checksum");
  fs.writeFileSync(path.join(modsDir, file.filename), buf);
  log("info", `Installed Fabric API ${versions[0].version_number} into ${modsDir}`);
}

export interface ModCredentials { url: string; token: string }

/**
 * Runs before every launch. Never stops the game from starting: problems are logged and the game starts
 * without the newest VEX mod.
 */
export async function prepareVexMod(inst: Instance, opts: { enabled: boolean; online: ModCredentials | null; status: (s: string) => void }) {
  const cfgFile = path.join(inst.gameDir, "config", "vex-online.json");
  try {
    // VEX online for the mod (the V badge): the session token of the account that's playing, readable only by you.
    if (opts.online) {
      fs.mkdirSync(path.dirname(cfgFile), { recursive: true });
      fs.writeFileSync(cfgFile, JSON.stringify(opts.online), { mode: 0o600 });
    } else fs.rmSync(cfgFile, { force: true });
  } catch { /* the badge just won't show */ }

  if (!opts.enabled || inst.loader !== "fabric") return;
  const modsDir = path.join(inst.gameDir, "mods");
  try {
    fs.mkdirSync(modsDir, { recursive: true });
    if (fs.existsSync(path.join(modsDir, MOD_FILE + ".disabled"))) return; // turned off in the Mods window
    opts.status("Checking the VEX in-game mod…");
    const jar = await ensureModCached();
    if (!jar) return;
    const mc = modMinecraft(jar);
    if (mc && mc !== inst.version) { log("info", `VEX in-game mod is for Minecraft ${mc}; ${inst.name} is ${inst.version}, so it isn't added`); return; }
    // Exactly one copy: other jars of the VEX mod (older names, copies dropped in by hand) would stop the game.
    for (const f of jarsIn(modsDir)) {
      if (f !== MOD_FILE && modMeta(path.join(modsDir, f))?.id === "vexclient") fs.rmSync(path.join(modsDir, f), { force: true });
    }
    const dest = path.join(modsDir, MOD_FILE);
    if (!fs.existsSync(dest) || sha256(dest) !== sha256(jar)) {
      fs.copyFileSync(jar, dest + ".tmp");
      fs.renameSync(dest + ".tmp", dest);
      opts.status(`Added the VEX in-game mod ${modMeta(jar)?.version ?? ""} (Right Shift opens the menu)`);
    }
    await ensureFabricApi(modsDir, inst.version, opts.status);
  } catch (e: any) {
    log("warn", `VEX in-game mod: ${e.message}`);
    opts.status(`VEX in-game mod not updated: ${e.message}`);
  }
}

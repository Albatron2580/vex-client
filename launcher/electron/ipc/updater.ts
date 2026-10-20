import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { app, BrowserWindow } from "electron";
import { log } from "./logger";
import { pickUpdate, parseChecksum, type UpdateInfo, type GithubRelease } from "../shared/updateLogic";

// Updates come from GitHub releases of Albatron2580/vex-client. Each release must contain
// VEX-CLIENT-Setup-x.y.z.exe and VEX-CLIENT-Setup-x.y.z.exe.sha256 (the release workflow makes both).
const REPO = "Albatron2580/vex-client";

export type UpdateState =
  | { status: "idle" | "checking" | "up-to-date" | "unsupported"; checkedAt?: number; message?: string }
  | { status: "downloading"; version: string; pct: number }
  | { status: "ready"; version: string; notes: string }
  | { status: "error"; message: string; checkedAt?: number };

let state: UpdateState = { status: "idle" };
let readyFile: string | null = null;
let busy = false;

const broadcast = () => BrowserWindow.getAllWindows().forEach((w) => w.webContents.send("updater:state", state));
const setState = (s: UpdateState) => { state = s; broadcast(); };
export const getUpdateState = () => state;

export function updatesSupported() { return app.isPackaged && process.platform === "win32"; }

export async function checkForUpdates(manual = false): Promise<UpdateState> {
  if (!updatesSupported()) { setState({ status: "unsupported", message: "Updates install in the Windows app." }); return state; }
  if (busy || state.status === "ready") return state;
  busy = true;
  try {
    setState({ status: "checking" });
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "VEX-CLIENT-Updater" }, signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 404) { setState({ status: "up-to-date", checkedAt: Date.now(), message: "No releases published yet." }); return state; }
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const info = pickUpdate((await res.json()) as GithubRelease, app.getVersion());
    if (!info) { setState({ status: "up-to-date", checkedAt: Date.now() }); return state; }
    log("info", `Update ${info.version} found, downloading`);
    await download(info);
  } catch (e: any) {
    log("warn", `Update check failed: ${e.message}`);
    setState({ status: "error", message: manual ? e.message : "Couldn't check for updates.", checkedAt: Date.now() });
  } finally { busy = false; }
  return state;
}

async function download(info: UpdateInfo) {
  const dir = path.join(app.getPath("userData"), "updates");
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { force: true }); // old downloads

  const sumRes = await fetch(info.checksum.browser_download_url, { signal: AbortSignal.timeout(15_000) });
  const expected = sumRes.ok ? parseChecksum(await sumRes.text()) : null;
  if (!expected) throw new Error("The update has no valid checksum, so it was not downloaded.");

  const target = path.join(dir, info.installer.name), part = target + ".part";
  const res = await fetch(info.installer.browser_download_url, { signal: AbortSignal.timeout(30 * 60_000) });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
  const total = Number(res.headers.get("content-length")) || info.installer.size || 0;
  const hash = crypto.createHash("sha256");
  const out = fs.createWriteStream(part);
  let got = 0, lastPct = -1;
  setState({ status: "downloading", version: info.version, pct: 0 });
  for await (const chunk of res.body as any as AsyncIterable<Uint8Array>) {
    hash.update(chunk); got += chunk.length;
    if (!out.write(chunk)) await new Promise<void>((r) => out.once("drain", () => r()));
    const pct = total ? Math.floor((got / total) * 100) : 0;
    if (pct !== lastPct) { lastPct = pct; setState({ status: "downloading", version: info.version, pct }); }
  }
  await new Promise<void>((r, j) => out.end((e?: Error | null) => (e ? j(e) : r())));
  const actual = hash.digest("hex");
  if (actual !== expected) { fs.rmSync(part, { force: true }); throw new Error("The downloaded update didn't match its checksum and was deleted."); }
  fs.renameSync(part, target);
  readyFile = target;
  log("info", `Update ${info.version} downloaded and verified (${got} bytes)`);
  setState({ status: "ready", version: info.version, notes: info.notes });
}

/** Runs the verified installer silently; it closes VEX, installs, then starts the new version. */
export function installAndRestart() {
  if (!readyFile || !fs.existsSync(readyFile)) throw new Error("No downloaded update to install.");
  log("info", `Installing update from ${readyFile}`);
  spawn(readyFile, ["/S", "--force-run"], { detached: true, stdio: "ignore", windowsHide: false }).unref();
  setTimeout(() => app.quit(), 300);
}

export function startAutoCheck() {
  if (!updatesSupported()) return;
  setTimeout(() => checkForUpdates(false), 8_000);
  setInterval(() => checkForUpdates(false), 4 * 60 * 60_000);
}

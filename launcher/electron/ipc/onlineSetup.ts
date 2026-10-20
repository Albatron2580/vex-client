// In-app setup of the VEX online service (Cloudflare Worker + D1) — the same steps as
// server/setup-vex-online.ps1, run from the launcher with live progress.
// Safe to re-run: every step checks whether it's already done.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { app, BrowserWindow, shell } from "electron";
import { log } from "./logger";

export type StepId = "node" | "tools" | "cloudflare" | "database" | "deploy" | "modrinth" | "check" | "connect";
export type StepStatus = "pending" | "running" | "done" | "error" | "waiting";
export const STEPS: { id: StepId; label: string }[] = [
  { id: "node", label: "Node.js" },
  { id: "tools", label: "Install tools" },
  { id: "cloudflare", label: "Sign in to Cloudflare" },
  { id: "database", label: "Create the friends database" },
  { id: "deploy", label: "Put the service online" },
  { id: "modrinth", label: "Connect Modrinth sign-in" },
  { id: "check", label: "Check it works" },
  { id: "connect", label: "Connect VEX" },
];

export interface SetupState {
  running: boolean;
  steps: Record<StepId, { status: StepStatus; detail?: string }>;
  need: null | { kind: "subdomain" } | { kind: "modrinth"; redirect: string } | { kind: "cloudflare-login" };
  url: string | null;
  error: string | null;
  log: string[];
  finished: boolean;
}

const fresh = (): SetupState => ({
  running: false, need: null, url: null, error: null, log: [], finished: false,
  steps: Object.fromEntries(STEPS.map((s) => [s.id, { status: "pending" }])) as SetupState["steps"],
});
let state = fresh();
let onConnected: (url: string) => Promise<void> = async () => {};
let modrinthInput: { clientId: string; secret: string } | null = null;

const broadcast = () => BrowserWindow.getAllWindows().forEach((w) => w.webContents.send("online-setup:state", state));
const setStep = (id: StepId, status: StepStatus, detail?: string) => { state.steps[id] = { status, detail }; broadcast(); };
const addLog = (text: string) => {
  // Never let anything that looks like a secret reach the log shown on screen.
  const clean = text.replace(/\x1b\[[0-9;]*m/g, "").replace(/(secret[^\n]{0,20}[:=]\s*)\S+/gi, "$1••••");
  for (const line of clean.split(/\r?\n/)) if (line.trim()) state.log.push(line.slice(0, 300));
  if (state.log.length > 400) state.log = state.log.slice(-400);
  broadcast();
};
class NeedsInput extends Error {}
class StepError extends Error {}

export const setupState = () => state;
export function setConnectHandler(fn: (url: string) => Promise<void>) { onConnected = fn; }

// ---------- working folder (a writable copy of the bundled server) ----------
function sourceDir() {
  const packaged = path.join(process.resourcesPath ?? "", "online-server");
  if (app.isPackaged && fs.existsSync(packaged)) return packaged;
  return path.resolve(__dirname, "..", "..", "..", "server"); // dev: launcher/dist-electron/ipc → vex-client/server
}
export const workDir = () => path.join(app.getPath("userData"), "online-server");

function prepareWorkDir() {
  const src = sourceDir(), dst = workDir();
  if (!fs.existsSync(path.join(src, "package.json"))) throw new StepError("The online service files are missing from this copy of VEX. Reinstall VEX.");
  fs.mkdirSync(dst, { recursive: true });
  for (const item of ["package.json", "package-lock.json", "tsconfig.json", "src", "migrations"]) {
    const from = path.join(src, item);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(dst, item), { recursive: true, force: true });
  }
  // wrangler.toml holds your database id + client id, so it's only copied the first time.
  if (!fs.existsSync(path.join(dst, "wrangler.toml"))) fs.copyFileSync(path.join(src, "wrangler.toml"), path.join(dst, "wrangler.toml"));
}

const tomlPath = () => path.join(workDir(), "wrangler.toml");
const getToml = (key: string) => new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, "m").exec(fs.readFileSync(tomlPath(), "utf8"))?.[1] ?? "";
const setToml = (key: string, value: string) => {
  const t = fs.readFileSync(tomlPath(), "utf8").replace(new RegExp(`^(\\s*${key}\\s*=\\s*)"[^"]*"`, "m"), `$1"${value}"`);
  fs.writeFileSync(tomlPath(), t, "utf8");
};

// ---------- running commands ----------
let extraPath = "";
function run(cmd: string, args: string[], opts: { input?: string; nonInteractive?: boolean; quiet?: boolean; timeoutMs?: number } = {}): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const env = { ...process.env, WRANGLER_SEND_METRICS: "false", NO_COLOR: "1", FORCE_COLOR: "0", ELECTRON_RUN_AS_NODE: undefined } as NodeJS.ProcessEnv;
    if (extraPath) env.PATH = `${extraPath}${path.delimiter}${env.PATH ?? env.Path ?? ""}`;
    if (opts.nonInteractive) env.CI = "true"; else delete env.CI;
    // Only fixed arguments ever reach the shell; user input goes through files or stdin.
    const child = spawn(cmd, args, { cwd: fs.existsSync(workDir()) ? workDir() : undefined, env, shell: process.platform === "win32", windowsHide: true });
    let out = "";
    const onData = (d: Buffer) => { const s = d.toString(); out += s; if (!opts.quiet) addLog(s); };
    child.stdout.on("data", onData); child.stderr.on("data", onData);
    const timer = setTimeout(() => { child.kill(); out += "\n(timed out)"; }, opts.timeoutMs ?? 10 * 60_000);
    child.on("error", (e) => { clearTimeout(timer); resolve({ code: -1, out: out + String(e.message) }); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code: code ?? -1, out }); });
    if (opts.input !== undefined) child.stdin.end(opts.input); else child.stdin.end();
  });
}
const wrangler = (args: string[], o: Parameters<typeof run>[2] = {}) => run(process.platform === "win32" ? "npx.cmd" : "npx", ["--yes", "wrangler", ...args], o);

/** Wrangler sometimes prints warnings like "[WARNING] …" before its JSON. */
export function findJson(text: string): any {
  const end = text.lastIndexOf("]");
  let offset = 0;
  for (const line of text.split("\n")) {
    const start = offset + (line.length - line.trimStart().length);
    offset += line.length + 1;
    if (!line.trimStart().startsWith("[") || start >= end) continue;
    try { return JSON.parse(text.slice(start, end + 1)); } catch { /* try the next candidate */ }
  }
  return null;
}
export const findWorkersUrl = (text: string) => /https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.workers\.dev/.exec(text)?.[0] ?? null;

// ---------- steps ----------
async function stepNode() {
  let v = await run("node", ["--version"], { quiet: true });
  if (v.code !== 0 && process.platform === "win32") {
    addLog("Node.js isn't installed — installing it with winget (Windows may ask for permission)…");
    await run("winget", ["install", "-e", "--id", "OpenJS.NodeJS.LTS", "--accept-source-agreements", "--accept-package-agreements"], { timeoutMs: 15 * 60_000 });
    for (const dir of [path.join(process.env.ProgramFiles ?? "C:\\Program Files", "nodejs"), path.join(process.env.LOCALAPPDATA ?? "", "Programs", "nodejs")]) {
      if (fs.existsSync(path.join(dir, "node.exe"))) { extraPath = dir; break; }
    }
    v = await run("node", ["--version"], { quiet: true });
  }
  if (v.code !== 0) throw new StepError("Node.js isn't installed. Get the LTS version from nodejs.org, install it, then click Retry.");
  const major = Number(/v(\d+)/.exec(v.out)?.[1] ?? 0);
  if (major < 18) throw new StepError(`Node.js ${v.out.trim()} is too old. Install the LTS version from nodejs.org, then click Retry.`);
  return v.out.trim();
}

async function stepTools() {
  prepareWorkDir();
  const r = await run(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], { timeoutMs: 15 * 60_000 });
  if (r.code !== 0) throw new StepError("Installing the tools failed. Check your internet connection, then click Retry.");
}

async function stepCloudflare() {
  const who = await wrangler(["whoami"], { quiet: true, nonInteractive: true });
  if (!/not authenticated|not logged in|wrangler login/i.test(who.out) && who.code === 0) return;
  state.need = { kind: "cloudflare-login" }; broadcast();
  addLog("Your browser is opening — log in or create a FREE Cloudflare account, then click Allow.");
  const r = await wrangler(["login"], { timeoutMs: 10 * 60_000 });
  state.need = null; broadcast();
  if (r.code !== 0) throw new StepError("Cloudflare sign-in didn't finish. Click Retry to try again.");
}

async function dbId(): Promise<string | null> {
  const l = await wrangler(["d1", "list", "--json"], { quiet: true, nonInteractive: true });
  const list = findJson(l.out);
  return Array.isArray(list) ? (list.find((d: any) => d?.name === "vex-online")?.uuid ?? null) : null;
}
async function stepDatabase() {
  let id = await dbId();
  if (!id) { await wrangler(["d1", "create", "vex-online"], { nonInteractive: true }); id = await dbId(); }
  if (!id) throw new StepError("Couldn't create the database on Cloudflare. Click Retry.");
  setToml("database_id", id);
  const m = await wrangler(["d1", "migrations", "apply", "vex-online", "--remote"], { nonInteractive: true });
  if (m.code !== 0 && !/No migrations to apply/i.test(m.out)) throw new StepError("Couldn't set up the database tables. Click Retry.");
  return id;
}

async function deployCapture() {
  const d = await wrangler(["deploy"], { nonInteractive: true });
  return { url: d.code === 0 ? findWorkersUrl(d.out) : null, out: d.out };
}
async function stepDeploy() {
  const d = await deployCapture();
  if (d.url) { const url = d.url.replace(/\/+$/, ""); fs.writeFileSync(path.join(workDir(), "deployed-url.txt"), url); return url; }
  if (/workers\.dev subdomain|register a workers\.dev/i.test(d.out)) {
    state.need = { kind: "subdomain" }; broadcast();
    throw new NeedsInput("Pick your workers.dev name on Cloudflare, then click Continue.");
  }
  throw new StepError("Putting the service online failed. Click Retry.");
}

async function stepModrinth(url: string) {
  const secrets = findJson((await wrangler(["secret", "list", "--format", "json"], { quiet: true, nonInteractive: true })).out);
  const hasSecret = Array.isArray(secrets) && secrets.some((s: any) => s?.name === "MODRINTH_CLIENT_SECRET");
  const clientId = getToml("MODRINTH_CLIENT_ID");
  if (hasSecret && clientId && !/REPLACE/.test(clientId) && !modrinthInput) return clientId;
  if (!modrinthInput) {
    state.need = { kind: "modrinth", redirect: `${url}/auth/callback` }; broadcast();
    throw new NeedsInput("Register VEX on Modrinth, then paste the Client ID and Secret.");
  }
  const { clientId: id, secret } = modrinthInput;
  setToml("MODRINTH_CLIENT_ID", id);
  addLog("Saving the Modrinth secret to Cloudflare (it isn't stored on this PC)…");
  const s = await wrangler(["secret", "put", "MODRINTH_CLIENT_SECRET"], { input: secret, nonInteractive: true });
  modrinthInput = null;
  if (s.code !== 0) throw new StepError("Saving the Modrinth secret failed. Check it and try again.");
  const d = await deployCapture();
  if (!d.url) throw new StepError("Redeploying with your Modrinth app failed. Click Retry.");
  return id;
}

async function stepCheck(url: string) {
  for (let i = 0; i < 6; i++) {
    try {
      const r = await fetch(process.env.VEX_SETUP_TEST_HEALTH || `${url}/`, { signal: AbortSignal.timeout(15_000) });
      if (r.ok && (await r.json() as any)?.service === "vex-online") return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new StepError(`The service at ${url} didn't answer. Wait a minute, then click Retry.`);
}

// ---------- runner ----------
export async function startSetup(): Promise<SetupState> {
  if (state.running) return state;
  const keepLog = state.log;
  state = { ...fresh(), log: keepLog.slice(-50), running: true };
  broadcast();
  let current: StepId = "node";
  const step = async <T>(id: StepId, fn: () => Promise<T>, detail?: (r: T) => string) => {
    current = id; setStep(id, "running");
    const r = await fn(); setStep(id, "done", detail?.(r)); return r;
  };
  try {
    await step("node", stepNode, (v) => v);
    await step("tools", stepTools);
    await step("cloudflare", stepCloudflare);
    await step("database", stepDatabase);
    const url = await step("deploy", stepDeploy, (u) => u);
    state.url = url;
    await step("modrinth", () => stepModrinth(url), (id) => `App ${id}`);
    state.need = null;
    await step("check", () => stepCheck(url));
    await step("connect", () => onConnected(url));
    state.finished = true;
    log("info", `VEX online service set up at ${url}`);
  } catch (e: any) {
    if (e instanceof NeedsInput) { setStep(current, "waiting", e.message); }
    else { state.error = e instanceof StepError ? e.message : `Something went wrong: ${e.message}`; setStep(current, "error", state.error); log("warn", `Online setup failed at ${current}: ${e.message}`); }
  } finally { state.running = false; broadcast(); }
  return state;
}

export function provideModrinth(clientId: string, secret: string) {
  const id = String(clientId ?? "").trim(), s = String(secret ?? "").trim();
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) throw new Error("That doesn't look like a Client ID — copy it again from Modrinth.");
  if (s.length < 8 || /\s/.test(s)) throw new Error("That doesn't look like a Client Secret — copy it again from Modrinth.");
  modrinthInput = { clientId: id, secret: s };
  return startSetup();
}

/** How far an earlier setup got (survives restarts — read from the working folder). */
export function setupProgress() {
  const dir = workDir();
  const read = (f: string) => { try { return fs.readFileSync(path.join(dir, f), "utf8").trim(); } catch { return ""; } };
  const toml = read("wrangler.toml");
  const get = (k: string) => new RegExp(`^\\s*${k}\\s*=\\s*"([^"]*)"`, "m").exec(toml)?.[1] ?? "";
  const url = read("deployed-url.txt") || null;
  const database = !!get("database_id") && !/REPLACE/.test(get("database_id"));
  const modrinth = !!get("MODRINTH_CLIENT_ID") && !/REPLACE/.test(get("MODRINTH_CLIENT_ID"));
  return { started: fs.existsSync(path.join(dir, "package.json")), database, deployed: !!url, url, modrinth };
}

export function openHelper(which: "modrinth" | "cloudflare") {
  shell.openExternal(which === "modrinth" ? "https://modrinth.com/settings/applications" : "https://dash.cloudflare.com/?to=/:account/workers-and-pages");
}

// Microsoft accounts and launching Minecraft, built on the game modules from Vex Client 1.2.0
// (msmc for sign-in, minecraft-launcher-core for the game, Mojang's own Java runtimes).
import path from "node:path";
import { app, BrowserWindow, safeStorage } from "electron";
import { log } from "./logger";
import type { Instance } from "../shared/settingsModel";

/* eslint-disable @typescript-eslint/no-var-requires */
const store = require("../game/store");
const auth = require("../game/auth");
const launcher = require("../game/launch");

export interface GameHooks {
  instances(): Instance[];
  updateInstance(id: string, patch: Partial<Instance>): void;
  afterLaunch(): "keep" | "minimize" | "close";
  onLaunched(id: string): void;
  beforeLaunch?(inst: Instance, status: (s: string) => void): Promise<void>;
}
let hooks: GameHooks;

const send = (ev: unknown) => { record(ev); BrowserWindow.getAllWindows().forEach((w) => w.webContents.send("game:event", ev)); };

// ---------- log sessions for the Minecraft Logs window ----------
export interface LogSession { id: string; instanceId: string; name: string; state: "starting" | "running" | "closed"; startedAt: number; endedAt: number | null; code: number | null; lines: string[] }
const MAX_LINES = 8000;
const sessions: LogSession[] = [];
let current: LogSession | null = null;
let onStart: () => void = () => {};
export function onGameStarting(fn: () => void) { onStart = fn; }
function record(ev: any) {
  if (ev?.type === "game" && ev.state === "starting") {
    const inst = hooks.instances().find((i) => i.id === ev.profileId);
    current = { id: `${ev.profileId}-${Date.now()}`, instanceId: ev.profileId, name: inst?.name ?? "Minecraft", state: "starting", startedAt: Date.now(), endedAt: null, code: null, lines: [] };
    sessions.unshift(current); sessions.splice(6);
    onStart();
  } else if (current && ev?.type === "status") {
    current.lines.push(`[VEX] ${ev.text}`);
  } else if (current && ev?.type === "log" && Array.isArray(ev.lines)) {
    current.lines.push(...ev.lines);
    if (current.lines.length > MAX_LINES) current.lines.splice(0, current.lines.length - MAX_LINES);
  } else if (current && ev?.type === "game") {
    if (ev.state === "running") current.state = "running";
    if (ev.state === "closed" || ev.state === "idle") {
      current.state = "closed"; current.endedAt = Date.now(); current.code = ev.code ?? null;
      current.lines.push(ev.state === "closed" ? `[VEX] Minecraft closed${ev.code != null ? ` (exit code ${ev.code})` : ""}.` : "[VEX] Minecraft didn't start.");
      current = null;
    }
  }
}
export const logSessions = () => sessions;

export function initGame(h: GameHooks) {
  hooks = h;
  store.init(path.join(app.getPath("userData"), "game"));
  store.configure({
    instanceDir: (id: string) => hooks.instances().find((i) => i.id === id)?.gameDir ?? null,
    updateInstance: (id: string, patch: { lastPlayed?: number }) => hooks.updateInstance(id, { lastPlayed: patch.lastPlayed ?? Date.now() }),
  });
  auth.init({ safeStorage });
}

// ---------- accounts ----------
export interface MsAccount { uuid: string; name: string; active: boolean; needsLogin: boolean }
export const accountsStatus = (): { secureStorage: boolean; accounts: MsAccount[] } => auth.status();

let loginBusy = false;
export async function addMicrosoftAccount() {
  if (loginBusy) throw new Error("A Microsoft sign-in window is already open.");
  loginBusy = true;
  try {
    const r = await auth.login();          // opens Microsoft's own sign-in page; VEX never sees the password
    log("info", `Microsoft account added: ${r.name}`);
    send({ type: "accounts" });
    return accountsStatus();
  } finally { loginBusy = false; }
}
export function setActiveAccount(uuid: string) { auth.setActive(String(uuid)); send({ type: "accounts" }); return accountsStatus(); }
export function signOutAccount(uuid: string) { auth.signOut(String(uuid)); send({ type: "accounts" }); return accountsStatus(); }
export async function accountSkin(uuid: string) { return auth.skin(String(uuid)); }
export async function accountCapes(uuid: string) { return auth.capes(String(uuid)); }
export async function setAccountCape(uuid: string, id: string | null) { return auth.setCape(String(uuid), id ? String(id) : null); }

/** A fresh Minecraft access token for the active account (used once to prove the account to VEX online). */
export async function activeMinecraftToken(): Promise<{ token: string; name: string; uuid: string } | null> {
  const uuid = store.settings().activeAccount;
  if (!uuid) return null;
  const s = await auth.session(uuid);
  return { token: s.access_token, name: s.name, uuid: String(s.uuid).replace(/-/g, "") };
}

// ---------- game settings ----------
export interface GameSettings { javaPath: string; width: number; height: number; windowMode: "windowed" | "fullscreen" }
export function gameSettings(): GameSettings {
  const s = store.settings();
  return { javaPath: s.javaPath, width: s.width, height: s.height, windowMode: s.windowMode };
}
export function setGameSettings(patch: Partial<GameSettings>) {
  const clean: Partial<GameSettings> = {};
  if (typeof patch.javaPath === "string") clean.javaPath = patch.javaPath.slice(0, 500);
  if (typeof patch.width === "number") clean.width = patch.width;
  if (typeof patch.height === "number") clean.height = patch.height;
  if (patch.windowMode === "windowed" || patch.windowMode === "fullscreen") clean.windowMode = patch.windowMode;
  store.saveSettings(clean);
  return gameSettings();
}

// ---------- launching ----------
export const gameState = () => launcher.state();

export async function launchInstance(id: string, join?: { host: string; port: number }) {
  const inst = hooks.instances().find((i) => i.id === id);
  if (!inst) throw new Error("That instance no longer exists.");
  if (inst.loader === "quilt") throw new Error("Quilt instances can't be launched yet. Use Fabric — almost every Quilt mod also runs on Fabric.");
  const uuid = store.settings().activeAccount;
  if (!uuid) throw new Error("Add a Microsoft account first (the account box at the bottom left).");
  if (join && (!/^[a-zA-Z0-9.-]{1,253}$/.test(join.host) || !(join.port > 0 && join.port < 65536))) throw new Error("That server address isn't valid.");

  send({ type: "status", text: "Signing in to Minecraft…" });
  let session;
  try { session = await auth.session(uuid); }
  catch (e: any) { send({ type: "accounts" }); throw e; }

  log("info", `Launching ${inst.name} (${inst.loader} ${inst.version}) as ${session.name}`);
  await launcher.launch({
    profile: { id: inst.id, name: inst.name, version: inst.version, loader: inst.loader, loaderVersion: "" },
    session,
    emit: (ev: any) => {
      send(ev);
      if (ev?.type === "game" && ev.state === "running") {
        hooks.updateInstance(inst.id, { installed: true, lastPlayed: Date.now() });
        hooks.onLaunched(inst.id);
        const mode = hooks.afterLaunch();
        const win = BrowserWindow.getAllWindows()[0];
        if (mode === "minimize") win?.minimize();
        if (mode === "close") win?.hide();
      }
      if (ev?.type === "game" && ev.state === "closed") {
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isVisible()) win.show();
        if (ev.crashed) log("warn", `Minecraft closed with code ${ev.code} shortly after starting`);
      }
    },
    join,
    beforeLaunch: hooks.beforeLaunch ? (status: (s: string) => void) => hooks.beforeLaunch!(inst, status) : undefined,
    perf: { ram: Math.max(1, Math.round(inst.memoryMb / 1024)), jvmArgs: inst.jvmArgs ? inst.jvmArgs.split(/\s+/).filter((a) => /^-[\w:.+=-]+$/.test(a)) : [] },
  });
}

export function stopGame() { launcher.stop(); }
export const gameLogPath = () => launcher.logPath();

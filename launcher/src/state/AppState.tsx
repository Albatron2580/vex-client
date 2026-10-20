import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_SETTINGS, type LauncherSettings, type Instance } from "../../electron/shared/settingsModel";
import type { AppInfo, AccountState, MsStatus, GameEvent } from "../vex";
import { applyTheme, resolveTheme } from "../lib/theme";
import { hasBridge, vex, errMsg } from "../lib/bridge";
import { translator } from "../lib/i18n";

export type ToastKind = "success" | "error" | "info";
export interface Toast { id: number; kind: ToastKind; title: string; body?: string }
export type PageId = "home" | "instances" | "discover" | "skins" | "features" | "friends" | "collab" | "shop" | "settings" | "admin";

interface Ctx {
  ready: boolean; desktop: boolean;
  settings: LauncherSettings; update(patch: Partial<LauncherSettings>): Promise<void>;
  instances: Instance[]; refreshInstances(): Promise<void>;
  info: AppInfo | null;
  toasts: Toast[]; toast(kind: ToastKind, title: string, body?: string): void; dismiss(id: number): void;
  page: PageId; go(p: PageId): void;
  t: ReturnType<typeof translator>;
  account: AccountState | null;
  ms: MsStatus | null; refreshMs(): Promise<void>;
  game: GameUi; play(id: string, join?: { host: string; port: number }): Promise<void>;
}
export interface GameUi { state: "idle" | "starting" | "running"; profileId?: string; status?: string; task?: { label: string; pct: number | null } }
const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => { const c = useContext(AppCtx); if (!c) throw new Error("useApp outside provider"); return c; };

export function AppProvider({ children }: { children: ReactNode }) {
  const desktop = hasBridge();
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<LauncherSettings>(DEFAULT_SETTINGS);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [page, setPage] = useState<PageId>("home");
  const [account, setAccount] = useState<AccountState | null>(null);
  useEffect(() => { if (!window.vex) return; window.vex.account.get().then(setAccount).catch(() => {}); return window.vex.account.onChange(setAccount); }, []);
  const [ms, setMs] = useState<MsStatus | null>(null);
  const [game, setGame] = useState<GameUi>({ state: "idle" });
  const refreshMs = useCallback(async () => { if (window.vex) setMs(await window.vex.ms.status()); }, []);
  const nextId = useRef(1);
  const settingsRef = useRef(settings); settingsRef.current = settings;

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback((kind: ToastKind, title: string, body?: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-3), { id, kind, title, body }]);
    setTimeout(() => dismiss(id), kind === "error" ? 9000 : 5000);
    if (kind === "error") window.vex?.log("error", `${title}${body ? `: ${body}` : ""}`);
  }, [dismiss]);

  const refreshInstances = useCallback(async () => { if (desktop) setInstances(await vex().instances.list()); }, [desktop]);

  // Microsoft accounts + game state from the main process.
  useEffect(() => {
    if (!window.vex) return;
    refreshMs().catch(() => {});
    window.vex.game.state().then((s) => setGame({ state: s.state, profileId: s.profileId })).catch(() => {});
    const offInst = window.vex.onInstancesChanged(() => { refreshInstances(); });
    const off = window.vex.game.onEvent((ev: GameEvent) => {
      if (ev.type === "accounts") refreshMs();
      else if (ev.type === "status") setGame((g) => ({ ...g, status: ev.text }));
      else if (ev.type === "task") setGame((g) => ({ ...g, task: ev.done ? undefined : { label: ev.label, pct: ev.total ? Math.min(100, Math.floor(((ev.received ?? 0) / ev.total) * 100)) : null } }));
      else if (ev.type === "game") {
        if (ev.state === "starting") setGame({ state: "starting", profileId: ev.profileId, status: "Starting…" });
        else if (ev.state === "running") setGame({ state: "running", profileId: ev.profileId, status: "Minecraft is running" });
        else {
          setGame({ state: "idle" });
          if (ev.state === "closed" && ev.crashed) toast("error", "Minecraft closed right after starting", "Open the game log (Settings → Game) to see why.");
        }
      }
    });
    return () => { off(); offInst(); };
  }, [refreshMs, refreshInstances, toast]);

  const play = useCallback(async (id: string, join?: { host: string; port: number }) => {
    setGame({ state: "starting", profileId: id, status: "Getting ready…" });
    try { await vex().game.launch(id, join); }
    catch (e) { setGame({ state: "idle" }); toast("error", "Couldn't start Minecraft", errMsg(e)); refreshMs(); }
  }, [toast, refreshMs]);

  useEffect(() => {
    (async () => {
      try {
        if (desktop) {
          const [s, i, inf] = await Promise.all([vex().settings.get(), vex().instances.list(), vex().appInfo()]);
          setSettings(s); setInstances(i); setInfo(inf);
        }
      } catch (e) { toast("error", "Couldn't load your settings", errMsg(e)); }
      finally { setReady(true); }
    })();
  }, [desktop, toast]);

  // Settings changed by the main process (e.g. the online setup connecting VEX).
  useEffect(() => window.vex?.onSettingsChanged(setSettings), []);

  // Theme, scale and animation preferences apply live.
  useEffect(() => {
    applyTheme(resolveTheme(settings.themeId, settings.customThemes));
    const root = document.documentElement;
    root.style.setProperty("--ui-scale", String(settings.uiScale));
    root.dataset.anim = settings.animations;
    root.lang = settings.language;
  }, [settings.themeId, settings.customThemes, settings.uiScale, settings.animations, settings.language]);

  const update = useCallback(async (patch: Partial<LauncherSettings>) => {
    const next = { ...settingsRef.current, ...patch };
    setSettings(next); // optimistic
    if (!desktop) return;
    try { setSettings(await vex().settings.set(next)); }
    catch (e) { toast("error", "Couldn't save settings", errMsg(e)); }
  }, [desktop, toast]);

  const value = useMemo<Ctx>(() => ({
    ready, desktop, settings, update, instances, refreshInstances, info, toasts, toast, dismiss, page, go: setPage, t: translator(settings.language), account, ms, refreshMs, game, play,
  }), [ready, desktop, settings, update, instances, refreshInstances, info, toasts, toast, dismiss, page, account, ms, refreshMs, game, play]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

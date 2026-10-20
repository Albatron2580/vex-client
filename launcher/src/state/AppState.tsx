import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_SETTINGS, type LauncherSettings, type Instance } from "../../electron/shared/settingsModel";
import type { AppInfo, AccountState } from "../vex";
import { applyTheme, resolveTheme } from "../lib/theme";
import { hasBridge, vex, errMsg } from "../lib/bridge";
import { translator } from "../lib/i18n";

export type ToastKind = "success" | "error" | "info";
export interface Toast { id: number; kind: ToastKind; title: string; body?: string }
export type PageId = "home" | "instances" | "discover" | "skins" | "features" | "friends" | "shop" | "settings";

interface Ctx {
  ready: boolean; desktop: boolean;
  settings: LauncherSettings; update(patch: Partial<LauncherSettings>): Promise<void>;
  instances: Instance[]; refreshInstances(): Promise<void>;
  info: AppInfo | null;
  toasts: Toast[]; toast(kind: ToastKind, title: string, body?: string): void; dismiss(id: number): void;
  page: PageId; go(p: PageId): void;
  t: ReturnType<typeof translator>;
  account: AccountState | null;
}
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
    ready, desktop, settings, update, instances, refreshInstances, info, toasts, toast, dismiss, page, go: setPage, t: translator(settings.language), account,
  }), [ready, desktop, settings, update, instances, refreshInstances, info, toasts, toast, dismiss, page, account]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

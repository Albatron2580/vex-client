// Pure settings model shared by the main process (disk validation) and the renderer (types).
// No Node or DOM imports here.

export const SETTINGS_SCHEMA_VERSION = 2;

/** Minecraft accounts that see the Admin tab. The VEX online service checks the same list
 *  (server/src/index.ts → DEFAULT_ADMINS) against Mojang before allowing any admin action. */
export const ADMIN_ACCOUNTS = ["HAckerbest11", "RaxMc", "UNCdel"];
export const isAdminName = (name?: string | null) => !!name && ADMIN_ACCOUNTS.some((a) => a.toLowerCase() === name.toLowerCase());

export interface ThemeDef {
  id: string; name: string;
  accent: string; accent2: string; background: string; panel: string; border: string; text: string;
  opacity: number; glow: number; radius: number;
}

export interface SavedCrosshair { id: string; name: string; pixels: (string | null)[]; savedAt: number }

export type AnimationPref = "full" | "reduced" | "off";
export type AfterLaunch = "keep" | "minimize" | "close";

export type TrailStyle = "petals" | "aurora" | "light" | "stardust" | "soft" | "minimal" | "off";
export const TRAIL_STYLES: TrailStyle[] = ["petals", "aurora", "light", "stardust", "soft", "minimal", "off"];
export interface TrailSettings {
  style: TrailStyle;
  length: number; density: number; opacity: number; speed: number; size: number; glow: number; // 0..100
  color: string | null;   // null = the style's own colours
  performance: boolean;   // fewer particles
}
export const DEFAULT_TRAIL: TrailSettings = { style: "petals", length: 70, density: 60, opacity: 85, speed: 60, size: 55, glow: 65, color: null, performance: false };

export interface LauncherSettings {
  schemaVersion: number;
  themeId: string;
  customThemes: ThemeDef[];
  uiScale: number;              // 0.9 | 1 | 1.1 | 1.25
  backgroundEffects: boolean;
  particles: boolean;
  particleIntensity: number;    // 0..100
  animations: AnimationPref;
  language: string;             // "en" | "nl"
  openAtLogin: boolean;
  afterLaunch: AfterLaunch;
  downloadDir: string;          // "" = system Downloads
  minecraftDir: string;         // "" = default .minecraft
  notifications: boolean;
  verboseLogging: boolean;
  crosshairs: SavedCrosshair[];
  recentInstanceIds: string[];
  selectedInstanceId: string | null;
  sidebarCollapsed: boolean;
  trail: TrailSettings;
  onlineServiceUrl: string;   // "" = use the built-in default
  vexMod: boolean;            // put the VEX in-game mod (+ Fabric API) into Fabric instances it supports
}

export const DEFAULT_SETTINGS: LauncherSettings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  themeId: "sakura",
  customThemes: [],
  uiScale: 1,
  backgroundEffects: true,
  particles: true,
  particleIntensity: 45,
  animations: "full",
  language: "en",
  openAtLogin: false,
  afterLaunch: "minimize",
  downloadDir: "",
  minecraftDir: "",
  notifications: true,
  verboseLogging: false,
  crosshairs: [],
  recentInstanceIds: [],
  selectedInstanceId: null,
  sidebarCollapsed: false,
  trail: DEFAULT_TRAIL,
  onlineServiceUrl: "",
  vexMod: true,
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function validateTheme(raw: unknown): ThemeDef | null {
  if (!isObj(raw)) return null;
  const s = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : "");
  const n = (k: string) => (typeof raw[k] === "number" && Number.isFinite(raw[k]) ? (raw[k] as number) : NaN);
  const id = s("id").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
  const name = s("name").trim().slice(0, 40);
  const colors = ["accent", "accent2", "background", "panel", "border", "text"] as const;
  if (!id || !name) return null;
  for (const c of colors) if (!HEX.test(s(c))) return null;
  const opacity = n("opacity"), glow = n("glow"), radius = n("radius");
  if ([opacity, glow, radius].some(Number.isNaN)) return null;
  return {
    id, name,
    accent: s("accent"), accent2: s("accent2"), background: s("background"),
    panel: s("panel"), border: s("border"), text: s("text"),
    opacity: clamp(opacity, 0.3, 1), glow: clamp(glow, 0, 1), radius: Math.round(clamp(radius, 0, 28)),
  };
}

function validateCrosshair(raw: unknown): SavedCrosshair | null {
  if (!isObj(raw) || typeof raw.id !== "string" || typeof raw.name !== "string" || !Array.isArray(raw.pixels)) return null;
  if (raw.pixels.length !== 15 * 15) return null;
  const pixels = raw.pixels.map((p) => (typeof p === "string" && /^#[0-9a-fA-F]{6}$/.test(p) ? p : null));
  return { id: raw.id.slice(0, 64), name: raw.name.slice(0, 40) || "Untitled", pixels, savedAt: typeof raw.savedAt === "number" ? raw.savedAt : Date.now() };
}

/** https:// anywhere, or http:// only for this computer (local testing). */
export function isServiceUrl(u: string): boolean {
  try { const x = new URL(u); return x.protocol === "https:" || (x.protocol === "http:" && ["localhost", "127.0.0.1"].includes(x.hostname)); } catch { return false; }
}

export function validateTrail(raw: unknown): TrailSettings {
  const d = DEFAULT_TRAIL;
  if (!isObj(raw)) return { ...d };
  const pct = (k: keyof TrailSettings) => (typeof raw[k] === "number" && Number.isFinite(raw[k]) ? Math.round(clamp(raw[k] as number, 0, 100)) : (d[k] as number));
  return {
    style: TRAIL_STYLES.includes(raw.style as TrailStyle) ? (raw.style as TrailStyle) : d.style,
    length: pct("length"), density: pct("density"), opacity: pct("opacity"), speed: pct("speed"), size: pct("size"), glow: pct("glow"),
    color: typeof raw.color === "string" && HEX.test(raw.color) ? raw.color : null,
    performance: typeof raw.performance === "boolean" ? raw.performance : d.performance,
  };
}

/** Upgrades older settings files. v1 stored `theme` instead of `themeId` and had no crosshairs. */
export function migrateSettings(raw: Record<string, unknown>): Record<string, unknown> {
  const out = { ...raw };
  const v = typeof out.schemaVersion === "number" ? out.schemaVersion : 1;
  if (v < 2) {
    if (typeof out.theme === "string" && out.themeId === undefined) out.themeId = out.theme;
    delete out.theme;
    if (!Array.isArray(out.crosshairs)) out.crosshairs = [];
  }
  out.schemaVersion = SETTINGS_SCHEMA_VERSION;
  return out;
}

/** Coerces anything into valid settings; unknown or invalid fields fall back to defaults. */
export function validateSettings(input: unknown): LauncherSettings {
  const d = DEFAULT_SETTINGS;
  if (!isObj(input)) return { ...d };
  const r = migrateSettings(input);
  const bool = (k: keyof LauncherSettings) => (typeof r[k] === "boolean" ? (r[k] as boolean) : (d[k] as boolean));
  const str = (k: keyof LauncherSettings, max = 1024) => (typeof r[k] === "string" ? (r[k] as string).slice(0, max) : (d[k] as string));
  const pick = <T extends string>(k: keyof LauncherSettings, allowed: readonly T[]): T =>
    allowed.includes(r[k] as T) ? (r[k] as T) : (d[k] as T);
  const scales = [0.9, 1, 1.1, 1.25];
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    themeId: str("themeId", 40) || d.themeId,
    customThemes: Array.isArray(r.customThemes) ? (r.customThemes.map(validateTheme).filter(Boolean) as ThemeDef[]).slice(0, 50) : [],
    uiScale: scales.includes(r.uiScale as number) ? (r.uiScale as number) : d.uiScale,
    backgroundEffects: bool("backgroundEffects"),
    particles: bool("particles"),
    particleIntensity: typeof r.particleIntensity === "number" ? Math.round(clamp(r.particleIntensity, 0, 100)) : d.particleIntensity,
    animations: pick("animations", ["full", "reduced", "off"] as const),
    language: pick("language", ["en", "nl"] as const),
    openAtLogin: bool("openAtLogin"),
    afterLaunch: pick("afterLaunch", ["keep", "minimize", "close"] as const),
    downloadDir: str("downloadDir"),
    minecraftDir: str("minecraftDir"),
    notifications: bool("notifications"),
    verboseLogging: bool("verboseLogging"),
    crosshairs: Array.isArray(r.crosshairs) ? (r.crosshairs.map(validateCrosshair).filter(Boolean) as SavedCrosshair[]).slice(0, 100) : [],
    recentInstanceIds: Array.isArray(r.recentInstanceIds) ? r.recentInstanceIds.filter((x): x is string => typeof x === "string").slice(0, 8) : [],
    selectedInstanceId: typeof r.selectedInstanceId === "string" ? r.selectedInstanceId : null,
    sidebarCollapsed: bool("sidebarCollapsed"),
    vexMod: bool("vexMod"),
    trail: validateTrail(r.trail),
    onlineServiceUrl: typeof r.onlineServiceUrl === "string" && isServiceUrl(r.onlineServiceUrl) ? r.onlineServiceUrl.replace(/\/+$/, "") : "",
  };
}

// ---------- Instances ----------
export type Loader = "vanilla" | "fabric" | "forge" | "neoforge" | "quilt";
export const LOADERS: Loader[] = ["vanilla", "fabric", "forge", "neoforge", "quilt"];
export interface Instance {
  id: string; name: string; version: string; loader: Loader;
  gameDir: string; memoryMb: number; jvmArgs: string;
  createdAt: number; lastPlayed: number | null;
  installed: boolean;   // true once the game has been downloaded and started
}

export function validateInstance(raw: unknown): Instance | null {
  if (!isObj(raw)) return null;
  const { id, name, version, loader, gameDir, memoryMb, jvmArgs, createdAt, lastPlayed, installed } = raw as Record<string, unknown>;
  if (typeof id !== "string" || typeof name !== "string" || typeof version !== "string" || typeof gameDir !== "string") return null;
  if (!name.trim() || !/^[\w.\- ]{1,40}$/.test(version)) return null;
  return {
    id, name: name.trim().slice(0, 40), version,
    loader: LOADERS.includes(loader as Loader) ? (loader as Loader) : "vanilla",
    gameDir, memoryMb: typeof memoryMb === "number" ? Math.round(clamp(memoryMb, 1024, 32768)) : 4096,
    jvmArgs: typeof jvmArgs === "string" ? jvmArgs.slice(0, 500) : "",
    createdAt: typeof createdAt === "number" ? createdAt : Date.now(),
    lastPlayed: typeof lastPlayed === "number" ? lastPlayed : null,
    installed: installed === true,
  };
}

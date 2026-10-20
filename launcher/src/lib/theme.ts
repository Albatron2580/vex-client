import themesFile from "../../../shared/themes.json";
import { validateTheme, type ThemeDef } from "../../electron/shared/settingsModel";

export const PRESET_THEMES: ThemeDef[] = themesFile.presets;

export function resolveTheme(id: string, custom: ThemeDef[]): ThemeDef {
  return custom.find((t) => t.id === id) ?? PRESET_THEMES.find((t) => t.id === id) ?? PRESET_THEMES[0];
}

export function applyTheme(t: ThemeDef, root: HTMLElement = document.documentElement) {
  const set = (k: string, v: string) => root.style.setProperty(k, v);
  set("--accent", t.accent); set("--accent-2", t.accent2); set("--bg", t.background); set("--panel", t.panel);
  set("--border", t.border); set("--text", t.text); set("--panel-alpha", String(t.opacity)); set("--glow", String(t.glow)); set("--radius", `${t.radius}px`);
}

/** Export format: { schemaVersion: 1, theme: ThemeDef } — see shared/theme.schema.json. */
export const exportTheme = (t: ThemeDef) => JSON.stringify({ schemaVersion: 1, theme: t }, null, 2);
export function importTheme(json: string): ThemeDef {
  let parsed: any;
  try { parsed = JSON.parse(json); } catch { throw new Error("That file isn't valid JSON."); }
  const t = validateTheme(parsed?.theme ?? parsed);
  if (!t) throw new Error("That file isn't a VEX theme (missing a name or a #rrggbb colour).");
  return t;
}

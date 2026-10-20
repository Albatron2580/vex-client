import os from "node:os";
import path from "node:path";
import { app } from "electron";

export function defaultMinecraftDir(): string {
  if (process.platform === "win32") return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), ".minecraft");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "minecraft");
  return path.join(os.homedir(), ".minecraft");
}
export const instancesRoot = () => path.join(app.getPath("userData"), "instances");

/** Safe file name for anything we write: no path separators, no reserved Windows characters. */
export function safeFileName(name: string, ext: string): string {
  const base = name.replace(/\.[a-z0-9]+$/i, "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/\s+/g, " ").trim().slice(0, 60) || "vex";
  return `${base}${ext}`;
}
export function isInside(child: string, parent: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

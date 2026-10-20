import fs from "node:fs";
import path from "node:path";
import { app, shell } from "electron";
import { log } from "./logger";

// Desktop / Start menu shortcuts. Windows only (shell.writeShortcutLink is a Windows API).
const NAME = "VEX CLIENT.lnk";
const where = (kind: "desktop" | "startMenu") =>
  kind === "desktop" ? path.join(app.getPath("desktop"), NAME)
    : path.join(app.getPath("appData"), "Microsoft", "Windows", "Start Menu", "Programs", NAME);

export interface ShortcutStatus { supported: boolean; packaged: boolean; desktop: boolean; startMenu: boolean }

export function shortcutStatus(): ShortcutStatus {
  const supported = process.platform === "win32";
  return { supported, packaged: app.isPackaged, desktop: supported && fs.existsSync(where("desktop")), startMenu: supported && fs.existsSync(where("startMenu")) };
}

export function setShortcut(kind: "desktop" | "startMenu", enabled: boolean): ShortcutStatus {
  if (process.platform !== "win32") throw new Error("Shortcuts can only be made on Windows.");
  if (!app.isPackaged) throw new Error("Shortcuts point to the installed VEX CLIENT.exe, so this only works in the installed app (not in dev mode).");
  const file = where(kind);
  if (enabled) {
    const exe = process.execPath; // the installed VEX CLIENT.exe, which carries the VEX icon
    const ok = shell.writeShortcutLink(file, fs.existsSync(file) ? "replace" : "create", {
      target: exe, cwd: path.dirname(exe), icon: exe, iconIndex: 0, description: "VEX CLIENT — Play different",
      appUserModelId: "net.vexclient.launcher",
    });
    if (!ok || !fs.existsSync(file)) throw new Error("Windows didn't let VEX create the shortcut. Antivirus or folder permissions may be blocking it.");
    log("info", `Created ${kind} shortcut ${file}`);
  } else {
    fs.rmSync(file, { force: true });
    log("info", `Removed ${kind} shortcut ${file}`);
  }
  return shortcutStatus();
}

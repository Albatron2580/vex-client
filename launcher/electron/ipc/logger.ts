import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

let verbose = false;
let logFile = "";

export function initLogger() {
  const dir = path.join(app.getPath("userData"), "logs");
  fs.mkdirSync(dir, { recursive: true });
  logFile = path.join(dir, "launcher.log");
  // Rotate once the log passes 2 MB so diagnostics never grow unbounded.
  try { if (fs.statSync(logFile).size > 2_000_000) fs.renameSync(logFile, logFile + ".old"); } catch { /* no log yet */ }
  log("info", `VEX CLIENT ${app.getVersion()} starting (electron ${process.versions.electron}, ${process.platform})`);
}
export const logsDir = () => path.dirname(logFile);
export const setVerbose = (v: boolean) => { verbose = v; };

export function log(level: "debug" | "info" | "warn" | "error", msg: string) {
  if (level === "debug" && !verbose) return;
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${msg}\n`;
  if (level === "error") process.stderr.write(line); else process.stdout.write(line);
  try { fs.appendFileSync(logFile, line); } catch { /* disk issues must not crash the app */ }
}

import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { log } from "./logger";

/** Atomic JSON file store in the user-data folder: write to .tmp then rename, keep a .bak of the last good copy. */
export function readJson(name: string): unknown {
  const file = path.join(app.getPath("userData"), name);
  for (const candidate of [file, file + ".bak"]) {
    try { return JSON.parse(fs.readFileSync(candidate, "utf8")); }
    catch (e: any) { if (e.code !== "ENOENT") log("warn", `Could not read ${candidate}: ${e.message}`); }
  }
  return undefined;
}

export function writeJson(name: string, data: unknown) {
  const file = path.join(app.getPath("userData"), name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  if (fs.existsSync(file)) fs.copyFileSync(file, file + ".bak");
  fs.renameSync(tmp, file);
}

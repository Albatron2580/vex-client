import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { app } from "electron";
import { log } from "./logger";

export interface LibrarySkin { id: string; name: string; model: "classic" | "slim"; addedAt: number; dataUrl: string }
const dir = () => path.join(app.getPath("userData"), "skins");
const indexFile = () => path.join(dir(), "index.json");

function readIndex(): Omit<LibrarySkin, "dataUrl">[] {
  try { const j = JSON.parse(fs.readFileSync(indexFile(), "utf8")); return Array.isArray(j) ? j : []; } catch { return []; }
}
const writeIndex = (i: Omit<LibrarySkin, "dataUrl">[]) => { fs.mkdirSync(dir(), { recursive: true }); fs.writeFileSync(indexFile(), JSON.stringify(i, null, 2)); };

export function listSkins(): LibrarySkin[] {
  return readIndex().flatMap((s) => {
    try { return [{ ...s, dataUrl: `data:image/png;base64,${fs.readFileSync(path.join(dir(), `${s.id}.png`)).toString("base64")}` }]; }
    catch { return []; }
  });
}

export function addSkin(name: string, model: string, bytes: Uint8Array): LibrarySkin {
  const buf = Buffer.from(bytes);
  if (buf.length > 512 * 1024 || buf.subarray(1, 4).toString() !== "PNG") throw new Error("Only PNG skins up to 512 KB can be saved.");
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  if (w !== 64 || (h !== 64 && h !== 32)) throw new Error(`Skins must be 64×64 or 64×32 — this one is ${w}×${h}.`);
  const entry = { id: crypto.randomUUID(), name: String(name).trim().slice(0, 40) || "Skin", model: model === "slim" ? "slim" as const : "classic" as const, addedAt: Date.now() };
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(path.join(dir(), `${entry.id}.png`), buf);
  writeIndex([...readIndex(), entry]);
  log("info", `Added skin ${entry.name} to library`);
  return { ...entry, dataUrl: `data:image/png;base64,${buf.toString("base64")}` };
}

export function removeSkin(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return false;
  fs.rmSync(path.join(dir(), `${id}.png`), { force: true });
  writeIndex(readIndex().filter((s) => s.id !== id));
  return true;
}

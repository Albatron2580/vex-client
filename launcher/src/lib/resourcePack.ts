import JSZip from "jszip";
import { encodePng } from "./png";
import { scaleUp, type Rgba } from "./pixels";
import { resizeBilinear } from "./resize";
import { packMcmeta, type PackTarget } from "./packFormats";

export interface PackFile { path: string; image: Rgba }
export interface PackText { path: string; text: string }

/** Builds a resource-pack zip: pack.mcmeta + pack.png + the given textures. */
export async function buildResourcePack(opts: { target: PackTarget; description: string; icon: Rgba; files: PackFile[]; texts?: PackText[] }): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("pack.mcmeta", packMcmeta(opts.target, opts.description));
  // Large icons (e.g. sky faces) are shrunk to 128px; small pixel art is scaled up crisply.
  const big = Math.max(opts.icon.width, opts.icon.height) > 128;
  const factor = big ? 1 : Math.max(1, Math.floor(64 / Math.max(opts.icon.width, opts.icon.height)));
  zip.file("pack.png", encodePng(big ? resizeBilinear(opts.icon, 0, 0, opts.icon.width, opts.icon.height, 128, Math.round(128 * opts.icon.height / opts.icon.width)) : scaleUp(opts.icon, factor)));
  for (const f of opts.files) {
    if (!/^assets\/minecraft\/(textures|optifine\/sky)\/[a-z0-9_/]+\.png$/.test(f.path)) throw new Error(`Refusing unexpected pack path ${f.path}`);
    zip.file(f.path, encodePng(f.image));
  }
  for (const t of opts.texts ?? []) {
    if (!/^assets\/minecraft\/optifine\/sky\/[a-z0-9_/]+\.properties$/.test(t.path)) throw new Error(`Refusing unexpected pack path ${t.path}`);
    zip.file(t.path, t.text);
  }
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

export const TOTEM_TEXTURE = "assets/minecraft/textures/item/totem_of_undying.png";
export const CROSSHAIR_TEXTURE = "assets/minecraft/textures/gui/sprites/hud/crosshair.png";

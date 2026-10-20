import { describe, it, expect } from "vitest";
import zlib from "node:zlib";
import JSZip from "jszip";
import { encodePng, crc32 } from "../src/lib/png";
import { createImage, setPx, getPx, type Rgba } from "../src/lib/pixels";
import { PACK_TARGETS, findTarget, packMcmeta, targetForVersion } from "../src/lib/packFormats";
import { renderTotem, renderFrontView, validateSkin } from "../src/features/totem/totemLayout";
import { generate, mirroredCells, paint, emptyPixels, idx, PRESETS, toImage, addOutline, DEFAULT_PARAMS } from "../src/features/crosshair/crosshairModel";
import { buildResourcePack, TOTEM_TEXTURE, CROSSHAIR_TEXTURE } from "../src/lib/resourcePack";
import { validateSettings, validateTheme, validateInstance, DEFAULT_SETTINGS } from "../electron/shared/settingsModel";
import themes from "../../shared/themes.json";

/** Decodes our own PNG output (filter 0 only) to verify it round-trips. */
function decodePng(bytes: Uint8Array): Rgba {
  const buf = Buffer.from(bytes);
  expect(buf.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  let off = 8, w = 0, h = 0; const idat: Buffer[] = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    expect(buf.readUInt32BE(off + 8 + len)).toBe(crc32(new Uint8Array(buf.subarray(off + 4, off + 8 + len))));
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); }
    if (type === "IDAT") idat.push(data);
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)); // throws if the zlib stream is invalid
  const img = createImage(w, h);
  for (let y = 0; y < h; y++) img.data.set(raw.subarray(y * (w * 4 + 1) + 1, (y + 1) * (w * 4 + 1)), y * w * 4);
  return img;
}

/** Synthetic skin where every body part has a distinct solid colour. */
function testSkin(height = 64): Rgba {
  const s = createImage(64, height);
  const fill = (x: number, y: number, w: number, h: number, c: number[]) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) setPx(s, x + i, y + j, c); };
  fill(8, 8, 8, 8, [255, 0, 0, 255]);     // face: red
  fill(20, 20, 8, 12, [0, 255, 0, 255]);  // body: green
  fill(44, 20, 4, 12, [0, 0, 255, 255]);  // right arm: blue
  fill(4, 20, 4, 12, [255, 255, 0, 255]); // right leg: yellow
  if (height === 64) { fill(36, 52, 4, 12, [0, 255, 255, 255]); fill(20, 52, 4, 12, [255, 0, 255, 255]); }
  return s;
}

describe("PNG encoder", () => {
  it("round-trips pixels exactly", () => {
    const img = createImage(15, 15);
    setPx(img, 7, 7, [255, 105, 180, 255]); setPx(img, 0, 14, [1, 2, 3, 128]);
    const out = decodePng(encodePng(img));
    expect(out.width).toBe(15); expect(out.height).toBe(15);
    expect([...out.data]).toEqual([...img.data]);
  });
  it("handles images larger than one stored deflate block", () => {
    const img = createImage(200, 100); img.data.fill(77);
    expect([...decodePng(encodePng(img)).data]).toEqual([...img.data]);
  });
});

describe("pack formats", () => {
  it("knows 1.21.11 is format 75 and uses min/max_format", () => {
    const t = findTarget("1.21.11");
    expect(t.format).toBe(75);
    expect(JSON.parse(packMcmeta(t, "x")).pack).toEqual({ description: "x", min_format: 75, max_format: 75 });
  });
  it("uses pack_format only before 1.21.9", () => {
    expect(JSON.parse(packMcmeta(findTarget("1.21.4"), "x")).pack).toEqual({ pack_format: 46, description: "x" });
  });
  it("maps instance versions to targets", () => {
    expect(targetForVersion("1.21.11")?.format).toBe(75);
    expect(targetForVersion("1.21.10")?.format).toBe(69);
    expect(targetForVersion("1.20.4")?.format).toBe(22);
    expect(targetForVersion("1.21")?.format).toBe(34);
    expect(targetForVersion("1.8.9")).toBeNull();
  });
  it("has unique, descending formats", () => {
    const f = PACK_TARGETS.map((t) => t.format);
    expect(new Set(f).size).toBe(f.length);
    expect([...f].sort((a, b) => b - a)).toEqual(f);
  });
});

describe("totem renderer", () => {
  it("rejects wrong-size skins with a clear message", () => {
    expect(validateSkin(createImage(32, 32))).toMatch(/64×64/);
    expect(() => renderTotem(createImage(16, 16), "classic")).toThrow(/64×64/);
  });
  it("classic layout puts face, body, arms and legs in place", () => {
    const t = renderTotem(testSkin(), "classic");
    expect(t.width).toBe(16);
    expect(getPx(t, 8, 4)).toEqual([255, 0, 0, 255]);   // face
    expect(getPx(t, 7, 10)).toEqual([0, 255, 0, 255]);  // body
    expect(getPx(t, 3, 10)).toEqual([0, 0, 255, 255]);  // right arm
    expect(getPx(t, 12, 10)).toEqual([0, 255, 255, 255]); // left arm (64x64 has its own)
    expect(getPx(t, 6, 14)).toEqual([255, 255, 0, 255]); // right leg
    expect(getPx(t, 0, 0)[3]).toBe(0);                   // corners transparent
  });
  it("arms-out extends arms horizontally; big-head has a 10px head", () => {
    expect(getPx(renderTotem(testSkin(), "arms-out"), 1, 9)).toEqual([0, 0, 255, 255]);
    const big = renderTotem(testSkin(), "big-head");
    expect(getPx(big, 3, 0)).toEqual([255, 0, 0, 255]);
    expect(getPx(big, 12, 9)).toEqual([255, 0, 0, 255]);
  });
  it("legacy 64x32 skins mirror the right arm/leg", () => {
    const t = renderTotem(testSkin(32), "classic");
    expect(getPx(t, 12, 10)).toEqual([0, 0, 255, 255]);
    expect(getPx(t, 9, 14)).toEqual([255, 255, 0, 255]);
  });
  it("front view is 16x32", () => {
    const f = renderFrontView(testSkin());
    expect([f.width, f.height]).toEqual([16, 32]);
    expect(getPx(f, 8, 4)).toEqual([255, 0, 0, 255]);
  });
});

describe("crosshair", () => {
  it("mirrors in all four quadrants without duplicates", () => {
    expect(mirroredCells(2, 3, "xy").length).toBe(4);
    expect(mirroredCells(7, 7, "xy")).toEqual([[7, 7]]);
    const p = paint(emptyPixels(), 0, 0, "#ff0000", "x");
    expect(p[idx(0, 0)]).toBe("#ff0000"); expect(p[idx(14, 0)]).toBe("#ff0000"); expect(p[idx(0, 14)]).toBeNull();
  });
  it("respects the centre gap", () => {
    const p = generate({ ...DEFAULT_PARAMS, gap: 2, size: 3 });
    expect(p[idx(7, 7)]).toBeNull(); expect(p[idx(9, 7)]).toBeNull();
    expect(p[idx(10, 7)]).toBe("#ffffff"); expect(p[idx(12, 7)]).toBe("#ffffff"); expect(p[idx(13, 7)]).toBeNull();
  });
  it("outline surrounds pixels without replacing them", () => {
    const base = paint(emptyPixels(), 7, 7, "#ffffff", "off");
    const o = addOutline(base, "#000000");
    expect(o[idx(7, 7)]).toBe("#ffffff"); expect(o[idx(8, 7)]).toBe("#000000"); expect(o[idx(8, 8)]).toBeNull();
  });
  it("every preset draws something inside the 15x15 grid", () => {
    for (const pr of PRESETS) {
      const px = generate(pr.params);
      expect(px.length).toBe(225);
      expect(px.some(Boolean)).toBe(true);
    }
  });
});

describe("resource pack zip", () => {
  it("contains mcmeta, icon and the texture at the vanilla path", async () => {
    const tex = renderTotem(testSkin(), "classic");
    const bytes = await buildResourcePack({ target: findTarget("1.21.11"), description: "VEX", icon: tex, files: [{ path: TOTEM_TEXTURE, image: tex }] });
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files).sort()).toEqual(["assets/", "assets/minecraft/", "assets/minecraft/textures/", "assets/minecraft/textures/item/", TOTEM_TEXTURE, "pack.mcmeta", "pack.png"].sort());
    const icon = decodePng(await zip.file("pack.png")!.async("uint8array"));
    expect(icon.width).toBe(64);
    expect(JSON.parse(await zip.file("pack.mcmeta")!.async("string")).pack.min_format).toBe(75);
  });
  it("refuses paths outside minecraft textures", async () => {
    const img = toImage(emptyPixels());
    await expect(buildResourcePack({ target: findTarget("1.21.11"), description: "x", icon: img, files: [{ path: "../evil.png", image: img }] })).rejects.toThrow();
    await expect(buildResourcePack({ target: findTarget("1.21.11"), description: "x", icon: img, files: [{ path: CROSSHAIR_TEXTURE, image: img }] })).resolves.toBeInstanceOf(Uint8Array);
  });
});

describe("settings & themes", () => {
  it("garbage input yields defaults", () => {
    expect(validateSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(validateSettings({ uiScale: 7, particleIntensity: 900, animations: "wild" })).toMatchObject({ uiScale: 1, particleIntensity: 100, animations: "full" });
  });
  it("migrates v1 settings", () => {
    const s = validateSettings({ schemaVersion: 1, theme: "rose", particles: false });
    expect(s.themeId).toBe("rose"); expect(s.particles).toBe(false); expect(s.schemaVersion).toBe(2);
  });
  it("all shipped presets pass validation", () => {
    for (const t of themes.presets) expect(validateTheme(t)).toEqual(t);
  });
  it("rejects themes with bad colours and clamps ranges", () => {
    expect(validateTheme({ ...themes.presets[0], accent: "pink" })).toBeNull();
    expect(validateTheme({ ...themes.presets[0], radius: 99, opacity: 0 })).toMatchObject({ radius: 28, opacity: 0.3 });
  });
  it("instances need a name and clamp memory", () => {
    expect(validateInstance({ id: "a", name: " ", version: "1.21.11", gameDir: "" })).toBeNull();
    expect(validateInstance({ id: "a", name: "PvP", version: "1.21.11", gameDir: "", memoryMb: 100 })?.memoryMb).toBe(1024);
    expect(validateInstance({ id: "a", name: "PvP", version: "1.21.11", gameDir: "", installed: "yes" })?.installed).toBe(false);
  });
});

import { buildSky, makeSeamless, skyProperties } from "../src/features/sky/skyBuilder";
describe("custom sky", () => {
  const photo = () => {
    const img = createImage(300, 160);
    for (let y = 0; y < 160; y++) for (let x = 0; x < 300; x++) setPx(img, x, y, [128 + 100 * Math.sin(x / 30), y, 128 + 80 * Math.cos(x / 45 + y / 20), 255]);
    return img;
  };
  it("produces a 3x2 texture of square faces", () => {
    const { texture, side, top } = buildSky(photo(), { face: 64, horizon: 0.75, stars: true });
    expect([texture.width, texture.height]).toEqual([192, 128]);
    expect([side.width, side.height, top.width]).toEqual([64, 64, 64]);
    expect(texture.data.every((_, i) => i % 4 !== 3 || texture.data[i] === 255)).toBe(true); // fully opaque
  });
  it("side faces tile seamlessly left↔right", () => {
    const { side } = buildSky(photo(), { face: 64, horizon: 0.75, stars: false });
    let diff = 0;
    for (let y = 0; y < 64; y++) { const l = getPx(side, 0, y), r = getPx(side, 63, y); diff += Math.abs(l[0] - r[0]) + Math.abs(l[1] - r[1]) + Math.abs(l[2] - r[2]); }
    expect(diff / 64).toBeLessThan(25);
  });
  it("zenith edges match the top row of the side faces", () => {
    const { side, top } = buildSky(photo(), { face: 64, horizon: 0.75, stars: false });
    const s = getPx(side, 30, 0), t = getPx(top, 30, 0);
    for (let c = 0; c < 3; c++) expect(Math.abs(s[c] - t[c])).toBeLessThan(6);
  });
  it("seamless strip loses only the overlap", () => { expect(makeSeamless(photo(), 0.2).width).toBe(240); });
  it("rejects tiny images", () => { expect(() => buildSky(createImage(10, 10), { horizon: 0.7, stars: false })).toThrow(/too small/); });
  it("writes OptiFine properties", () => {
    expect(skyProperties({ nightOnly: false, rotate: false })).toContain("rotate=false");
    expect(skyProperties({ nightOnly: true, rotate: true })).toMatch(/startFadeIn=17:30[\s\S]*endFadeOut=06:30/);
  });
  it("packs sky texture and properties", async () => {
    const sky = buildSky(photo(), { face: 64, horizon: 0.75, stars: true });
    const bytes = await buildResourcePack({ target: findTarget("1.21.11"), description: "sky", icon: sky.side,
      files: [{ path: "assets/minecraft/optifine/sky/world0/sky1.png", image: sky.texture }],
      texts: [{ path: "assets/minecraft/optifine/sky/world0/sky1.properties", text: skyProperties({ nightOnly: false, rotate: false }) }] });
    const zip = await JSZip.loadAsync(bytes);
    expect(zip.file("assets/minecraft/optifine/sky/world0/sky1.properties")).toBeTruthy();
    expect(decodePng(await zip.file("assets/minecraft/optifine/sky/world0/sky1.png")!.async("uint8array")).width).toBe(192);
  });
});

import { compareVersions, pickUpdate, parseChecksum } from "../electron/shared/updateLogic";
describe("updater logic", () => {
  const rel = (tag: string, names: string[], extra: Partial<{ draft: boolean; prerelease: boolean }> = {}) => ({
    tag_name: tag, draft: false, prerelease: false, body: "notes", ...extra,
    assets: names.map((n) => ({ name: n, size: 10, browser_download_url: `https://github.com/Albatron2580/vex-client/releases/download/${tag}/${n}` })),
  });
  it("compares versions numerically", () => {
    expect(compareVersions("0.10.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareVersions("v1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("garbage", "0.1.0")).toBe(0);
  });
  it("only offers newer, non-draft releases that include a checksum", () => {
    expect(pickUpdate(rel("v0.5.0", ["VEX-CLIENT-Setup-0.5.0.exe", "VEX-CLIENT-Setup-0.5.0.exe.sha256"]), "0.4.0")?.version).toBe("0.5.0");
    expect(pickUpdate(rel("v0.4.0", ["VEX-CLIENT-Setup-0.4.0.exe", "VEX-CLIENT-Setup-0.4.0.exe.sha256"]), "0.4.0")).toBeNull();
    expect(pickUpdate(rel("v0.5.0", ["VEX-CLIENT-Setup-0.5.0.exe"]), "0.4.0")).toBeNull();
    expect(pickUpdate(rel("v0.5.0", ["VEX-CLIENT-Setup-0.5.0.exe", "VEX-CLIENT-Setup-0.5.0.exe.sha256"], { prerelease: true }), "0.4.0")).toBeNull();
  });
  it("rejects downloads from other hosts", () => {
    const r = rel("v0.5.0", ["VEX-CLIENT-Setup-0.5.0.exe", "VEX-CLIENT-Setup-0.5.0.exe.sha256"]);
    r.assets[0].browser_download_url = "https://evil.example/VEX-CLIENT-Setup-0.5.0.exe";
    expect(pickUpdate(r, "0.4.0")).toBeNull();
  });
  it("parses checksum files", () => {
    const h = "a".repeat(64);
    expect(parseChecksum(`${h}  VEX-CLIENT-Setup-0.5.0.exe`)).toBe(h);
    expect(parseChecksum("nope")).toBeNull();
  });
});

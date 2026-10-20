import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import initSqlJs from "sql.js";
import { findModrinth, findCurseForge, findPrismLike, findVanilla, findInFolder, copyParts, normalizeLoader, measure } from "../electron/ipc/importers";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vex-import-"));
const w = (p: string, c = "x") => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const loadSql = () => initSqlJs() as any;

beforeAll(async () => {
  // Modrinth App
  const mr = path.join(tmp, "ModrinthApp");
  w(path.join(mr, "profiles", "PvP Pack", "mods", "sodium.jar"), "jar");
  w(path.join(mr, "profiles", "PvP Pack", "options.txt"), "key_key.attack:key.mouse.left");
  w(path.join(mr, "profiles", "PvP Pack", "saves", "World1", "level.dat"), "lvl");
  fs.mkdirSync(path.join(mr, "profiles", "Old One"), { recursive: true });
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run("CREATE TABLE profiles (path TEXT PRIMARY KEY, name TEXT, game_version TEXT, mod_loader TEXT)");
  db.run("INSERT INTO profiles VALUES ('PvP Pack', 'PvP Pack', '1.21.11', 'fabric')");
  fs.writeFileSync(path.join(mr, "app.db"), Buffer.from(db.export()));
  // CurseForge
  w(path.join(tmp, "cf", "Survival+", "minecraftinstance.json"), JSON.stringify({ name: "Survival+", gameVersion: "1.20.1", baseModLoader: { name: "forge-47.2.0" } }));
  w(path.join(tmp, "cf", "Survival+", "mods", "a.jar"));
  w(path.join(tmp, "cf", "Survival+", "config", "a.toml"));
  // Prism
  w(path.join(tmp, "prism", "inst1", "instance.cfg"), "[General]\nname=Fabulous\nIntendedVersion=1.21.4\n");
  w(path.join(tmp, "prism", "inst1", "mmc-pack.json"), JSON.stringify({ components: [{ uid: "net.minecraft", version: "1.21.4" }, { uid: "net.fabricmc.fabric-loader", version: "0.16.9" }] }));
  w(path.join(tmp, "prism", "inst1", "minecraft", "resourcepacks", "pack.zip"));
  // Vanilla
  w(path.join(tmp, ".minecraft", "options.txt"), "fov:0.5");
  w(path.join(tmp, ".minecraft", "launcher_profiles.json"), JSON.stringify({ profiles: { a: { lastVersionId: "fabric-loader-0.16.9-1.21.11", lastUsed: "2026-10-01T00:00:00Z" } } }));
});

describe("importers", () => {
  it("reads Modrinth App profiles and their metadata", async () => {
    const found = await findModrinth(path.join(tmp, "ModrinthApp"), loadSql);
    const pvp = found.find((f) => f.name === "PvP Pack")!;
    expect(pvp).toMatchObject({ version: "1.21.11", loader: "fabric", source: "modrinth" });
    expect(pvp.parts).toMatchObject({ mods: true, settings: true, worlds: true, config: false });
    expect(found.find((f) => f.name === "Old One")?.version).toBeNull();
  });
  it("reads CurseForge, Prism and vanilla", () => {
    expect(findCurseForge(path.join(tmp, "cf"))[0]).toMatchObject({ name: "Survival+", version: "1.20.1", loader: "forge" });
    expect(findPrismLike(path.join(tmp, "prism"), "prism")[0]).toMatchObject({ name: "Fabulous", version: "1.21.4", loader: "fabric", parts: { resourcepacks: true } });
    expect(findVanilla(path.join(tmp, ".minecraft"))[0]).toMatchObject({ version: "1.21.11", loader: "fabric" });
    expect(findCurseForge(path.join(tmp, "nope"))).toEqual([]);
  });
  it("recognises a picked instance folder", () => {
    expect(findInFolder(path.join(tmp, "cf", "Survival+"))[0]?.name).toBe("Survival+");
    expect(findInFolder(path.join(tmp, "prism"))[0]?.name).toBe("Fabulous");
  });
  it("normalises loader names", () => {
    expect(["neoforge-21.1", "forge-47", "quilt", "fabric-loader", ""].map(normalizeLoader)).toEqual(["neoforge", "forge", "quilt", "fabric", "vanilla"]);
  });
  it("copies only the chosen parts and leaves the source untouched", async () => {
    const pvp = (await findModrinth(path.join(tmp, "ModrinthApp"), loadSql)).find((f) => f.name === "PvP Pack")!;
    const before = fs.readdirSync(pvp.gameDir).sort();
    const dest = path.join(tmp, "vex", "inst");
    expect(measure(pvp, ["mods", "settings"])).toBeGreaterThan(0);
    const steps: string[] = [];
    const r = await copyParts(pvp, ["mods", "settings"], dest, (_d, _t, item) => steps.push(item));
    expect(r.copied.sort()).toEqual(["mods", "options.txt"]);
    expect(fs.readFileSync(path.join(dest, "mods", "sodium.jar"), "utf8")).toBe("jar");
    expect(fs.existsSync(path.join(dest, "saves"))).toBe(false);
    expect(fs.readdirSync(pvp.gameDir).sort()).toEqual(before);
    await expect(copyParts(pvp, ["mods"], path.join(pvp.gameDir, "inner"), () => {})).rejects.toThrow(/itself/);
  });
});

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import initSqlJs from "sql.js";
import { findNoRisk, findVanilla, copyModJars, modJars } from "../electron/ipc/importers";

const w = (p: string, c = "x") => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const loadSql = () => initSqlJs() as any;

describe("NoRisk Client + copying mods into an instance", () => {
  it("reads NoRisk profiles from its database and finds the nrc-* mods folder", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vex-nrc-"));
    w(path.join(root, "data", "profiles", "PvP", "mods", "nrc-1.21.11-fabric", "sodium.jar"), "jar");
    w(path.join(root, "data", "profiles", "PvP", "mods", "nrc-1.21.11-fabric", "iris.jar"), "jar");
    w(path.join(root, "data", "profiles", "PvP", "options.txt"), "fov:1");
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run("CREATE TABLE profiles (id TEXT, name TEXT, path TEXT, game_version TEXT, loader TEXT, group_name TEXT, use_shared_minecraft_folder INTEGER)");
    db.run("INSERT INTO profiles VALUES ('12345678-0000-0000-0000-0000000000ab', 'My PvP', 'PvP', '1.21.11', 'fabric', NULL, 0)");
    w(path.join(root, "meta", "app.db"), "");
    fs.writeFileSync(path.join(root, "meta", "app.db"), Buffer.from(db.export()));
    const [p] = await findNoRisk(root, loadSql);
    expect(p).toMatchObject({ source: "norisk", name: "My PvP", version: "1.21.11", loader: "fabric" });
    expect(modJars(p).map((f) => path.basename(f)).sort()).toEqual(["iris.jar", "sodium.jar"]);

    // without a database it still finds the folder
    fs.rmSync(path.join(root, "meta"), { recursive: true });
    const [q] = await findNoRisk(root, loadSql);
    expect(q).toMatchObject({ version: "1.21.11", loader: "fabric" });
    expect(modJars(q)).toHaveLength(2);
  });

  it("copies mods into an existing instance, flattening version folders and skipping ones already there", async () => {
    const mc = fs.mkdtempSync(path.join(os.tmpdir(), "vex-mc-"));
    w(path.join(mc, "mods", "a.jar"), "a");
    w(path.join(mc, "mods", "1.21.11", "b.jar"), "b");
    w(path.join(mc, "mods", "1.20.1", "old.jar"), "old");
    w(path.join(mc, "launcher_profiles.json"), JSON.stringify({ profiles: { x: { lastVersionId: "fabric-loader-0.16.9-1.21.11", lastUsed: "2026-10-01" } } }));
    const [v] = findVanilla(mc);
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), "vex-dest-"));
    w(path.join(dest, "mods", "a.jar.disabled"), "mine");
    const r = await copyModJars(v, dest);
    expect(r).toMatchObject({ added: 1, skipped: 1 });
    expect(fs.readdirSync(path.join(dest, "mods")).sort()).toEqual(["a.jar.disabled", "b.jar"]);
    expect(fs.readFileSync(path.join(mc, "mods", "a.jar"), "utf8")).toBe("a"); // source untouched
  });
});

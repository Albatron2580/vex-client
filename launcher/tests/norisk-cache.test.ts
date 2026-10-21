import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import initSqlJs from "sql.js";
import { findNoRisk, modJars, copyParts } from "../electron/ipc/importers";

const w = (p: string, c = "x") => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

describe("NoRisk Client mods kept in its shared mod cache", () => {
  it("finds them through profile_mods (also while NoRisk has changes in the -wal file) and imports them", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vex-nrc-cache-"));
    const id = "6f1c2a4e-0000-4000-8000-00000000abcd";
    w(path.join(root, "data", "profiles", "nrc-1.21.11", "options.txt"), "fov:1");
    w(path.join(root, "meta", "mod_cache", "sodium-fabric-0.6.jar"), "sodium");
    w(path.join(root, "meta", "mod_cache", "iris-1.8.jar"), "iris");
    w(path.join(root, "meta", "mod_cache", "other-profile.jar"), "nope");
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(path.join(root, "meta", "app.db"));
    db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;");
    db.exec("CREATE TABLE profiles (id TEXT, name TEXT, path TEXT, game_version TEXT, loader TEXT, group_name TEXT, use_shared_minecraft_folder INTEGER)");
    db.exec("CREATE TABLE profile_mods (profile_id TEXT, id TEXT, file_name TEXT, file_name_override TEXT, enabled INTEGER)");
    db.exec(`INSERT INTO profiles VALUES ('${id}', 'NRC 1.21.11', 'nrc-1.21.11', '1.21.11', 'fabric', NULL, 0)`);
    db.exec(`INSERT INTO profile_mods VALUES ('${id}', 'a', 'sodium-fabric-0.6.jar', NULL, 1), ('${id}', 'b', 'iris-1.8.jar', NULL, 1), ('${id}', 'c', 'off.jar', NULL, 0), ('other', 'd', 'other-profile.jar', NULL, 1)`);
    expect(fs.existsSync(path.join(root, "meta", "app.db-wal"))).toBe(true); // still open: rows live in the WAL
    const [p] = await findNoRisk(root, () => initSqlJs() as any);
    db.close();
    expect(p).toMatchObject({ name: "NRC 1.21.11", version: "1.21.11", loader: "fabric" });
    expect(modJars(p).map((f) => path.basename(f)).sort()).toEqual(["iris-1.8.jar", "sodium-fabric-0.6.jar"]);
    const dest = path.join(root, "out");
    await copyParts(p, ["mods", "settings"], dest, () => {});
    expect(fs.readdirSync(path.join(dest, "mods")).sort()).toEqual(["iris-1.8.jar", "sodium-fabric-0.6.jar"]);
  });
});

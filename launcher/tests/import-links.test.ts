import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { copyParts, findVanilla, measure } from "../electron/ipc/importers";

const w = (p: string, c = "x") => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

describe("importing folders that are links (NoRisk Client shares .minecraft folders)", () => {
  it("copies the real files instead of re-creating the links", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vex-links-"));
    const shared = path.join(tmp, ".minecraft");
    w(path.join(shared, "resourcepacks", "pack.zip"), "pack");
    w(path.join(shared, "jars", "sodium.jar"), "jar");
    const src = path.join(tmp, "norisk", "profile");
    fs.mkdirSync(path.join(src, "mods"), { recursive: true });
    fs.symlinkSync(path.join(shared, "resourcepacks"), path.join(src, "resourcepacks"), "junction");
    fs.symlinkSync(path.join(shared, "jars", "sodium.jar"), path.join(src, "mods", "sodium.jar"));
    fs.symlinkSync(src, path.join(shared, "resourcepacks", "loop"), "junction"); // a link back up must not loop forever
    w(path.join(src, "options.txt"), "fov:1");
    const inst = { ...findVanilla(src)[0], gameDir: src };
    expect(measure(inst, ["resourcepacks", "mods"])).toBeGreaterThan(0);
    const dest = path.join(tmp, "dest");
    const r = await copyParts(inst, ["mods", "resourcepacks", "settings"], dest, () => {});
    expect(r.skipped).toEqual([]);
    expect(fs.lstatSync(path.join(dest, "resourcepacks")).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(path.join(dest, "resourcepacks", "pack.zip"), "utf8")).toBe("pack");
    expect(fs.lstatSync(path.join(dest, "mods", "sodium.jar")).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(path.join(dest, "options.txt"), "utf8")).toBe("fov:1");
  });
});

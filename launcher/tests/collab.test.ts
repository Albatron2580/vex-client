import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
vi.mock("electron", () => ({ app: { getPath: () => os.tmpdir(), getVersion: () => "test" } }));
import { buildRecipe, installRecipeMods } from "../electron/ipc/collab";

const sha1 = (b: Buffer | string) => crypto.createHash("sha1").update(b).digest("hex");
const sodium = Buffer.from("sodium-jar-bytes"), lithium = Buffer.from("lithium-jar-bytes");

function fakeModrinth(opts: { badHash?: boolean } = {}) {
  return vi.fn(async (url: string, init?: any) => {
    const u = String(url);
    const json = (d: unknown) => new Response(JSON.stringify(d), { status: 200 });
    if (u.endsWith("/version_files")) {
      const hashes: string[] = JSON.parse(init.body).hashes;
      const map: Record<string, unknown> = {};
      if (hashes.includes(sha1(sodium))) map[sha1(sodium)] = { id: "verSodium1", project_id: "AANobbMI" };
      return json(map);
    }
    if (u.includes("/projects?ids=")) return json([{ id: "AANobbMI", title: "Sodium" }]);
    if (u.includes("/versions?ids=")) return json([
      { id: "verSodium1", name: "Sodium 0.6", files: [{ primary: true, url: "https://cdn.modrinth.com/data/AANobbMI/sodium.jar", filename: "sodium.jar", hashes: { sha1: sha1(sodium) } }] },
      { id: "verLith0001", name: "Lithium", files: [{ primary: true, url: "https://cdn.modrinth.com/data/x/lithium.jar", filename: "lithium.jar", hashes: { sha1: opts.badHash ? "0".repeat(40) : sha1(lithium) } }] },
    ]);
    if (u.endsWith("/sodium.jar")) return new Response(sodium);
    if (u.endsWith("/lithium.jar")) return new Response(lithium);
    return new Response("nope", { status: 404 });
  });
}

describe("Collab recipes", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "vex-collab-"));
    fs.mkdirSync(path.join(dir, "mods"));
    fs.writeFileSync(path.join(dir, "mods", "sodium-fabric.jar"), sodium);
    fs.writeFileSync(path.join(dir, "mods", "my-private-mod.jar"), "private");
    fs.writeFileSync(path.join(dir, "mods", "notes.txt"), "not a mod");
  });

  it("matches jars on Modrinth by hash and lists the rest as missing", async () => {
    vi.stubGlobal("fetch", fakeModrinth());
    const r = await buildRecipe({ id: "i", name: "PvP", version: "1.21.11", loader: "fabric", gameDir: dir, memoryMb: 6144, jvmArgs: "", createdAt: 0, lastPlayed: null, installed: true });
    expect(r.mods).toEqual([{ projectId: "AANobbMI", versionId: "verSodium1", title: "Sodium", file: "sodium-fabric.jar" }]);
    expect(r.missing).toEqual(["my-private-mod.jar"]);
    expect(r).toMatchObject({ name: "PvP", version: "1.21.11", loader: "fabric", memoryMb: 6144 });
  });

  it("downloads mods and refuses files whose checksum doesn't match", async () => {
    vi.stubGlobal("fetch", fakeModrinth({ badHash: true }));
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), "vex-collab-dest-"));
    const steps: number[] = [];
    const r = await installRecipeMods({ name: "x", version: "1.21.11", loader: "fabric", memoryMb: 4096, missing: [],
      mods: [{ projectId: "AANobbMI", versionId: "verSodium1", title: "Sodium", file: "" }, { projectId: "gvQqBUqZ", versionId: "verLith0001", title: "Lithium", file: "" }] },
      dest, (done) => steps.push(done));
    expect(fs.readFileSync(path.join(dest, "mods", "sodium.jar"))).toEqual(sodium);
    expect(fs.existsSync(path.join(dest, "mods", "lithium.jar"))).toBe(false);
    expect(r).toEqual({ installed: 1, failed: ["Lithium"] });
    expect(steps.at(-1)).toBe(2);
  });
});

import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vex-mod-"));
vi.mock("electron", () => ({ app: { getPath: () => tmp, getVersion: () => "0.0.0" } }));
vi.mock("../electron/ipc/logger", () => ({ log: () => {} }));

const jar = (file: string, meta: object) => {
  execFileSync("python3", ["-c", "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED); z.writestr('fabric.mod.json', sys.argv[2]); z.close()", file, JSON.stringify(meta)]);
  return file;
};

describe("VEX in-game mod install", () => {
  it("reads the mod id and the Minecraft version it needs", async () => {
    const { modMeta, modMinecraft } = await import("../electron/ipc/vexmod");
    const f = jar(path.join(tmp, "a.jar"), { id: "vexclient", version: "1.4.0", depends: { minecraft: "~1.21.11", "fabric-api": "*" } });
    expect(modMeta(f)?.id).toBe("vexclient");
    expect(modMinecraft(f)).toBe("1.21.11");
    expect(modMinecraft(path.join(tmp, "missing.jar"))).toBeNull();
  });

  it("puts exactly one VEX mod in a Fabric instance and writes the online file", async () => {
    const { prepareVexMod } = await import("../electron/ipc/vexmod");
    fs.mkdirSync(path.join(tmp, "vex-mod"), { recursive: true });
    jar(path.join(tmp, "vex-mod", "vex-client-mod.jar"), { id: "vexclient", version: "1.4.0", depends: { minecraft: "1.21.11" } });
    const gameDir = path.join(tmp, "inst");
    fs.mkdirSync(path.join(gameDir, "mods"), { recursive: true });
    jar(path.join(gameDir, "mods", "vex-client-mod-1.2.0.jar"), { id: "vexclient", version: "1.2.0" });
    jar(path.join(gameDir, "mods", "fabric-api-0.1.jar"), { id: "fabric-api", version: "0.1" });
    global.fetch = vi.fn(async () => { throw new Error("offline"); }) as any; // offline: uses the cached jar
    const inst = { id: "x", name: "PvP", version: "1.21.11", loader: "fabric", gameDir, memoryMb: 4096, jvmArgs: "", createdAt: 0, lastPlayed: null, installed: false } as const;
    await prepareVexMod(inst as any, { enabled: true, online: { url: "https://v.example.workers.dev", token: "t".repeat(40) }, status: () => {} });
    expect(fs.readdirSync(path.join(gameDir, "mods")).sort()).toEqual(["fabric-api-0.1.jar", "vex-client-mod.jar"]);
    expect(JSON.parse(fs.readFileSync(path.join(gameDir, "config", "vex-online.json"), "utf8")).url).toBe("https://v.example.workers.dev");

    // turned off in the Mods window: left alone
    fs.renameSync(path.join(gameDir, "mods", "vex-client-mod.jar"), path.join(gameDir, "mods", "vex-client-mod.jar.disabled"));
    await prepareVexMod(inst as any, { enabled: true, online: null, status: () => {} });
    expect(fs.existsSync(path.join(gameDir, "mods", "vex-client-mod.jar"))).toBe(false);
    expect(fs.existsSync(path.join(gameDir, "config", "vex-online.json"))).toBe(false);

    // other Minecraft versions don't get it
    const other = { ...inst, version: "1.20.1", gameDir: path.join(tmp, "inst2") };
    await prepareVexMod(other as any, { enabled: true, online: null, status: () => {} });
    expect(fs.existsSync(path.join(other.gameDir, "mods", "vex-client-mod.jar"))).toBe(false);
  });
});

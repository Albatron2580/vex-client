import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const store = require("../electron/game/store");
const auth = require("../electron/game/auth");

// Stand-in for msmc: "logs in" as whichever name is queued, refresh returns the same account.
const queue: string[] = [];
let failRefresh = false;
const fakeMsmc = {
  Auth: class {
    async launch() { const name = queue.shift()!; return this.xbox(name); }
    async refresh(raw: string) { if (failRefresh) throw new Error("invalid_grant"); return this.xbox(raw.replace("refresh-", "")); }
    xbox(name: string) {
      return {
        save: () => `refresh-${name}`,
        getMinecraft: async () => ({ profile: { id: `uuid${name}`, name }, mclc: () => ({ name, uuid: `uuid${name}`, access_token: `mc-${name}` }) }),
      };
    }
  },
};
const fakeSafe = { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(`enc:${s}`), decryptString: (b: Buffer) => b.toString().replace(/^enc:/, "") };

beforeAll(() => {
  store.init(fs.mkdtempSync(path.join(os.tmpdir(), "vex-ms-")));
  auth.init({ safeStorage: fakeSafe });
  auth.setMsmc(fakeMsmc);
});

describe("Microsoft accounts", () => {
  it("adds several accounts and makes the newest active", async () => {
    queue.push("HAckerbest11", "RaxMc");
    await auth.login(); await auth.login();
    const s = auth.status();
    expect(s.accounts.map((a: any) => a.name).sort()).toEqual(["HAckerbest11", "RaxMc"]);
    expect(s.accounts.find((a: any) => a.active).name).toBe("RaxMc");
  });
  it("stores refresh tokens encrypted, never in plain text", () => {
    const raw = fs.readFileSync(path.join(store.getBaseDir(), "accounts.json"), "utf8");
    expect(raw).not.toContain("refresh-HAckerbest11");
    expect(raw).toContain(Buffer.from("enc:refresh-HAckerbest11").toString("base64"));
  });
  it("switches the active account and gives a launch session", async () => {
    auth.setActive("uuidHAckerbest11");
    expect(store.settings().activeAccount).toBe("uuidHAckerbest11");
    const s = await auth.session("uuidHAckerbest11");
    expect(s).toMatchObject({ name: "HAckerbest11", access_token: "mc-HAckerbest11" });
  });
  it("marks an account as needing sign-in when Microsoft refuses the refresh", async () => {
    // A fresh copy of the module has no cached sessions, so the next session() must refresh.
    const p = require.resolve("../electron/game/auth");
    delete require.cache[p];
    const fresh = require("../electron/game/auth");
    fresh.init({ safeStorage: fakeSafe }); fresh.setMsmc(fakeMsmc);
    failRefresh = true;
    await expect(fresh.session("uuidRaxMc")).rejects.toThrow(/expired/);
    expect(fresh.status().accounts.find((a: any) => a.name === "RaxMc").needsLogin).toBe(true);
    failRefresh = false;
  });
  it("signs out and moves the active account", () => {
    auth.signOut("uuidHAckerbest11");
    const s = auth.status();
    expect(s.accounts.some((a: any) => a.name === "HAckerbest11")).toBe(false);
    expect(s.accounts.some((a: any) => a.active)).toBe(true);
  });
  it("explains common Microsoft errors in plain words", () => {
    expect(auth.friendly("error.gui.closed")).toMatch(/cancelled/);
    expect(auth.friendly({ message: "Account does not own Minecraft (entitlement)" })).toMatch(/doesn't own Minecraft/);
  });
});

// Manual end-to-end check (needs `wrangler dev` with MOJANG_KEY_SPKI from MJ); not part of `npm test`.
import { it, expect, vi } from "vitest";
import crypto from "node:crypto";
import os from "node:os";
vi.mock("electron", () => ({ app: { getPath: () => os.tmpdir(), getVersion: () => "test" }, BrowserWindow: { getAllWindows: () => [] }, safeStorage: { isEncryptionAvailable: () => false }, shell: {} }));
vi.mock("../electron/ipc/logger", () => ({ log: () => {} }));

it.skipIf(!process.env.MJ)("signs in with the Minecraft certificate", async () => {
  const mj = JSON.parse(process.env.MJ!);
  const player = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const uuid = "20c0e7bfca2743b39a86e0a84dea3fb6";
  const expiresAt = new Date(Date.now() + 86400000).toISOString();
  const pubDer = player.publicKey.export({ type: "spki", format: "der" }) as Buffer;
  const ts = Buffer.alloc(8); ts.writeBigInt64BE(BigInt(Date.parse(expiresAt)));
  const sigV2 = crypto.sign("RSA-SHA1", Buffer.concat([Buffer.from(uuid, "hex"), ts, pubDer]), crypto.createPrivateKey(mj.priv)).toString("base64");
  const wrap = (label: string, b: Buffer) => `-----BEGIN ${label}-----\n${b.toString("base64").match(/.{1,64}/g)!.join("\n")}\n-----END ${label}-----\n`;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init?: any) => {
    const u = String(url);
    if (u.endsWith("/player/certificates")) return new Response(JSON.stringify({ keyPair: { privateKey: wrap("RSA PRIVATE KEY", player.privateKey.export({ type: "pkcs8", format: "der" }) as Buffer), publicKey: wrap("RSA PUBLIC KEY", pubDer) }, publicKeySignatureV2: sigV2, expiresAt }));
    if (u.endsWith("/minecraft/profile")) return new Response(JSON.stringify({ id: uuid, name: "HAckerbest11", skins: [{ state: "ACTIVE", url: "http://textures.minecraft.net/texture/abc" }] }));
    return realFetch(url, init);
  }) as any;
  const acc = await import("../electron/ipc/account");
  await acc.initAccount("http://localhost:8799");
  acc.setMinecraftTokenSource(async () => ({ token: "x".repeat(40), name: "HAckerbest11", uuid }));
  const st = await acc.login();
  expect(st.signedIn).toBe(true);
  expect(st.profile?.admin).toBe(true);
  expect(st.profile?.avatar).toBe("https://textures.minecraft.net/texture/abc");
});

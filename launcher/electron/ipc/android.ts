// Admin → Phone app: build the VEX Android app on GitHub and get it ready for Google Play.
// The Play "upload key" is made here on the admin's PC, a backup is saved in Documents, and it's stored
// as encrypted GitHub repo secrets (sealed with the repo's public key) so the Android workflow can sign.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { app, shell } from "electron";
import forge from "node-forge";
import sodium from "libsodium-wrappers";
import { gh, getToken, REPO } from "./publish";
import { log } from "./logger";

export interface AndroidStatus {
  release: { builtAt: string; signed: boolean; notes: string; apk: string | null; aab: string | null; kit: string | null } | null;
  runs: { id: number; status: string; conclusion: string | null; createdAt: string; url: string }[];
  signingSetUp: boolean; githubConnected: boolean; backupDir: string;
}

const backupDir = () => path.join(app.getPath("documents"), "VEX Play Store upload key");

export async function androidStatus(): Promise<AndroidStatus> {
  let release: AndroidStatus["release"] = null;
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/android`, { headers: { "user-agent": "VEX-CLIENT-Admin", accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(15_000) });
    if (r.ok) {
      const j: any = await r.json();
      const asset = (n: string) => j.assets?.find((a: any) => a.name === n)?.browser_download_url ?? null;
      release = { builtAt: j.updated_at ?? j.created_at, signed: /Signed with the VEX upload key/.test(j.body ?? ""), notes: j.body ?? "", apk: asset("vex-android.apk"), aab: asset("vex-android.aab"), kit: asset("vex-play-store-kit.zip") };
    }
  } catch { /* offline */ }
  let runs: AndroidStatus["runs"] = [];
  if (getToken()) {
    try {
      const j = await gh<any>("GET", `/repos/${REPO}/actions/workflows/android.yml/runs?per_page=3`);
      runs = (j.workflow_runs ?? []).map((r: any) => ({ id: r.id, status: r.status, conclusion: r.conclusion, createdAt: r.created_at, url: r.html_url }));
    } catch { /* not allowed or not there yet */ }
  }
  return { release, runs, signingSetUp: fs.existsSync(path.join(backupDir(), "vex-upload-key.p12")), githubConnected: !!getToken(), backupDir: backupDir() };
}

async function setSecret(name: string, value: string) {
  await sodium.ready;
  const key = await gh<{ key: string; key_id: string }>("GET", `/repos/${REPO}/actions/secrets/public-key`);
  const sealed = sodium.crypto_box_seal(sodium.from_string(value), sodium.from_base64(key.key, sodium.base64_variants.ORIGINAL));
  await gh("PUT", `/repos/${REPO}/actions/secrets/${name}`, { encrypted_value: sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL), key_id: key.key_id });
}

/** Makes the Google Play upload key (once), saves a backup, stores it as repo secrets, then builds. */
export async function setupSigning(serviceUrl: string) {
  if (!getToken()) throw new Error("Connect GitHub first (Admin → Publish update).");
  const dir = backupDir();
  const p12 = path.join(dir, "vex-upload-key.p12"), pwFile = path.join(dir, "PASSWORD.txt");
  let password: string, der: Buffer;
  if (fs.existsSync(p12) && fs.existsSync(pwFile)) {
    // reuse the existing key: Google Play only accepts updates signed with the same upload key
    password = fs.readFileSync(pwFile, "utf8").split(/\r?\n/).find((l) => l.startsWith("Password: "))?.slice(10).trim() ?? "";
    der = fs.readFileSync(p12);
  } else {
    password = crypto.randomBytes(18).toString("base64url");
    const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = "01" + crypto.randomBytes(8).toString("hex");
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date(Date.now() + 30 * 365 * 86_400_000); // Play wants 25+ years
    const attrs = [{ name: "commonName", value: "VEX CLIENT" }, { name: "organizationName", value: "VEX" }];
    cert.setSubject(attrs); cert.setIssuer(attrs);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    const asn = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { algorithm: "3des", friendlyName: "vex-upload" });
    der = Buffer.from(forge.asn1.toDer(asn).getBytes(), "binary");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p12, der);
    const sha = crypto.createHash("sha256").update(Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(), "binary")).digest("hex").toUpperCase().match(/../g)!.join(":");
    fs.writeFileSync(pwFile, [
      "VEX — Google Play upload key", "",
      "KEEP THIS FOLDER SAFE AND PRIVATE. Every update on Google Play must be signed with this key.",
      "If you lose it, Google Play can reset it (Play Console → Setup → App signing → Request upload key reset).", "",
      `Password: ${password}`, `Alias: vex-upload`, `SHA-256 fingerprint: ${sha}`, `Made: ${new Date().toISOString()}`, "",
    ].join("\n"));
    log("info", `Made the Google Play upload key (backup in ${dir})`);
  }
  await setSecret("VEX_KEYSTORE_B64", der.toString("base64"));
  await setSecret("VEX_KEYSTORE_PASSWORD", password);
  if (/^https:\/\//.test(serviceUrl)) await setSecret("VEX_ONLINE_URL", serviceUrl.replace(/\/+$/, ""));
  await buildAndroid(serviceUrl, false);
  return androidStatus();
}

/** Starts the Android build on GitHub (updates the baked-in VEX online address first). */
export async function buildAndroid(serviceUrl: string, syncUrl = true) {
  if (!getToken()) throw new Error("Connect GitHub first (Admin → Publish update).");
  if (syncUrl && /^https:\/\//.test(serviceUrl)) await setSecret("VEX_ONLINE_URL", serviceUrl.replace(/\/+$/, ""));
  await gh("POST", `/repos/${REPO}/actions/workflows/android.yml/dispatches`, { ref: "main" });
  log("info", "Admin started an Android build");
  await new Promise((r) => setTimeout(r, 3000));
  return androidStatus();
}

export function openBackup() { fs.mkdirSync(backupDir(), { recursive: true }); return shell.openPath(backupDir()); }

/** Opens GitHub / Google Play pages for the admin (nothing else). */
export function openLink(url: string) {
  if (/^https:\/\/(github\.com\/Albatron2580\/vex-client\/|play\.google\.com\/console|support\.google\.com\/googleplay\/)/.test(url)) return shell.openExternal(url);
  throw new Error("Not an allowed link.");
}

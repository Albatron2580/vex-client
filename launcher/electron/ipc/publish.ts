// Admin → Publish update. Starts the GitHub "Release" workflow, which bumps the version, builds
// the installer and publishes it; every VEX then updates itself.
// VEX contains no secret that can publish: the admin connects their OWN GitHub token, which only
// works if that GitHub account can write to the repo. The token is encrypted with Windows (DPAPI)
// and only ever sent to api.github.com.
import fs from "node:fs";
import path from "node:path";
import { app, safeStorage } from "electron";
import { log } from "./logger";

export const REPO = "Albatron2580/vex-client";
const API = "https://api.github.com";
const file = () => path.join(app.getPath("userData"), "admin-github.bin");

export function getToken(): string | null {
  try { return fs.existsSync(file()) ? safeStorage.decryptString(fs.readFileSync(file())) : null; } catch { return null; }
}

export async function gh<T>(method: string, route: string, body?: unknown, token = getToken()): Promise<T> {
  if (!token) throw new Error("Connect GitHub first.");
  let r: Response;
  try {
    r = await fetch(API + route, {
      method, signal: AbortSignal.timeout(20_000),
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "VEX-CLIENT-Admin", ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch { throw new Error("Can't reach GitHub. Check your internet connection."); }
  if (r.status === 401) throw new Error("GitHub refused the token — it may have expired. Connect GitHub again.");
  if (r.status === 403 || r.status === 404) throw new Error(`GitHub: not allowed. The token needs access to ${REPO} with Contents, Actions and Secrets set to “Read and write”.`);
  if (!r.ok) { const j: any = await r.json().catch(() => ({})); throw new Error(`GitHub answered ${r.status}: ${j.message ?? r.statusText}`); }
  return (r.status === 204 ? null : await r.json()) as T;
}

export async function connectGithub(token: string) {
  const t = String(token ?? "").trim();
  if (!/^(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})$/.test(t)) throw new Error("That doesn't look like a GitHub token (it starts with github_pat_ or ghp_).");
  const repo = await gh<any>("GET", `/repos/${REPO}`, undefined, t);
  if (!repo?.permissions?.push) throw new Error(`That GitHub account can't write to ${REPO}.`);
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows can't encrypt the token on this PC, so it won't be saved.");
  fs.writeFileSync(file(), safeStorage.encryptString(t));
  log("info", "Admin connected GitHub for publishing");
  return publishStatus();
}
export function disconnectGithub() { fs.rmSync(file(), { force: true }); return { connected: false }; }

export async function publishStatus() {
  if (!getToken()) return { connected: false };
  const [user, runs, releases] = await Promise.all([
    gh<any>("GET", "/user"),
    gh<any>("GET", `/repos/${REPO}/actions/workflows/release.yml/runs?per_page=5`),
    gh<any[]>("GET", `/repos/${REPO}/releases?per_page=5`),
  ]);
  return {
    connected: true, login: user.login as string,
    runs: (runs.workflow_runs ?? []).map((r: any) => ({ id: r.id, status: r.status, conclusion: r.conclusion, createdAt: r.created_at, url: r.html_url, title: r.display_title })),
    releases: releases.filter((r) => !r.prerelease && !r.draft).map((r) => ({ tag: r.tag_name, name: r.name, publishedAt: r.published_at, url: r.html_url })),
  };
}

export async function publishUpdate(bump: string, notes: string) {
  const b = ["patch", "minor", "major"].includes(bump) ? bump : "patch";
  const n = String(notes ?? "").trim().slice(0, 4000);
  if (n.length < 3) throw new Error("Write a few words about what changed — players see this.");
  await gh("POST", `/repos/${REPO}/actions/workflows/release.yml/dispatches`, { ref: "main", inputs: { bump: b, notes: n } });
  log("info", `Admin started a ${b} release`);
  await new Promise((r) => setTimeout(r, 3000));
  return publishStatus();
}

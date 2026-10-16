// Admin panel backend: release management for the launcher's own updates.
//
// Who is an admin: the Minecraft accounts listed in package.json -> vexAdmins. The name is checked
// against the profile Minecraft's servers return for the signed-in account (a fresh Microsoft
// session), not against anything stored in a file, so renaming a local file does not grant access.
//
// What an admin can do is limited by their OWN GitHub token, not by this check: every action is a
// GitHub API call that only succeeds if that GitHub user has write access to the launcher's repo.
// The launcher contains no secret that can publish anything. The token is entered once per PC,
// encrypted with Windows (DPAPI) and only ever sent to api.github.com.
const path = require('path');
const store = require('./store');
const semver = require('./semver');

const API_DEFAULT = 'https://api.github.com';
const WORKFLOW = 'release.yml';
const VERIFY_MS = 30 * 60 * 1000;

function create({ auth, safeStorage, config, admins, version }) {
  const file = () => path.join(store.getBaseDir(), 'admin.json');
  const read = () => store.readJson(file(), { tokens: {} });
  const write = (d) => store.writeJson(file(), d);
  const cfg = config || {};
  const API = cfg.apiBase || API_DEFAULT; // tests point this at a local server
  const list = (admins || []).map((n) => String(n).toLowerCase());
  let verified = null; // { uuid, name, at }

  const canEncrypt = () => !!(safeStorage && safeStorage.isEncryptionAvailable());

  // Checks the active account against Minecraft's servers. Throws if it is not an admin.
  async function verify() {
    const uuid = store.settings().activeAccount;
    if (!uuid) throw new Error('Sign in first.');
    if (verified && verified.uuid === uuid && Date.now() - verified.at < VERIFY_MS) return verified;
    const s = await auth.session(uuid); // refreshes the Microsoft session, returns Minecraft's profile
    const name = String((s && s.name) || '');
    const sid = String((s && s.uuid) || '').replace(/-/g, '');
    if (!name || (sid && sid !== uuid) || !list.includes(name.toLowerCase())) {
      verified = null;
      throw new Error('This account does not have admin access.');
    }
    verified = { uuid, name, at: Date.now() };
    return verified;
  }

  // Quick check for showing the menu entry (no network). The real check is verify().
  function listed(name) { return !!name && list.includes(String(name).toLowerCase()); }

  function getToken(uuid) {
    const t = read().tokens[uuid];
    if (!t) return '';
    try { return safeStorage.decryptString(Buffer.from(t, 'base64')); } catch { return ''; }
  }

  async function gh(token, method, route, body) {
    const res = await fetch(`${API}${route}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': `VexClient/${version}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    }).catch(() => { throw new Error("Can't reach GitHub. Check your internet connection."); });
    if (res.status === 401) throw new Error('GitHub refused the token. It may have expired: connect GitHub again.');
    if (res.status === 403 || res.status === 404) {
      const j = await res.json().catch(() => ({}));
      throw new Error(`GitHub: ${j.message || 'not allowed'}. Check that the token has access to ${cfg.owner}/${cfg.repo} with Contents and Actions set to "Read and write".`);
    }
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(`GitHub answered ${res.status}: ${j.message || res.statusText}`); }
    return res.status === 204 ? null : res.json();
  }

  const repo = () => {
    if (!cfg.owner || /YOUR_/.test(cfg.owner)) throw new Error('Updates are not set up yet: run "npm run setup-updates" (see RELEASING.md).');
    return `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
  };

  async function tokenFor() {
    const me = await verify();
    const token = getToken(me.uuid);
    if (!token) { const e = new Error('Connect GitHub first.'); e.needsToken = true; throw e; }
    return token;
  }

  async function status() {
    const me = await verify();
    let github = null;
    const token = getToken(me.uuid);
    if (token) {
      try {
        const [user, r] = await Promise.all([gh(token, 'GET', '/user'), gh(token, 'GET', repo())]);
        github = { login: user.login, avatar: user.avatar_url, repo: r.full_name, canPush: !!(r.permissions && r.permissions.push), branch: r.default_branch };
      } catch (e) { github = { error: e.message }; }
    }
    return { name: me.name, repo: cfg.owner && !/YOUR_/.test(cfg.owner) ? `${cfg.owner}/${cfg.repo}` : '', github, secure: canEncrypt(), version };
  }

  async function connect(token) {
    const me = await verify();
    token = String(token || '').trim();
    if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(token)) throw new Error('That does not look like a GitHub token. It starts with github_pat_ (or ghp_).');
    if (!canEncrypt()) throw new Error('Windows secure storage is not available, so the token cannot be saved safely.');
    const r = await gh(token, 'GET', repo());
    if (!r.permissions || !r.permissions.push) throw new Error(`This token can read ${r.full_name} but cannot change it. Give it Contents and Actions "Read and write".`);
    const d = read();
    d.tokens[me.uuid] = safeStorage.encryptString(token).toString('base64');
    write(d);
    return status();
  }

  async function disconnect() {
    const me = await verify();
    const d = read();
    delete d.tokens[me.uuid];
    write(d);
    return true;
  }

  async function overview() {
    const token = await tokenFor();
    const r = repo();
    const [releases, runs] = await Promise.all([
      gh(token, 'GET', `${r}/releases?per_page=20`),
      gh(token, 'GET', `${r}/actions/workflows/${WORKFLOW}/runs?per_page=8`).catch(() => ({ workflow_runs: [] })),
    ]);
    let latestTag = '';
    try { latestTag = (await gh(token, 'GET', `${r}/releases/latest`)).tag_name; } catch { /* none yet */ }
    const rel = (releases || []).map((x) => {
      const exe = (x.assets || []).filter((a) => /\.exe$/i.test(a.name));
      return {
        id: x.id, tag: x.tag_name, version: String(x.tag_name || '').replace(/^v/, ''), date: x.published_at || x.created_at,
        draft: x.draft, prerelease: x.prerelease, latest: x.tag_name === latestTag, url: x.html_url,
        downloads: exe.reduce((n, a) => n + (a.download_count || 0), 0),
        critical: /critical/i.test(x.name || ''),
        notes: String(x.body || '').slice(0, 4000),
        signed: (x.assets || []).some((a) => a.name === 'vex-release.json.sig'),
      };
    });
    const builds = ((runs && runs.workflow_runs) || []).map((w) => ({
      id: w.id, title: w.display_title || w.name, status: w.status, conclusion: w.conclusion, event: w.event,
      date: w.created_at, url: w.html_url, actor: w.actor && w.actor.login,
    }));
    const live = rel.find((x) => x.latest);
    return {
      releases: rel, builds, latest: live ? live.version : '',
      totalDownloads: rel.reduce((n, x) => n + x.downloads, 0),
    };
  }

  // Starts the GitHub Actions release workflow: it bumps the version, writes the changelog,
  // builds and signs the installer and publishes it. Nothing is built on this PC.
  async function publish({ bump, critical, minimum, notes }) {
    const token = await tokenFor();
    if (!['patch', 'minor', 'major'].includes(bump)) throw new Error('Choose patch, minor or major.');
    if (minimum && !semver.valid(minimum)) throw new Error('Minimum version must look like 1.2.0.');
    const text = String(notes || '').trim();
    if (text.length < 3) throw new Error('Write what changed: these notes are shown to every player.');
    if (text.length > 6000) throw new Error('Release notes are too long (6000 characters max).');
    const r = repo();
    const info = await gh(token, 'GET', r);
    await gh(token, 'POST', `${r}/actions/workflows/${WORKFLOW}/dispatches`, {
      ref: info.default_branch,
      inputs: { bump, critical: critical ? 'true' : 'false', minimum: minimum || '', notes: text },
    });
    return { started: true, by: verified && verified.name };
  }

  async function build(runId) {
    const token = await tokenFor();
    const r = repo();
    const run = await gh(token, 'GET', `${r}/actions/runs/${Number(runId)}`);
    const jobs = await gh(token, 'GET', `${r}/actions/runs/${Number(runId)}/jobs`);
    const steps = (((jobs && jobs.jobs) || [])[0] || {}).steps || [];
    return {
      id: run.id, status: run.status, conclusion: run.conclusion, url: run.html_url, title: run.display_title,
      steps: steps.filter((s) => !/^(Set up job|Complete job|Post )/.test(s.name)).map((s) => ({ name: s.name, status: s.status, conclusion: s.conclusion })),
    };
  }

  // Stop offering a release to launchers that haven't updated yet (or offer it again).
  async function rollout(releaseId, action) {
    const token = await tokenFor();
    const r = repo();
    const id = Number(releaseId);
    if (action === 'pause') {
      const all = await gh(token, 'GET', `${r}/releases?per_page=30`);
      const target = all.find((x) => x.id === id);
      if (!target) throw new Error('Release not found.');
      const prev = all.filter((x) => !x.draft && !x.prerelease && x.id !== id && semver.valid(x.tag_name) && semver.compare(x.tag_name, target.tag_name) < 0)
        .sort((a, b) => semver.compare(b.tag_name, a.tag_name))[0];
      await gh(token, 'PATCH', `${r}/releases/${id}`, { prerelease: true, make_latest: 'false' });
      if (prev) await gh(token, 'PATCH', `${r}/releases/${prev.id}`, { make_latest: 'true' });
      return { paused: true, fallback: prev ? prev.tag_name : '' };
    }
    if (action === 'resume') {
      await gh(token, 'PATCH', `${r}/releases/${id}`, { prerelease: false, make_latest: 'true' });
      return { paused: false };
    }
    throw new Error('Unknown action.');
  }

  return { listed, verify, status, connect, disconnect, overview, publish, build, rollout };
}

module.exports = { create };

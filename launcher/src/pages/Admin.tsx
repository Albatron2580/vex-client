import { useCallback, useEffect, useState } from "react";
import { Card, Field, Notice, SearchBar, Segmented, Select } from "../components/ui";
import { Icon } from "../components/Icon";
import { Avatar } from "../components/Shell";
import { useApp } from "../state/AppState";
import { vex, errMsg } from "../lib/bridge";
import { OnlineSetupWizard } from "../features/OnlineSetupWizard";
import { isAdminName } from "../../electron/shared/settingsModel";
import type { AdminOverview, AdminUser, Announcement, BugReport, Featured, GithubStatus, PublicHome } from "../vex";

type Tab = "overview" | "news" | "server" | "players" | "bugs" | "publish";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "home" }, { id: "news", label: "Announcements", icon: "megaphone" },
  { id: "server", label: "Featured server", icon: "server" }, { id: "players", label: "Players", icon: "friends" },
  { id: "bugs", label: "Bug reports", icon: "bug" }, { id: "publish", label: "Publish update", icon: "upload" },
];
const when = (t: number | string | null | undefined) => (t ? new Date(t).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

export function AdminPage() {
  const { account, go, ms } = useApp();
  const [tab, setTab] = useState<Tab>("overview");
  const mcName = account?.profile?.mcName ?? ms?.accounts.find((a) => a.active)?.name;
  const onlineAdmin = !!account?.profile?.admin;
  if (!onlineAdmin && !isAdminName(mcName)) return (
    <div className="page"><Card><div className="empty" style={{ border: 0 }}><Icon name="shield" size={36} /><b style={{ color: "var(--text)" }}>Admins only</b>
      <span className="small">Switch to an admin Minecraft account (HAckerbest11, RaxMc or UNCdel) in the account menu.</span><button className="btn sm" onClick={() => go("home")}>Back home</button></div></Card></div>
  );
  const needsOnline = !onlineAdmin && tab !== "publish" && tab !== "overview";
  return (
    <div className="page">
      <div className="page-head"><div><span className="eyebrow">Client</span><h1>Admin</h1><p>Signed in as <b>{mcName}</b>. Changes here reach every VEX player.</p></div></div>
      <div className="tabs" role="tablist">
        {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}><Icon name={t.icon} size={14} />{t.label}</button>)}
      </div>
      {tab === "overview" && (onlineAdmin ? <Overview /> : <OnlineNeeded />)}
      {needsOnline && <OnlineNeeded />}
      {onlineAdmin && tab === "news" && <News />}
      {onlineAdmin && tab === "server" && <FeaturedServer />}
      {onlineAdmin && tab === "players" && <Players />}
      {onlineAdmin && tab === "bugs" && <Bugs />}
      {tab === "publish" && <Publish />}
    </div>
  );
}

/** What's still missing before announcements, players, bugs and the featured server work. */
function OnlineNeeded() {
  const { account, ms, desktop } = useApp();
  const [wizard, setWizard] = useState(false);
  const [busy, setBusy] = useState(false);
  const steps: [boolean, string, React.ReactNode][] = [
    [!!ms?.accounts.some((a) => a.active && isAdminName(a.name)), "Use an admin Minecraft account", "Add or switch to HAckerbest11, RaxMc or UNCdel in the account menu (bottom left)."],
    [!!account?.configured, "Set up the VEX online service", <button key="b" className="btn primary sm" disabled={!desktop} onClick={() => setWizard(true)}><Icon name="sparkle" size={14} />Set up / continue</button>],
    [!!account?.signedIn, "Connected to VEX online", account?.configured ? <button key="m" className="btn sm" disabled={busy} onClick={async () => { setBusy(true); try { await vex().online.loginCheck(); } catch { /* shown on the Friends page */ } finally { setBusy(false); } }}>{busy ? <span className="spinner" /> : <Icon name="refresh" size={14} />}Connect</button> : "Happens automatically after the online service is set up."],
  ];
  const next = steps.findIndex(([done]) => !done);
  return (
    <Card title="Finish setting up VEX online" icon="server" sub="Announcements, the featured server, players and bug reports live on the VEX online service. Publish update already works.">
      <ol className="setup-steps">
        {steps.map(([done, label, action], i) => (
          <li key={label} className={`setup-step ${done ? "done" : i === next ? "waiting" : "pending"}`}>
            <span className="setup-icon">{done ? <Icon name="check" size={14} /> : i === next ? <Icon name="user" size={13} /> : null}</span>
            <span style={{ flex: 1 }}><b className="small">{label}</b>{!done && i === next && <span className="tiny faint" style={{ display: "block", marginTop: 2 }}>{typeof action === "string" ? action : null}</span>}</span>
            {!done && i === next && typeof action !== "string" && action}
          </li>))}
      </ol>
      {next === -1 && account?.signedIn && !account.profile?.admin && <Notice kind="warn">Signed in, but the online service doesn't know your Minecraft account yet. Update the online service (Settings → Friends account) and reopen VEX.</Notice>}
      {wizard && <OnlineSetupWizard onClose={() => setWizard(false)} />}
    </Card>
  );
}

function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { try { setData(await fn()); setError(null); } catch (e) { setError(errMsg(e)); } }, deps);
  useEffect(() => { load(); }, [load]);
  return { data, error, load, setData };
}

function Overview() {
  const { data, error } = useLoad<AdminOverview>(() => vex().admin.overview());
  const [versions, setVersions] = useState<{ deployed: string | null; bundled: string | null } | null>(null);
  const [wizard, setWizard] = useState(false);
  useEffect(() => { Promise.all([vex().online.serviceVersion(), vex().online.bundledServerVersion()]).then(([deployed, bundled]) => setVersions({ deployed, bundled })); }, [wizard]);
  const outdated = versions?.deployed && versions.bundled && versions.deployed !== versions.bundled;
  const stats: [string, number | undefined, string][] = [["Players", data?.users, "friends"], ["Online now", data?.online, "user"], ["New this week", data?.newWeek, "sparkle"],
    ["Open bug reports", data?.openBugs, "bug"], ["Friendships", data?.friendships, "collab"], ["Banned", data?.banned, "shield"]];
  return (
    <div className="stack" style={{ gap: "var(--s4)" }}>
      {error && <Notice kind="danger">{error}</Notice>}
      <div className="grid grid-3">{stats.map(([label, n, icon]) => (
        <Card key={label}><div className="row"><span className="nav-tile"><Icon name={icon} size={16} /></span><div><div style={{ font: "700 26px var(--font-display)" }}>{n ?? "—"}</div><div className="tiny faint">{label}</div></div></div></Card>))}</div>
      <Card title="Online service" icon="server">
        <dl className="kv"><dt>Running</dt><dd>{versions?.deployed ?? "—"}</dd><dt>In this VEX</dt><dd>{versions?.bundled ?? "—"}</dd><dt>Admins</dt><dd>{data?.admins.join(", ") ?? "—"}</dd></dl>
        {outdated ? <Notice kind="warn"><b>The online service needs an update</b> for the newest features. Run it from the PC that set it up (signed in to Cloudflare).
          <div style={{ marginTop: 8 }}><button className="btn primary sm" onClick={() => setWizard(true)}><Icon name="refresh" size={14} />Update online service</button></div></Notice>
          : <p className="tiny faint" style={{ marginTop: 10 }}>Up to date.</p>}
      </Card>
      {wizard && <OnlineSetupWizard onClose={() => setWizard(false)} />}
    </div>
  );
}

function News() {
  const { toast } = useApp();
  const { data, error, setData } = useLoad<PublicHome>(() => vex().online.home());
  const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [kind, setKind] = useState<Announcement["kind"]>("news");
  const [busy, setBusy] = useState(false);
  const post = async () => {
    setBusy(true);
    try { setData(await vex().admin.announce(title, body, kind)); setTitle(""); setBody(""); toast("success", "Announcement posted", "Everyone sees it on Home."); }
    catch (e) { toast("error", "Couldn't post", errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      <Card title="New announcement" icon="megaphone" sub="Shown at the top of everyone's Home page.">
        <div className="stack">
          <Field label="Type">{() => <Segmented label="Type" value={kind} onChange={setKind} options={[{ value: "news", label: "News" }, { value: "update", label: "Update" }, { value: "warning", label: "Warning" }]} />}</Field>
          <Field label="Title">{(id) => <input id={id} className="input" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Season 2 is live!" />}</Field>
          <Field label="Text">{(id) => <textarea id={id} className="input" style={{ height: 110, padding: 10, resize: "vertical" }} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} />}</Field>
          <button className="btn primary" disabled={busy || !title.trim() || !body.trim()} onClick={post}><Icon name="megaphone" size={15} />Post</button>
        </div>
      </Card>
      <Card title="Live now" icon="home">
        {error && <Notice kind="danger">{error}</Notice>}
        {!data?.announcements.length ? <p className="small faint">No announcements.</p> : <div className="stack" style={{ gap: 6 }}>{data.announcements.map((a) => (
          <div key={a.id} className="list-item" style={{ border: "1px solid var(--line)", alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}><span className={`chip ${a.kind === "warning" ? "warn" : a.kind === "update" ? "accent" : ""}`}>{a.kind}</span> <b className="small">{a.title}</b><div className="tiny faint">{a.author} · {when(a.createdAt)}</div><p className="small muted" style={{ marginTop: 4 }}>{a.body}</p></div>
            <button className="btn ghost sm danger" aria-label="Delete" onClick={async () => setData(await vex().admin.unannounce(a.id))}><Icon name="trash" size={14} /></button>
          </div>))}</div>}
      </Card>
    </div>
  );
}

function FeaturedServer() {
  const { toast } = useApp();
  const { data, setData } = useLoad<PublicHome>(() => vex().online.home());
  const [f, setF] = useState<Partial<Featured>>({});
  useEffect(() => { if (data?.featured) setF(data.featured); }, [data?.featured?.address]);
  const save = async () => { try { setData(await vex().admin.setFeatured(f)); toast("success", "Featured server updated"); } catch (e) { toast("error", "Couldn't save", errMsg(e)); } };
  const set = (k: keyof Featured) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Card title="Featured server" icon="server" sub="A card on everyone's Home page with live player count and a Join button.">
      <div className="grid grid-2" style={{ gap: 12 }}>
        <Field label="Name">{(id) => <input id={id} className="input" maxLength={60} value={f.name ?? ""} onChange={set("name")} placeholder="VexVanilla" />}</Field>
        <Field label="Address" hint="Like play.example.net or play.example.net:25566">{(id) => <input id={id} className="input mono" maxLength={120} value={f.address ?? ""} onChange={set("address")} />}</Field>
        <Field label="Description">{(id) => <input id={id} className="input" maxLength={200} value={f.description ?? ""} onChange={set("description")} placeholder="Survival · EU · new season" />}</Field>
        <Field label="Minecraft version" hint="Players can join from an instance with this version">{(id) => <input id={id} className="input" maxLength={40} value={f.version ?? ""} onChange={set("version")} placeholder="1.21.11" />}</Field>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn primary" disabled={!f.name || !f.address} onClick={save}><Icon name="save" size={15} />Save</button>
        {data?.featured && <button className="btn danger" onClick={async () => { setData(await vex().admin.clearFeatured()); setF({}); }}>Remove</button>}
        {data?.featured?.updatedBy && <span className="tiny faint">Last set by {data.featured.updatedBy}</span>}
      </div>
    </Card>
  );
}

function Players() {
  const { toast } = useApp();
  const [q, setQ] = useState(""); const [filter, setFilter] = useState<"" | "online" | "banned">("");
  const { data, error, load } = useLoad<AdminUser[]>(() => vex().admin.users(q, filter), [q, filter]);
  const ban = async (u: AdminUser, banned: boolean) => {
    try { await vex().admin.ban(u.id, banned); toast("success", banned ? `Banned ${u.username}` : `Unbanned ${u.username}`); load(); }
    catch (e) { toast("error", "That didn't work", errMsg(e)); }
  };
  return (
    <Card title="Players" icon="friends" sub="Everyone who signed in to VEX online. Banning removes them from friends, search and Collab.">
      <div className="row" style={{ marginBottom: 10 }}>
        <div style={{ flex: 1 }}><SearchBar value={q} onChange={setQ} placeholder="Search Modrinth or Minecraft name" /></div>
        <Segmented label="Filter" value={filter} onChange={setFilter} options={[{ value: "", label: "All" }, { value: "online", label: "Online" }, { value: "banned", label: "Banned" }]} />
      </div>
      {error && <Notice kind="danger">{error}</Notice>}
      <div className="stack" style={{ gap: 2 }}>
        {data === null ? <div className="row small muted"><span className="spinner" />Loading…</div> : !data.length ? <p className="small faint">Nobody found.</p> : data.map((u) => (
          <div key={u.id} className="list-item">
            <span style={{ position: "relative" }}><Avatar name={u.username} url={u.avatar} size={32} /><span className={`presence-dot ${u.online ? "online" : ""}`} /></span>
            <div style={{ flex: 1, minWidth: 0 }}><b className="small">{u.username}</b>{u.admin && <span className="chip accent" style={{ marginLeft: 6 }}>admin</span>}{u.banned && <span className="chip danger" style={{ marginLeft: 6 }}>banned</span>}
              <div className="tiny faint">{u.mcName ? `Minecraft: ${u.mcName}` : "No Minecraft account linked"} · joined {when(u.joined)} · {u.online ? "online now" : `seen ${when(u.lastSeen)}`}</div></div>
            {!u.admin && (u.banned ? <button className="btn sm" onClick={() => ban(u, false)}>Unban</button> : <button className="btn sm danger" onClick={() => ban(u, true)}>Ban</button>)}
          </div>))}
      </div>
    </Card>
  );
}

function Bugs() {
  const [status, setStatus] = useState<"open" | "fixed" | "wontfix">("open");
  const { data, error, load } = useLoad<BugReport[]>(() => vex().admin.bugs(status), [status]);
  const mark = async (b: BugReport, s: string) => { await vex().admin.setBug(b.id, s); load(); };
  return (
    <Card title="Bug reports" icon="bug" sub="Sent by players from Settings → Diagnostics → Report a bug." extra={<span style={{ marginLeft: "auto" }}><Segmented label="Status" value={status} onChange={setStatus} options={[{ value: "open", label: "Open" }, { value: "fixed", label: "Fixed" }, { value: "wontfix", label: "Won't fix" }]} /></span>}>
      {error && <Notice kind="danger">{error}</Notice>}
      {data === null ? <div className="row small muted"><span className="spinner" />Loading…</div> : !data.length ? <div className="empty"><Icon name="check" size={26} /><span className="small">No {status === "open" ? "open " : ""}bug reports.</span></div> : (
        <div className="stack" style={{ gap: 8 }}>{data.map((b) => (
          <div key={b.id} className="list-item" style={{ border: "1px solid var(--line)", alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0 }}><b className="small">{b.title}</b><div className="tiny faint">{b.by} · VEX {b.version ?? "?"} · {when(b.createdAt)}</div>
              <p className="small muted" style={{ marginTop: 4, whiteSpace: "pre-wrap", userSelect: "text" }}>{b.body}</p></div>
            <div className="stack" style={{ gap: 4 }}>
              {status !== "fixed" && <button className="btn sm" onClick={() => mark(b, "fixed")}><Icon name="check" size={13} />Fixed</button>}
              {status !== "wontfix" && <button className="btn ghost sm" onClick={() => mark(b, "wontfix")}>Won't fix</button>}
              {status !== "open" && <button className="btn ghost sm" onClick={() => mark(b, "open")}>Reopen</button>}
            </div>
          </div>))}</div>)}
    </Card>
  );
}

function Publish() {
  const { toast, info } = useApp();
  const { data, error, load, setData } = useLoad<GithubStatus>(() => vex().admin.githubStatus());
  const [token, setToken] = useState(""); const [bump, setBump] = useState("patch"); const [notes, setNotes] = useState(""); const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<GithubStatus>, ok: string) => {
    setBusy(true);
    try { setData(await fn()); toast("success", ok); } catch (e) { toast("error", "That didn't work", errMsg(e)); } finally { setBusy(false); }
  };
  const [maj, min, pat] = (info?.version ?? "0.0.0").split(".").map(Number);
  const next = bump === "major" ? `${maj + 1}.0.0` : bump === "minor" ? `${maj}.${min + 1}.0` : `${maj}.${min}.${pat + 1}`;
  const running = data?.runs?.some((r) => r.status !== "completed");
  useEffect(() => { if (!running) return; const t = setInterval(load, 20_000); return () => clearInterval(t); }, [running, load]);
  if (data && !data.connected) return (
    <Card title="Connect GitHub" icon="lock" sub="Publishing uses YOUR GitHub access, so only people who can edit the repo can publish. VEX itself holds no publishing key.">
      <ol className="small muted" style={{ paddingLeft: 18 }}>
        <li>Open GitHub → Settings → Developer settings → <b>Fine-grained tokens</b> → Generate new token.</li>
        <li>Repository access: only <span className="mono">Albatron2580/vex-client</span>. Permissions: <b>Actions</b> and <b>Contents</b> → Read and write.</li>
        <li>Paste the token here. It's encrypted by Windows and only sent to GitHub.</li>
      </ol>
      <div className="row" style={{ marginTop: 10 }}>
        <input type="password" className="input mono" placeholder="github_pat_…" value={token} onChange={(e) => setToken(e.target.value.trim())} autoComplete="off" />
        <button className="btn primary" disabled={busy || !token} onClick={() => run(() => vex().admin.githubConnect(token), "GitHub connected")}>Connect</button>
      </div>
      <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => window.open("https://github.com/settings/personal-access-tokens/new")}><Icon name="external" size={13} />Open GitHub tokens page</button>
      {error && <Notice kind="danger">{error}</Notice>}
    </Card>
  );
  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      <Card title="Publish a new version" icon="upload" sub={`GitHub builds the installer, publishes it, and every VEX updates itself. Now: ${info?.version ?? "?"}.`}>
        <div className="stack">
          <Field label="Kind of update">{(id) => <Select id={id} value={bump} onChange={setBump} options={[{ value: "patch", label: "Fix / small change" }, { value: "minor", label: "New features" }, { value: "major", label: "Big release" }]} />}</Field>
          <Field label="What changed" hint="One change per line. Players see this.">{(id) => <textarea id={id} className="input" style={{ height: 110, padding: 10, resize: "vertical" }} maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={"Fixed the crosshair on 1.21.11\nNew Aurora theme"} />}</Field>
          <button className="btn primary" disabled={busy || running || notes.trim().length < 3} onClick={() => run(() => vex().admin.publish(bump, notes), `Publishing ${next} — takes about 5 minutes`)}>{busy ? <span className="spinner" /> : <Icon name="upload" size={15} />}Publish {next}</button>
          {running && <Notice>A release is building right now. Wait for it to finish.</Notice>}
          <span className="tiny faint">Connected as {data?.login}. <button className="btn ghost sm" style={{ padding: 0, height: "auto" }} onClick={() => run(() => vex().admin.githubDisconnect(), "GitHub disconnected")}>Disconnect</button></span>
        </div>
      </Card>
      <Card title="Recent builds" icon="refresh" extra={<button className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={load}><Icon name="refresh" size={13} /></button>}>
        {error && <Notice kind="danger">{error}</Notice>}
        <div className="stack" style={{ gap: 4 }}>{data?.runs?.map((r) => (
          <a key={r.id} className="list-item" href={r.url} target="_blank" rel="noreferrer" style={{ color: "var(--text)", textDecoration: "none" }}>
            {r.status !== "completed" ? <span className="spinner" /> : <Icon name={r.conclusion === "success" ? "check" : "alert"} size={15} />}
            <span style={{ flex: 1 }}><b className="small">{r.title}</b><span className="tiny faint" style={{ display: "block" }}>{r.status === "completed" ? r.conclusion : r.status} · {when(r.createdAt)}</span></span>
          </a>))}</div>
        <div className="label" style={{ marginTop: 12 }}>Releases</div>
        <div className="stack" style={{ gap: 2 }}>{data?.releases?.map((r) => <div key={r.tag} className="row small"><span className="chip accent">{r.tag}</span><span className="faint tiny">{when(r.publishedAt)}</span></div>)}</div>
      </Card>
    </div>
  );
}

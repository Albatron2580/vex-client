import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isAdminName } from "../../electron/shared/settingsModel";
import { McHead, SkinFace } from "./McHead";
import { errMsg } from "../lib/bridge";
import { useApp, type PageId } from "../state/AppState";
import { Icon } from "./Icon";
import { Logo } from "./Logo";

const SECTIONS: { title: string; items: { id: PageId; icon: string; badge?: string; adminOnly?: boolean }[] }[] = [
  { title: "Main", items: [{ id: "home", icon: "home" }, { id: "instances", icon: "cube" }, { id: "mods", icon: "puzzle" }] },
  { title: "Social", items: [{ id: "friends", icon: "friends" }, { id: "collab", icon: "collab" }] },
  { title: "Customization", items: [{ id: "skins", icon: "skins" }, { id: "features", icon: "features" }] },
  { title: "Client", items: [{ id: "settings", icon: "settings" }, { id: "admin", icon: "shield", adminOnly: true }] },
];

export function TitleBar() {
  const { desktop } = useApp();
  return (
    <header className="titlebar">
      <span>VEX CLIENT</span>
      {desktop && (
        <div className="win-btns">
          <button onClick={() => window.vex!.win.minimize()} aria-label="Minimise"><Icon name="min" size={14} /></button>
          <button onClick={() => window.vex!.win.maximize()} aria-label="Maximise"><Icon name="max" size={12} /></button>
          <button className="close" onClick={() => window.vex!.win.close()} aria-label="Close"><Icon name="close" size={14} /></button>
        </div>
      )}
    </header>
  );
}

export function Sidebar() {
  const { page, go, t, settings, update, account, ms } = useApp();
  const collapsed = settings.sidebarCollapsed;
  // Shown for admin Minecraft accounts; every admin action is still checked by the server.
  const isAdmin = !!account?.profile?.admin || isAdminName(ms?.accounts.find((a) => a.active)?.name);
  // the highlight that slides to the page you pick
  const navRef = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState<{ top: number; height: number; left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = navRef.current?.querySelector<HTMLElement>('.nav-item[aria-current="page"]');
      setInd(el ? { top: el.offsetTop, height: el.offsetHeight, left: el.offsetLeft, width: el.offsetWidth } : null);
    };
    measure();
    const t = setTimeout(measure, 450); // after the collapse animation
    return () => clearTimeout(t);
  }, [page, collapsed, isAdmin]);
  return (
    <nav className={`sidebar ${collapsed ? "collapsed" : ""}`} aria-label="Main">
      <div className="brand"><Logo size={collapsed ? 34 : 40} />{!collapsed && <div className="brand-name">VEX<small>client</small></div>}</div>
      <div className="nav" ref={navRef}>
        {ind && <span className="nav-indicator" aria-hidden style={{ transform: `translateY(${ind.top}px)`, height: ind.height, left: ind.left, width: ind.width }} />}
        {SECTIONS.map((sec) => (
          <div key={sec.title} className="nav-section">
            {collapsed ? <hr className="nav-rule" /> : <div className="nav-title">{sec.title}</div>}
            {sec.items.filter((n) => !n.adminOnly || isAdmin).map((n) => {
              const label = t(`nav.${n.id}` as any);
              return (
                <button key={n.id} className="nav-item" aria-current={page === n.id ? "page" : undefined} onClick={() => go(n.id)} title={collapsed ? label : undefined} aria-label={label}>
                  <span className="nav-tile"><Icon name={n.icon} size={17} /></span>
                  {!collapsed && <span className="nav-label">{label}</span>}
                  {!collapsed && n.badge && <span className="nav-badge">{n.badge}</span>}
                </button>
              );
            })}
          </div>
        ))}
        <button className="nav-item" onClick={() => update({ sidebarCollapsed: !collapsed })} title={collapsed ? "Expand" : undefined} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed}>
          <span className="nav-tile"><Icon name={collapsed ? "panelOpen" : "panelClose"} size={17} /></span>{!collapsed && <span className="nav-label">Collapse</span>}
        </button>
      </div>
      <div className="sidebar-foot"><AccountBox collapsed={collapsed} /></div>
    </nav>
  );
}

export function Avatar({ name, url, size = 32 }: { name: string; url: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (url && /^https:\/\/textures\.minecraft\.net\/texture\//.test(url)) return <SkinFace url={url} name={name} size={size} />;
  return url && !broken
    ? <img src={url} alt="" width={size} height={size} style={{ width: size, height: size, borderRadius: size * 0.28, flex: "none", objectFit: "cover" }} onError={() => setBroken(true)} />
    : <span className="inst-tile" style={{ width: size, height: size, borderRadius: size * 0.28, background: "var(--gradient)", color: "#fff", fontSize: size * 0.45 }}>{name[0]?.toUpperCase()}</span>;
}

function AccountBox({ collapsed }: { collapsed: boolean }) {
  const { go, account, ms, refreshMs, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ left: r.left, bottom: window.innerHeight - r.top + 8 });
    const close = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node)) setOpen(false); };
    addEventListener("mousedown", close); addEventListener("keydown", close);
    return () => { removeEventListener("mousedown", close); removeEventListener("keydown", close); };
  }, [open]);
  const active = ms?.accounts.find((a) => a.active) ?? null;
  const modrinth = account?.signedIn ? account.profile : null;
  const addMs = async () => {
    setBusy(true);
    try { const s = await window.vex!.ms.add(); toast("success", `Signed in as ${s.accounts.find((a) => a.active)?.name ?? "your account"}`); }
    catch (e) { toast("error", "Microsoft sign-in didn't finish", errMsg(e)); }
    finally { setBusy(false); refreshMs(); }
  };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      {open && pos && createPortal(
        <div ref={menuRef} className="account-menu" role="menu" style={{ position: "fixed", left: pos.left, bottom: pos.bottom }}>
          <div className="label" style={{ padding: "4px 8px" }}>Minecraft accounts</div>
          {ms?.accounts.map((a) => (
            <button key={a.uuid} role="menuitemradio" aria-checked={a.active} className={`list-item ${a.active ? "selected" : ""}`}
              onClick={async () => { await window.vex!.ms.setActive(a.uuid); refreshMs(); setOpen(false); }}>
              <McHead uuid={a.uuid} name={a.name} size={28} />
              <span style={{ flex: 1, textAlign: "left" }}><b className="small">{a.name}</b>{a.needsLogin && <span className="tiny" style={{ display: "block", color: "var(--warn)" }}>Sign in again</span>}</span>
              {a.active && <Icon name="check" size={14} />}
            </button>
          ))}
          <button className="list-item" disabled={busy} onClick={addMs}><span className="nav-tile">{busy ? <span className="spinner" /> : <Icon name="plus" size={15} />}</span><span className="small">{busy ? "Waiting for Microsoft…" : "Add Microsoft account"}</span></button>
          <hr className="divider" />
          <div className="label" style={{ padding: "4px 8px" }}>VEX online</div>
          <button className="list-item" title={!modrinth && account?.loginError ? account.loginError : undefined}
            onClick={() => { if (!modrinth && account?.configured) window.vex?.online.loginCheck().catch(() => {}); go("friends"); setOpen(false); }}>
            <span className="nav-tile"><Icon name="friends" size={15} /></span>
            <span style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
              <span className="small" style={{ display: "block" }}>{modrinth ? `Connected as ${modrinth.username}` : account?.configured ? "Not connected" : "Not set up"}</span>
              {!modrinth && account?.configured && <span className="tiny faint" style={{ display: "block" }}>Click to connect</span>}
            </span>
            <span className={`presence-dot ${modrinth ? "online" : ""}`} style={{ position: "static", border: 0 }} />
          </button>
          <hr className="divider" />
          <button className="list-item" onClick={() => { go("settings"); setOpen(false); }}><span className="nav-tile"><Icon name="settings" size={15} /></span><span className="small">Manage accounts</span></button>
        </div>, document.body
      )}
      <button className="account-box" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} title={collapsed ? (active?.name ?? "Add account") : undefined} aria-label={active ? `Account: ${active.name}` : "Add account"}>
        {active ? <span style={{ position: "relative" }}><McHead uuid={active.uuid} name={active.name} /><span className={`presence-dot ${active.needsLogin ? "" : "online"}`} /></span> : <span className="nav-tile"><Icon name="plus" size={17} /></span>}
        {!collapsed && <span style={{ minWidth: 0, textAlign: "left", flex: 1 }}>
          <b className="small" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{active ? active.name : "No account"}</b>
          <span className="tiny faint">{active ? (active.needsLogin ? "Sign in again" : modrinth ? "Online" : "Microsoft") : "Sign in"}</span></span>}
        {!collapsed && <Icon name="chevron" size={14} />}
      </button>
    </div>
  );
}

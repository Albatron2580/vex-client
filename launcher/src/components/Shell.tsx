import { useState } from "react";
import { useApp, type PageId } from "../state/AppState";
import { Icon } from "./Icon";
import { Logo } from "./Logo";

const SECTIONS: { title: string; items: { id: PageId; icon: string; badge?: string }[] }[] = [
  { title: "Main", items: [{ id: "home", icon: "home" }, { id: "instances", icon: "cube" }, { id: "discover", icon: "discover" }] },
  { title: "Social", items: [{ id: "friends", icon: "friends" }, { id: "shop", icon: "shop", badge: "Soon" }] },
  { title: "Customization", items: [{ id: "skins", icon: "skins" }, { id: "features", icon: "features" }] },
  { title: "Client", items: [{ id: "settings", icon: "settings" }] },
];

export function TitleBar() {
  const { desktop } = useApp();
  return (
    <header className="titlebar">
      <span>VEX CLIENT · PLAY DIFFERENT</span>
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
  const { page, go, t, settings, update } = useApp();
  const collapsed = settings.sidebarCollapsed;
  return (
    <nav className={`sidebar ${collapsed ? "collapsed" : ""}`} aria-label="Main">
      <div className="brand"><Logo size={collapsed ? 34 : 40} />{!collapsed && <div className="brand-name">VEX<small>CLIENT</small></div>}</div>
      <div className="nav">
        {SECTIONS.map((sec) => (
          <div key={sec.title} className="nav-section">
            {collapsed ? <hr className="nav-rule" /> : <div className="nav-title">{sec.title}</div>}
            {sec.items.map((n) => {
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
  return url && !broken
    ? <img src={url} alt="" width={size} height={size} style={{ width: size, height: size, borderRadius: size * 0.28, flex: "none", objectFit: "cover" }} onError={() => setBroken(true)} />
    : <span className="inst-tile" style={{ width: size, height: size, borderRadius: size * 0.28, background: "var(--gradient)", color: "#fff", fontSize: size * 0.45 }}>{name[0]?.toUpperCase()}</span>;
}

function AccountBox({ collapsed }: { collapsed: boolean }) {
  const { go, account } = useApp();
  const p = account?.signedIn ? account.profile : null;
  return (
    <button className="account-box" onClick={() => go(p ? "friends" : "settings")} title={collapsed ? (p ? p.username : "Add account") : undefined} aria-label={p ? `Signed in as ${p.username}` : "Add account"}>
      {p ? <span style={{ position: "relative" }}><Avatar name={p.username} url={p.avatar} /><span className="presence-dot online" /></span> : <span className="nav-tile"><Icon name="plus" size={17} /></span>}
      {!collapsed && <span style={{ minWidth: 0, textAlign: "left" }}>
        <b className="small" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p ? p.username : "No account"}</b>
        <span className="tiny faint">{p ? "Modrinth · Online" : "Add account"}</span></span>}
    </button>
  );
}

import { tr } from "./lib/i18n";
import { useApp } from "./state/AppState";
import { Sidebar, TitleBar } from "./components/Shell";
import { Toasts } from "./components/Toasts";
import { Particles } from "./components/Particles";
import { UpdateBanner, WhatsNew } from "./components/UpdateBanner";
import { PlayBar } from "./components/PlayBar";
import { CursorTrail } from "./components/CursorTrail";
import { LoginScreen } from "./components/LoginScreen";
import { useEffect, useState } from "react";
import { HomePage } from "./pages/Home";
import { InstancesPage } from "./pages/Instances";
import { ModsPage } from "./pages/Mods";
import { SkinsPage } from "./pages/Skins";
import { FeaturesPage } from "./pages/Features";
import { ShopPage } from "./pages/Placeholder";
import { FriendsPage } from "./pages/Friends";
import { CollabPage } from "./pages/Collab";
import { AdminPage } from "./pages/Admin";
import { SettingsPage } from "./pages/Settings";

const PAGES = { home: HomePage, instances: InstancesPage, mods: ModsPage, skins: SkinsPage, features: FeaturesPage, friends: FriendsPage, collab: CollabPage, admin: AdminPage, shop: ShopPage, settings: SettingsPage };

export function App() {
  const { page, settings, ready, desktop, ms } = useApp();
  const [skipLogin, setSkipLogin] = useState(false);
  // the light under the mouse on cards and rows
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.(".card, .inst-row, .mod-card, .recent-item") as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    addEventListener("pointermove", move, { passive: true });
    return () => removeEventListener("pointermove", move);
  }, []);
  // Login check: no usable Microsoft account → login screen (can be skipped for this session).
  const needsLogin = ready && desktop && ms !== null && !ms.accounts.some((a) => a.active && !a.needsLogin);
  const Page = PAGES[page];
  return (
    <>
    <div className="app" data-effects={settings.backgroundEffects ? "on" : "off"}>
      <div className="ambient" />
      <Particles enabled={settings.particles && settings.animations !== "off"} intensity={settings.particleIntensity} />
      <TitleBar />
      <Sidebar />
      <main className={`main ${page !== "home" ? "with-playbar" : ""}`}>{ready ? <Page key={page} /> : <div className="row muted" style={{ padding: 40 }}><span className="spinner" />{tr("Loading…")}</div>}</main>
      {ready && page !== "home" && <PlayBar />}
      {needsLogin && !skipLogin && <LoginScreen onSkip={() => setSkipLogin(true)} />}
      <UpdateBanner />
      <WhatsNew />
      <Toasts />
    </div>
    {/* Outside .app so UI zoom doesn't shift it away from the real pointer position */}
    <CursorTrail trail={settings.trail} animationsOff={settings.animations === "off"} />
    </>
  );
}

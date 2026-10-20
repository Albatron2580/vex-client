import { useApp } from "./state/AppState";
import { Sidebar, TitleBar } from "./components/Shell";
import { Toasts } from "./components/Toasts";
import { Particles } from "./components/Particles";
import { UpdateBanner } from "./components/UpdateBanner";
import { PlayBar } from "./components/PlayBar";
import { CursorTrail } from "./components/CursorTrail";
import { HomePage } from "./pages/Home";
import { InstancesPage } from "./pages/Instances";
import { DiscoverPage } from "./pages/Discover";
import { SkinsPage } from "./pages/Skins";
import { FeaturesPage } from "./pages/Features";
import { ShopPage } from "./pages/Placeholder";
import { FriendsPage } from "./pages/Friends";
import { CollabPage } from "./pages/Collab";
import { AdminPage } from "./pages/Admin";
import { SettingsPage } from "./pages/Settings";

const PAGES = { home: HomePage, instances: InstancesPage, discover: DiscoverPage, skins: SkinsPage, features: FeaturesPage, friends: FriendsPage, collab: CollabPage, admin: AdminPage, shop: ShopPage, settings: SettingsPage };

export function App() {
  const { page, settings, ready } = useApp();
  const Page = PAGES[page];
  return (
    <>
    <div className="app" data-effects={settings.backgroundEffects ? "on" : "off"}>
      <div className="ambient" />
      <Particles enabled={settings.particles && settings.animations !== "off"} intensity={settings.particleIntensity} />
      <TitleBar />
      <Sidebar />
      <main className={`main ${page !== "home" ? "with-playbar" : ""}`}>{ready ? <Page key={page} /> : <div className="row muted" style={{ padding: 40 }}><span className="spinner" />Loading…</div>}</main>
      {ready && page !== "home" && <PlayBar />}
      <UpdateBanner />
      <Toasts />
    </div>
    {/* Outside .app so UI zoom doesn't shift it away from the real pointer position */}
    <CursorTrail trail={settings.trail} animationsOff={settings.animations === "off"} />
    </>
  );
}

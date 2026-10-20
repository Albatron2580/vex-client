import type { LauncherSettings, Instance } from "../electron/shared/settingsModel";
import type { FoundInstance, ImportPart } from "../electron/ipc/importers";
import type { SetupState } from "../electron/ipc/onlineSetup";
export type { SetupState };
export type { FoundInstance, ImportPart };

export interface AppInfo { version: string; platform: string; totalMemMb: number; defaultMinecraftDir: string; defaultMinecraftDirExists: boolean; downloadsDir: string }
export type SkinLookupResult =
  | { ok: true; name: string; uuid: string; model: "classic" | "slim"; skinDataUrl: string; capeDataUrl: string | null }
  | { ok: false; reason: "invalid" | "not-found" | "rate-limited" | "network"; message: string };
export interface LibrarySkin { id: string; name: string; model: "classic" | "slim"; addedAt: number; dataUrl: string }
export interface ShortcutStatus { supported: boolean; packaged: boolean; desktop: boolean; startMenu: boolean }
export type UpdateState =
  | { status: "idle" | "checking" | "up-to-date" | "unsupported"; checkedAt?: number; message?: string }
  | { status: "downloading"; version: string; pct: number }
  | { status: "ready"; version: string; notes: string }
  | { status: "error"; message: string; checkedAt?: number };
export interface Profile { id: string; username: string; avatar: string | null; mcName?: string | null; admin?: boolean }
export interface Announcement { id: number; title: string; body: string; kind: "news" | "update" | "warning"; author: string; createdAt: number }
export interface Featured { name: string; address: string; description: string; version: string; updatedBy?: string }
export interface PublicHome { announcements: Announcement[]; featured: Featured | null; configured?: boolean; offline?: boolean }
export interface ServerStatus { online: boolean; players: { online: number; max: number } | null; version: string | null; motd: string | null; unknown?: boolean }
export interface RecipeMod { projectId: string; versionId: string; title: string; file: string }
export interface Recipe { name: string; version: string; loader: Instance["loader"]; memoryMb: number; mods: RecipeMod[]; missing: string[] }
export interface Share { id: number; createdAt: number; from: { id: string; username: string; avatar?: string | null }; to: { id: string; username: string }; instance: Recipe }
export interface AdminOverview { users: number; online: number; newWeek: number; openBugs: number; banned: number; friendships: number; serverVersion: string; admins: string[] }
export interface AdminUser { id: string; username: string; avatar: string | null; online: boolean; status: string; lastSeen: number | null; mcName: string | null; banned: boolean; admin: boolean; joined: number }
export interface BugReport { id: number; title: string; body: string; version: string | null; status: string; createdAt: number; by: string }
export interface GithubStatus { connected: boolean; login?: string; runs?: { id: number; status: string; conclusion: string | null; createdAt: string; url: string; title: string }[]; releases?: { tag: string; name: string; publishedAt: string; url: string }[] }
export interface AccountState { configured: boolean; serviceUrl: string; signedIn: boolean; profile: Profile | null; persistent: boolean }
export interface Friend extends Profile { online?: boolean; status?: "online" | "playing" | "offline"; detail?: string | null; lastSeen?: number | null }
export interface MsAccount { uuid: string; name: string; active: boolean; needsLogin: boolean }
export interface MsStatus { secureStorage: boolean; accounts: MsAccount[] }
export interface GameSettings { javaPath: string; width: number; height: number; windowMode: "windowed" | "fullscreen" }
export type GameEvent =
  | { type: "status"; text: string }
  | { type: "task"; id: string; label: string; received?: number; total?: number; done?: boolean }
  | { type: "log"; lines: string[] }
  | { type: "game"; state: "starting" | "running" | "closed" | "idle"; profileId: string; code?: number; crashed?: boolean }
  | { type: "accounts" };
export interface ModFile { file: string; enabled: boolean; size: number; sha1: string }
export interface ModInfo { title: string; icon: string | null; slug: string; version: string }
export interface LogSession { id: string; instanceId: string; name: string; state: "starting" | "running" | "closed"; startedAt: number; endedAt: number | null; code: number | null; lines: string[] }
export interface VersionList { versions: { id: string; type: string; releaseTime: string }[]; latest: string | null; fromCache: boolean; error?: string }

declare global {
  interface Window {
    vex?: {
      win: { minimize(): Promise<void>; maximize(): Promise<void>; close(): Promise<void> };
      appInfo(): Promise<AppInfo>;
      settings: { get(): Promise<LauncherSettings>; set(s: LauncherSettings): Promise<LauncherSettings> };
      instances: { list(): Promise<Instance[]>; save(i: Instance): Promise<Instance>; remove(id: string, deleteFiles: boolean): Promise<boolean>; newId(): Promise<string> };
      versions(): Promise<VersionList>;
      skins: {
        lookup(name: string): Promise<SkinLookupResult>;
        library(): Promise<LibrarySkin[]>;
        add(name: string, model: string, bytes: Uint8Array): Promise<LibrarySkin>;
        remove(id: string): Promise<boolean>;
      };
      files: {
        saveAs(name: string, ext: "png" | "zip" | "json", bytes: Uint8Array): Promise<{ ok: boolean; canceled?: boolean; path?: string }>;
        installPack(target: string, fileName: string, bytes: Uint8Array): Promise<{ ok: true; path: string }>;
        pickDir(title: string): Promise<string | null>;
        open(what: "logs" | "userData" | "path", p?: string): Promise<string>;
      };
      shortcuts: { status(): Promise<ShortcutStatus>; set(kind: "desktop" | "startMenu", enabled: boolean): Promise<ShortcutStatus> };
      ms: {
        status(): Promise<MsStatus>; add(): Promise<MsStatus>; setActive(uuid: string): Promise<MsStatus>; signOut(uuid: string): Promise<MsStatus>;
        skin(uuid: string): Promise<{ dataUrl: string; slim: boolean } | null>;
        capes(uuid: string): Promise<{ id: string; alias: string; url: string; active: boolean }[]>;
        setCape(uuid: string, id: string | null): Promise<{ id: string; alias: string; url: string; active: boolean }[]>;
      };
      game: {
        settings(): Promise<GameSettings>; setSettings(p: Partial<GameSettings>): Promise<GameSettings>;
        state(): Promise<{ state: "idle" | "starting" | "running"; profileId?: string }>;
        launch(id: string, join?: { host: string; port: number }): Promise<void>; stop(): Promise<void>; openLog(): Promise<string>;
        logSessions(): Promise<LogSession[]>; openLogsWindow(): Promise<void>;
        onEvent(cb: (e: GameEvent) => void): () => void;
      };
      onInstancesChanged(cb: () => void): () => void;
      mods: {
        list(id: string): Promise<ModFile[]>; info(hashes: string[]): Promise<Record<string, ModInfo>>;
        toggle(id: string, file: string, enabled: boolean): Promise<ModFile[]>; remove(id: string, file: string): Promise<ModFile[]>;
        add(id: string): Promise<{ added: number; mods: ModFile[] } | null>;
      };
      loaderVersions(): Promise<Record<string, string>>;
      online: {
        home(): Promise<PublicHome>; serviceVersion(): Promise<string | null>; bundledServerVersion(): Promise<string | null>;
        link(): Promise<AccountState>; reportBug(title: string, body: string): Promise<unknown>;
        serverStatus(address: string): Promise<ServerStatus>;
      };
      collab: {
        shares(): Promise<{ incoming: Share[]; sent: Share[] }>; dismiss(id: number): Promise<unknown>;
        share(instanceId: string, friendId: string): Promise<{ mods: number; missing: string[] }>;
        install(recipe: Recipe): Promise<{ instance: Instance; installed: number; failed: string[] }>;
        onProgress(cb: (p: { done: number; total: number; title: string }) => void): () => void;
      };
      admin: {
        overview(): Promise<AdminOverview>; users(q: string, filter: string): Promise<AdminUser[]>; ban(id: string, banned: boolean): Promise<unknown>;
        announce(t: string, b: string, k: string): Promise<PublicHome>; unannounce(id: number): Promise<PublicHome>;
        setFeatured(f: Partial<Featured>): Promise<PublicHome>; clearFeatured(): Promise<PublicHome>;
        bugs(status: string): Promise<BugReport[]>; setBug(id: number, status: string): Promise<unknown>;
        githubStatus(): Promise<GithubStatus>; githubConnect(token: string): Promise<GithubStatus>; githubDisconnect(): Promise<GithubStatus>;
        publish(bump: string, notes: string): Promise<GithubStatus>;
      };
      account: { get(): Promise<AccountState>; login(): Promise<AccountState>; cancel(): Promise<void>; logout(): Promise<void>; onChange(cb: (s: AccountState) => void): () => void };
      friends: {
        list(): Promise<{ friends: Friend[]; incoming: Friend[]; outgoing: Friend[] }>;
        search(q: string): Promise<(Friend & { relation: "none" | "friends" | "outgoing" | "incoming" })[]>;
        add(id: string): Promise<{ relation: string }>; remove(id: string): Promise<{ relation: string }>;
      };
      onlineSetup: {
        state(): Promise<SetupState>; progress(): Promise<{ started: boolean; database: boolean; deployed: boolean; url: string | null; modrinth: boolean }>; start(): Promise<SetupState>; modrinth(clientId: string, secret: string): Promise<SetupState>;
        open(which: "modrinth" | "cloudflare"): Promise<void>; onState(cb: (s: SetupState) => void): () => void;
      };
      onSettingsChanged(cb: (s: LauncherSettings) => void): () => void;
      importer: {
        scan(): Promise<FoundInstance[]>; pickFolder(): Promise<FoundInstance[] | null>;
        measure(inst: FoundInstance, parts: ImportPart[]): Promise<number>;
        run(inst: FoundInstance, parts: ImportPart[], name: string, version: string): Promise<Instance>;
        onProgress(cb: (p: { pct: number; item: string }) => void): () => void;
      };
      updater: { state(): Promise<UpdateState>; check(): Promise<UpdateState>; install(): Promise<void>; onState(cb: (s: UpdateState) => void): () => void };
      notify(title: string, body: string): Promise<void>;
      log(level: "info" | "warn" | "error", msg: string): Promise<void>;
    };
  }
}
export {};

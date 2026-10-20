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
export interface Profile { id: string; username: string; avatar: string | null }
export interface AccountState { configured: boolean; serviceUrl: string; signedIn: boolean; profile: Profile | null; persistent: boolean }
export interface Friend extends Profile { online?: boolean; status?: "online" | "playing" | "offline"; detail?: string | null; lastSeen?: number | null }
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
      account: { get(): Promise<AccountState>; login(): Promise<AccountState>; cancel(): Promise<void>; logout(): Promise<void>; onChange(cb: (s: AccountState) => void): () => void };
      friends: {
        list(): Promise<{ friends: Friend[]; incoming: Friend[]; outgoing: Friend[] }>;
        search(q: string): Promise<(Friend & { relation: "none" | "friends" | "outgoing" | "incoming" })[]>;
        add(id: string): Promise<{ relation: string }>; remove(id: string): Promise<{ relation: string }>;
      };
      onlineSetup: {
        state(): Promise<SetupState>; start(): Promise<SetupState>; modrinth(clientId: string, secret: string): Promise<SetupState>;
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

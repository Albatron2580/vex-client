// Languages: every visible English text in the launcher goes through tr("English text").
// A language is a JSON file in src/locales/<id>.json that maps the English text to the translation.
// Anything missing falls back to English, so a partly translated language still works.
// "{0}", "{1}" are filled in with the values passed after the text: tr("Hey {0}", name).
import nl from "../locales/nl.json";
import de from "../locales/de.json";
import fr from "../locales/fr.json";
import es from "../locales/es.json";
import pt from "../locales/pt.json";
import it from "../locales/it.json";
import pl from "../locales/pl.json";
import tr_ from "../locales/tr.json";
import ru from "../locales/ru.json";
import uk from "../locales/uk.json";
import cs from "../locales/cs.json";
import sv from "../locales/sv.json";
import ro from "../locales/ro.json";
import ja from "../locales/ja.json";
import ko from "../locales/ko.json";
import zh from "../locales/zh.json";

type Dict = Record<string, string>;
const DICTS: Record<string, Dict> = { nl, de, fr, es, pt, it, pl, tr: tr_, ru, uk, cs, sv, ro, ja, ko, zh };

/** Shown in Settings → Language, each in its own language. */
export const LANGUAGES: { id: string; label: string }[] = [
  { id: "auto", label: "System language" },
  { id: "en", label: "English" },
  { id: "nl", label: "Nederlands" },
  { id: "de", label: "Deutsch" },
  { id: "fr", label: "Français" },
  { id: "es", label: "Español" },
  { id: "pt", label: "Português (Brasil)" },
  { id: "it", label: "Italiano" },
  { id: "pl", label: "Polski" },
  { id: "tr", label: "Türkçe" },
  { id: "ru", label: "Русский" },
  { id: "uk", label: "Українська" },
  { id: "cs", label: "Čeština" },
  { id: "sv", label: "Svenska" },
  { id: "ro", label: "Română" },
  { id: "ja", label: "日本語" },
  { id: "ko", label: "한국어" },
  { id: "zh", label: "简体中文" },
];
export const LANGUAGE_IDS = LANGUAGES.map((l) => l.id);

/** "auto" → the computer's language if VEX has it, otherwise English. */
export function resolveLanguage(id: string): string {
  if (id && id !== "auto") return DICTS[id] || id === "en" ? id : "en";
  const sys = (typeof navigator !== "undefined" ? navigator.languages?.[0] ?? navigator.language : "en") || "en";
  const base = sys.toLowerCase().split(/[-_]/)[0];
  return DICTS[base] ? base : "en";
}

let current: Dict | undefined;
let currentId = "en";
function setLanguage(id: string) {
  currentId = resolveLanguage(id);
  current = DICTS[currentId];
}
export const languageId = () => currentId;

// The language is known before anything renders (texts in constants are translated when the page loads),
// so the choice is kept in localStorage too and the window reloads when it changes.
const STORE = "vex.language";
let stored = "auto";
try { stored = localStorage.getItem(STORE) || "auto"; } catch { /* no storage: computer language */ }
setLanguage(stored);

/** Called once the real settings are loaded, and whenever Language changes in Settings. */
export function syncLanguage(id: string) {
  if (id === stored) return;
  const before = currentId;
  stored = id;
  try { localStorage.setItem(STORE, id); } catch { /* ignore */ }
  if (resolveLanguage(id) !== before) setTimeout(() => location.reload(), 400); // let the settings save first
}

export function tr(text: string, ...args: unknown[]): string {
  const s = current?.[text] || text;
  return args.length ? s.replace(/\{(\d)\}/g, (m, i) => (Number(i) < args.length ? String(args[Number(i)]) : m)) : s;
}

// The older keyed lookups (nav.home, home.play …) map onto the same dictionaries.
const KEYS = {
  "nav.home": "Home", "nav.instances": "Instances", "nav.mods": "Mods", "nav.skins": "Skins",
  "nav.features": "Features", "nav.friends": "Friends", "nav.collab": "Collab", "nav.admin": "Admin", "nav.shop": "Shop", "nav.settings": "Settings",
  "home.welcome": "Welcome back", "home.play": "Play",
} as const;
type Key = keyof typeof KEYS;
export const translator = (_lang: string) => (k: Key) => tr(KEYS[k] ?? k);

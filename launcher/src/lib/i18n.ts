// Language architecture: add a dictionary and list it in LANGUAGES. Missing keys fall back to English.
const en = {
  "nav.home": "Home", "nav.instances": "Instances", "nav.discover": "Discover", "nav.skins": "Skins",
  "nav.features": "Features", "nav.friends": "Friends", "nav.collab": "Collab", "nav.admin": "Admin", "nav.shop": "Shop", "nav.settings": "Settings",
  "home.welcome": "Welcome back", "home.play": "PLAY",
} as const;
type Key = keyof typeof en;
const nl: Partial<Record<Key, string>> = {
  "nav.home": "Start", "nav.instances": "Instanties", "nav.discover": "Ontdekken", "nav.skins": "Skins",
  "nav.features": "Functies", "nav.friends": "Vrienden", "nav.collab": "Samen", "nav.admin": "Beheer", "nav.shop": "Winkel", "nav.settings": "Instellingen",
  "home.welcome": "Welkom terug", "home.play": "SPELEN",
};
const DICTS: Record<string, Partial<Record<Key, string>>> = { en, nl };
export const LANGUAGES = [{ id: "en", label: "English" }, { id: "nl", label: "Nederlands (partial)" }];
export const translator = (lang: string) => (k: Key) => DICTS[lang]?.[k] ?? en[k];

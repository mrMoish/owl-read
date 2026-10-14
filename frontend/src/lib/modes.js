/**
 * Centralized authoritative configuration for learning modes.
 */

export const MODES = {
  "ru-es": {
    id: "ru-es",
    path: "/ru-es/",
    source: "ru",
    target: "es",
    transliterate: false,
    pair: "ru → es",
    title: "Для тех кто учит русский и знает алфавит",
    subtitle: "для тех кто учит русский и знает алфавит",
    description: "Ежедневное чтение на русском с переводом на испанский при нажатии на слова.",
  },
  "es-ru": {
    id: "es-ru",
    path: "/es-ru/",
    source: "es",
    target: "ru",
    transliterate: false,
    pair: "es → ru",
    title: "Para hispanohablantes",
    subtitle: "для тех кто учит испанский и знает алфавит",
    description: "Lectura diaria en español con traducción al ruso al tocar cada palabra.",
  },
  "ru-es-translit": {
    id: "ru-es-translit",
    path: "/ru-es-translit/",
    source: "ru",
    target: "es",
    transliterate: true,
    pair: "ru → es (транслитерация)",
    title: "Для тех кто учит русский но не знает алфавит",
    subtitle: "для тех кто учит русский но не знает алфавит",
    description: "Ежедневное чтение на русском с транслитерацией текста и переводом.",
  },
  "en-ru": {
    id: "en-ru",
    path: "/en-ru/",
    source: "en",
    target: "ru",
    transliterate: false,
    pair: "en → ru",
    title: "Для тех кто учит английский и знает алфавит",
    subtitle: "для тех кто учит английский и знает алфавит",
    description: "Ежедневное чтение на английском с переводом на русский при нажатии на слова.",
  },
  "es-ru-translit": {
    id: "es-ru-translit",
    path: "/es-ru-translit/",
    source: "es",
    target: "ru",
    transliterate: true,
    pair: "es → ru (транслитерация)",
    title: "Para hispanohablantes (nivel inicial)",
    subtitle: "для испаноговорящих: учит русский (начальный уровень, не знает алфавит)",
    description: "Lectura diaria en español con transliteración del texto en ruso al tocar cada palabra.",
  },
};

export const DEFAULT_MODE = MODES["ru-es"];

const SELECTED_MODE_KEY = "reader.selected_mode";

function getStorage() {
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  if (typeof localStorage !== "undefined") return localStorage;
  return null;
}

export function loadSelectedMode() {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(SELECTED_MODE_KEY);
    if (!raw) return null;
    if (MODES[raw]) return MODES[raw];
    const resolved = getModeByPath(raw);
    return resolved !== DEFAULT_MODE || raw.startsWith("/s") || raw.startsWith("/ru-es") ? resolved : null;
  } catch {
    return null;
  }
}

export function saveSelectedMode(modeIdOrPath) {
  const storage = getStorage();
  if (!storage) return;
  try {
    if (!modeIdOrPath) return;
    let modeId = modeIdOrPath;
    if (typeof modeIdOrPath === "object" && modeIdOrPath.id) {
      modeId = modeIdOrPath.id;
    } else if (MODES[modeIdOrPath]) {
      modeId = modeIdOrPath;
    } else {
      const mode = getModeByPath(modeIdOrPath);
      if (mode) modeId = mode.id;
    }
    if (typeof modeId === "string" && MODES[modeId]) {
      storage.setItem(SELECTED_MODE_KEY, modeId);
    }
  } catch {
    // Ignore storage errors
  }
}

export function getModeByPath(pathname = "") {
  if (!pathname || typeof pathname !== "string") return DEFAULT_MODE;
  const path = pathname.toLowerCase();

  // Canonical routes
  if (path.startsWith("/ru-es-translit")) return MODES["ru-es-translit"];
  if (path.startsWith("/es-ru-translit")) return MODES["es-ru-translit"];
  if (path.startsWith("/ru-es")) return MODES["ru-es"];
  if (path.startsWith("/es-ru")) return MODES["es-ru"];
  if (path.startsWith("/en-ru")) return MODES["en-ru"];

  // Backward compatibility routes
  if (path.startsWith("/s3")) return MODES["ru-es-translit"];
  if (path.startsWith("/s1") || path.startsWith("/es")) return MODES["ru-es"];
  if (path.startsWith("/s2") || path.startsWith("/ru")) return MODES["es-ru"];
  if (path.startsWith("/s4") || path.startsWith("/en")) return MODES["en-ru"];

  return DEFAULT_MODE;
}

export function activeMode() {
  if (typeof window !== "undefined" && window.location?.pathname) {
    const path = window.location.pathname;
    if (path !== "/" && path !== "") {
      const mode = getModeByPath(path);
      saveSelectedMode(mode.id);
      return mode;
    }
  }
  return DEFAULT_MODE;
}

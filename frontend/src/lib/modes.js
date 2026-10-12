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
const MODE_STORAGE_KEY = "reader.selected_mode";

export function loadSelectedMode() {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const savedId = window.localStorage.getItem(MODE_STORAGE_KEY);
    if (savedId && MODES[savedId]) {
      return MODES[savedId];
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

export function saveSelectedMode(modeId) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    if (modeId && MODES[modeId]) {
      window.localStorage.setItem(MODE_STORAGE_KEY, modeId);
    }
  } catch {
    // Ignore storage errors
  }
}

export function getModeByPath(pathname = "") {
  if (!pathname || typeof pathname !== "string") return null;
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

  return null;
}

export function activeMode() {
  if (typeof window !== "undefined" && window.location?.pathname) {
    const modeFromPath = getModeByPath(window.location.pathname);
    if (modeFromPath) {
      saveSelectedMode(modeFromPath.id);
      return modeFromPath;
    }
  }
  const savedMode = loadSelectedMode();
  if (savedMode) return savedMode;

  return DEFAULT_MODE;
}

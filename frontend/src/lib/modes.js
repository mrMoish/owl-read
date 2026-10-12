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
    title: "Для русскоговорящих",
    subtitle: "Русскоговорящие учат испанский",
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
    subtitle: "Испаноговорящие учат русский",
    description: "Lectura diaria en español con traducción al ruso al tocar cada palabra.",
  },
  "ru-es-translit": {
    id: "ru-es-translit",
    path: "/ru-es-translit/",
    source: "ru",
    target: "es",
    transliterate: true,
    pair: "ru → es (транслитерация)",
    title: "Для русскоговорящих (с транслитерацией)",
    subtitle: "Русскоговорящие учат испанский с транслитерацией",
    description: "Ежедневное чтение на русском с транслитерацией слова и переводом.",
  },
  "en-ru": {
    id: "en-ru",
    path: "/en-ru/",
    source: "en",
    target: "ru",
    transliterate: false,
    pair: "en → ru",
    title: "Для русскоговорящих",
    subtitle: "Русскоговорящие учат английский",
    description: "Ежедневное чтение на английском с переводом на русский при нажатии на слова.",
  },
};

export const DEFAULT_MODE = MODES["ru-es"];

export function getModeByPath(pathname = "") {
  if (!pathname || typeof pathname !== "string") return DEFAULT_MODE;
  const path = pathname.toLowerCase();

  // Canonical routes
  if (path.startsWith("/ru-es-translit")) return MODES["ru-es-translit"];
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
    return getModeByPath(window.location.pathname);
  }
  return DEFAULT_MODE;
}

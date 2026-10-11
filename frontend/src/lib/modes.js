/**
 * Centralized configuration for learning modes (S1, S2, S3, S4).
 */

export const MODES = {
  s1: {
    id: "s1",
    path: "/s1/",
    source: "ru",
    target: "es",
    transliterate: false,
    pair: "ru → es",
    title: "Для русскоговорящих",
    subtitle: "Русскоговорящие учат испанский",
    description: "Ежедневное чтение на русском с переводом на испанский при нажатии на слова.",
  },
  s2: {
    id: "s2",
    path: "/s2/",
    source: "es",
    target: "ru",
    transliterate: false,
    pair: "es → ru",
    title: "Para hispanohablantes",
    subtitle: "Испаноговорящие учат русский",
    description: "Lectura diaria en ruso con traducción al español al tocar cada palabra.",
  },
  s3: {
    id: "s3",
    path: "/s3/",
    source: "ru",
    target: "es",
    transliterate: true,
    pair: "ru → es (транслитерация)",
    title: "Для русскоговорящих (транслитерация)",
    subtitle: "Русскоговорящие учат испанский с транслитерацией",
    description: "Ежедневное чтение на русском с транслитерацией слова и переводом.",
  },
  s4: {
    id: "s4",
    path: "/s4/",
    source: "en",
    target: "ru",
    transliterate: false,
    pair: "en → ru",
    title: "Для русскоговорящих",
    subtitle: "Русскоговорящие учат английский",
    description: "Ежедневное чтение на английском с переводом на русский при нажатии на слова.",
  },
};

export const DEFAULT_MODE = MODES.s1;

export function getModeByPath(pathname = "") {
  if (!pathname || typeof pathname !== "string") return DEFAULT_MODE;
  const path = pathname.toLowerCase();
  if (path.startsWith("/s1")) return MODES.s1;
  if (path.startsWith("/s2")) return MODES.s2;
  if (path.startsWith("/s3")) return MODES.s3;
  if (path.startsWith("/s4")) return MODES.s4;

  // Backward compatibility routes
  if (path.startsWith("/es")) return MODES.s1;
  if (path.startsWith("/ru")) return MODES.s2;
  if (path.startsWith("/en")) return MODES.s4;

  return DEFAULT_MODE;
}

export function activeMode() {
  if (typeof window !== "undefined" && window.location?.pathname) {
    return getModeByPath(window.location.pathname);
  }
  return DEFAULT_MODE;
}

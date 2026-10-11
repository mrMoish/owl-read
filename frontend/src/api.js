const BASE = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL || "").replace(/\/$/, "");

async function j(path, opts) {
  const r = await fetch(`${BASE}${path}`, { cache: "no-store", ...opts });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export const syncBrochure = (langMode = "ru") => {
  const langParam = typeof langMode === "boolean" ? (langMode ? "en" : "ru") : langMode;
  return j(`/api/brochures/sync?lang=${langParam}`);
};

export const fetchDaily = (date, langMode = "ru") => {
  const langParam = typeof langMode === "boolean" ? (langMode ? "en" : "ru") : langMode;
  const query = langParam === "en" ? `date=${date}&en=1` : (langParam === "es" ? `date=${date}&lang=es` : `date=${date}&lang=ru`);
  return j(`/api/daily?${query}`);
};

export const requestTranslations = (date, langMode = "ru") => {
  const langParam = typeof langMode === "boolean" ? (langMode ? "en" : "ru") : langMode;
  const query = langParam === "en" ? `date=${date}&en=1` : (langParam === "es" ? `date=${date}&lang=es` : `date=${date}&lang=ru`);
  return j(`/api/daily/translations?${query}`, { method: "POST" });
};

export const translateWord = (payload) => j(`/api/translate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

export const fetchTtsAudio = (payload) => j(`/api/tts`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

export const fetchPronunciation = (payload) => j(`/api/pronunciation`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

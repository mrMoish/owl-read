const L = "reader.learned";
const safe = (f, d) => { try { return f(); } catch { return d; } };

import { normalizeLemma } from "./learned.js";

export const loadLearnedWords = () => safe(() => {
  return JSON.parse(localStorage.getItem(L) || "{}");
}, {});

export const saveLearnedWords = (data) => safe(() => {
  localStorage.setItem(L, JSON.stringify(data));
});

export const addLearnedWord = (lemma, translation) => safe(() => {
  const norm = normalizeLemma(lemma);
  if (!norm || !translation) return loadLearnedWords();
  const current = loadLearnedWords();
  const existing = current[norm] || {
    lemma: norm,
    translations: [],
    createdAt: Date.now(),
  };

  const translations = Array.isArray(existing.translations)
    ? [...existing.translations]
    : [];
  if (!translations.includes(translation)) {
    translations.push(translation);
  }

  current[norm] = {
    ...existing,
    lemma: norm,
    primaryTranslation: translation,
    translations,
    updatedAt: Date.now(),
  };

  saveLearnedWords(current);
  return current;
}, {});

export const removeLearnedWord = (lemma) => safe(() => {
  const norm = normalizeLemma(lemma);
  if (!norm) return loadLearnedWords();
  const current = loadLearnedWords();
  delete current[norm];
  saveLearnedWords(current);
  return current;
}, {});

export const clearLearnedWords = () => safe(() => {
  localStorage.removeItem(L);
  return {};
}, {});

export const localDate = (now = new Date()) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
};

export const loadDaily = (lang = "ru") => safe(() => {
  const key = lang === "en" ? "reader.daily.en" : (lang === "es" ? "reader.daily.es" : "reader.daily");
  return JSON.parse(localStorage.getItem(key) || "null");
}, null);

export const saveDaily = (d, lang = "ru") => safe(() => {
  const key = lang === "en" ? "reader.daily.en" : (lang === "es" ? "reader.daily.es" : "reader.daily");
  localStorage.setItem(key, JSON.stringify(d));
});

export const loadUserSettings = () => safe(() => {
  return JSON.parse(localStorage.getItem("reader.settings") || "{}");
}, {});

export const saveUserSettings = (settings) => safe(() => {
  const current = loadUserSettings();
  const updated = { ...current, ...settings };
  localStorage.setItem("reader.settings", JSON.stringify(updated));
  return updated;
});

export const loadDailyReadStatus = (date) => safe(() => {
  if (!date) return false;
  const key = `reader.daily_read.${date}`;
  return localStorage.getItem(key) === "true";
}, false);

export const saveDailyReadStatus = (date, status = true) => safe(() => {
  if (!date) return;
  const key = `reader.daily_read.${date}`;
  localStorage.setItem(key, status ? "true" : "false");
});

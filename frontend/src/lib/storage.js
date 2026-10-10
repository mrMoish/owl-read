const P = "reader.translations";
const L = "reader.learned";
const safe = (f, d) => { try { return f(); } catch { return d; } };

import { normalizeLemma } from "./learned.js";

export const loadTranslations = (date) => safe(() => {
  const raw = JSON.parse(localStorage.getItem(P) || "{}");
  return raw[date] || {};
}, {});

export const saveTranslations = (date, data) => safe(() => {
  const raw = JSON.parse(localStorage.getItem(P) || "{}");
  raw[date] = data;
  localStorage.setItem(P, JSON.stringify(raw));
});

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
  const key = lang === "en" ? "reader.daily.en" : "reader.daily";
  return JSON.parse(localStorage.getItem(key) || "null");
}, null);

export const saveDaily = (d, lang = "ru") => safe(() => {
  const key = lang === "en" ? "reader.daily.en" : "reader.daily";
  localStorage.setItem(key, JSON.stringify(d));
});

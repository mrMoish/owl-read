const P = "reader.translations";
const safe = (f, d) => { try { return f(); } catch { return d; } };

export const loadTranslations = (date) => safe(() => {
  const raw = JSON.parse(localStorage.getItem(P) || "{}");
  return raw[date] || {};
}, {});

export const saveTranslations = (date, data) => safe(() => {
  const raw = JSON.parse(localStorage.getItem(P) || "{}");
  raw[date] = data;
  localStorage.setItem(P, JSON.stringify(raw));
});

/** Выравнивания предложений и активные юниты — отдельно от простых переводов. */
const ALIGN = "reader.align.v1";

export const loadAlignState = (date) => safe(() => {
  const raw = JSON.parse(localStorage.getItem(ALIGN) || "{}");
  const d = raw[date];
  return d && typeof d === "object"
    ? { alignments: d.alignments || {}, active: Array.isArray(d.active) ? d.active : [] }
    : { alignments: {}, active: [] };
}, { alignments: {}, active: [] });

export const saveAlignState = (date, alignments = {}, active = new Set()) => safe(() => {
  const raw = JSON.parse(localStorage.getItem(ALIGN) || "{}");
  raw[date] = { alignments, active: [...active] };
  localStorage.setItem(ALIGN, JSON.stringify(raw));
});

export const localDate = (now = new Date()) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
};

export const loadDaily = () => safe(() => JSON.parse(localStorage.getItem("reader.daily") || "null"), null);
export const saveDaily = (d) => safe(() => localStorage.setItem("reader.daily", JSON.stringify(d)));

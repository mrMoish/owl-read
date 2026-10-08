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

export const localDate = (now = new Date()) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
};

export const loadDaily = () => safe(() => JSON.parse(localStorage.getItem("reader.daily") || "null"), null);
export const saveDaily = (d) => safe(() => localStorage.setItem("reader.daily", JSON.stringify(d)));

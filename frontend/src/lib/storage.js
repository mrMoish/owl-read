const P = "reader.percent", C = "reader.daily";
const safe = (f, d) => { try { return f(); } catch { return d; } };
export const loadPercent = () => safe(() => Math.min(50, Math.max(0, Number(localStorage.getItem(P)) || 0)), 0);
export const savePercent = (v) => safe(() => localStorage.setItem(P, String(v)));
export const loadDaily = () => safe(() => JSON.parse(localStorage.getItem(C)), null);
export const saveDaily = (d) => safe(() => localStorage.setItem(C, JSON.stringify(d)));
export function localDate(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

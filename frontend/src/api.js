const BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
async function j(path, opts) {
  const r = await fetch(`${BASE}${path}`, { cache: "no-store", ...opts });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
export const fetchDaily = (date, isEn = false) => {
  const query = isEn ? `date=${date}&en=1` : `date=${date}`;
  return j(`/api/daily?${query}`);
};

export const requestTranslations = (date, isEn = false) => {
  const query = isEn ? `date=${date}&en=1` : `date=${date}`;
  return j(`/api/daily/translations?${query}`, { method: "POST" });
};

export const translateWord = (payload) => j(`/api/translate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

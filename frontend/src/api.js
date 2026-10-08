const BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
async function j(path, opts) {
  const r = await fetch(`${BASE}${path}`, { cache: "no-store", ...opts });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
export const fetchDaily = (date) => j(`/api/daily?date=${date}`);
export const translateWord = (payload) => j(`/api/translate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

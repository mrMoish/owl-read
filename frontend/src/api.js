const BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
async function j(path, opts) {
  console.log("[fetch] Request:", path, opts);
  const r = await fetch(`${BASE}${path}`, { cache: "no-store", ...opts });
  console.log("[fetch] Response status:", r.status, "for path:", path);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const json = await r.json();
  console.log("[fetch] Response body:", json);
  return json;
}
export const fetchDaily = (date) => j(`/api/daily?date=${date}`);
export const translateWord = (payload) => j(`/api/translate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

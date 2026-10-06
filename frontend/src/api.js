async function j(url, opts) {
  const r = await fetch(url, { cache: "no-store", ...opts });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
export const fetchDaily = (date) => j(`/api/daily?date=${date}`);
export const requestTranslations = (date) => j(`/api/daily/translations?date=${date}`, { method: "POST" });

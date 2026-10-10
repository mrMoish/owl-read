import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDaily, requestTranslations } from "./api.js";
import { loadDaily, localDate, saveDaily, resolveLanguageMode } from "./lib/storage.js";
import { initialData, offlineState } from "./lib/offline.js";

export function isEnglishMode() {
  return resolveLanguageMode() === "en";
}

function activeDate() {
  if (typeof window !== "undefined" && window.location?.search) {
    const q = new URLSearchParams(window.location.search).get("date");
    if (q && /^\d{4}-\d{1,2}-\d{1,2}$/.test(q)) return q;
  }
  return localDate();
}

/** При каждом запуске грузит материал дня и заранее подготавливает переводы. */
export function useDaily() {
  const isEn = isEnglishMode();
  const [state, setState] = useState(() => {
    const cached = loadDaily(isEn ? "en" : "ru");
    const target = activeDate();
    return { data: initialData(cached, target), loading: true, error: null, notice: null, isEn };
  });
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const date = activeDate();
    const langKey = isEn ? "en" : "ru";
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      let data = await fetchDaily(date, isEn);
      saveDaily(data, langKey);
      setState({ data, loading: false, error: null, notice: data.notice, isEn });
      if (data.translations_status === "pending" || data.translations_status === "partial") {
        try {
          const t = await requestTranslations(date, isEn);
          data = {
            ...data,
            translations: { ...(data.translations || {}), ...(t.translations || {}) },
            translations_status: t.translations_status,
          };
          saveDaily(data, langKey);
          setState((s) => ({ ...s, data }));
        } catch {
          // Если фоновый перевод не удался, слова останутся на русском
        }
      }
    } catch (e) {
      // Сети нет: показываем сохранённый выпуск любой даты — обязательно с пометкой
      setState((s) => ({
        ...s, loading: false,
        ...offlineState({ shownData: s.data, cached: loadDaily(langKey), targetDate: date }),
      }));
    } finally { busy.current = false; }
  }, [isEn]);

  useEffect(() => {
    load();
    let day = activeDate();
    const onVisible = () => { if (document.visibilityState === "visible" && activeDate() !== day) { day = activeDate(); load(); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  return { ...state, reload: load };
}

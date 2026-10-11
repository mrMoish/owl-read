import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDaily, requestTranslations } from "./api.js";
import { loadDaily, localDate, saveDaily } from "./lib/storage.js";
import { initialData, offlineState } from "./lib/offline.js";
import { isEnglishPath, isSpanishPath, isRussianPath } from "./lib/language.js";

export function isEnglishMode() {
  if (typeof window !== "undefined" && window.location?.pathname) {
    return isEnglishPath(window.location.pathname);
  }
  return false;
}

export function activeLangMode() {
  if (typeof window !== "undefined" && window.location?.pathname) {
    if (isEnglishPath(window.location.pathname)) return "en";
    if (isSpanishPath(window.location.pathname)) return "es";
    if (isRussianPath(window.location.pathname)) return "ru";
  }
  return "ru";
}

function activeDate() {
  if (typeof window !== "undefined" && window.location?.search) {
    const q = new URLSearchParams(window.location.search).get("date");
    if (q && /^\d{4}-\d{1,2}-\d{1,2}$/.test(q)) return q;
  }
  return localDate();
}

/** Автоматическая синка брошюры при прямом переходе по ссылке /es или /ru */
async function syncBrochure(lang) {
  try {
    await fetch(`/api/brochures/sync?lang=${lang}`);
  } catch {
    // Ошибка синхронизации брошюры не ломает интерфейс
  }
}

/** При каждом запуске грузит материал дня и заранее подготавливает переводы. */
export function useDaily() {
  const langMode = activeLangMode();
  const isEn = langMode === "en";
  const [state, setState] = useState(() => {
    const cached = loadDaily(langMode);
    const target = activeDate();
    return { data: initialData(cached, target), loading: true, error: null, notice: null, isEn, langMode };
  });
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const date = activeDate();
    const langKey = langMode;
    setState((s) => ({ ...s, loading: true, error: null }));

    // Автоматическая подгрузка/проверка брошюры для выбранного языка
    syncBrochure(langMode);

    try {
      let data = await fetchDaily(date, langMode);
      saveDaily(data, langKey);
      setState({ data, loading: false, error: null, notice: data.notice, isEn: langMode === "en", langMode });
      if (data.translations_status === "pending" || data.translations_status === "partial") {
        try {
          const t = await requestTranslations(date, langMode);
          data = {
            ...data,
            translations: { ...(data.translations || {}), ...(t.translations || {}) },
            translations_status: t.translations_status,
          };
          saveDaily(data, langKey);
          setState((s) => ({ ...s, data }));
        } catch {
          // Если фоновый перевод не удался, слова останутся исходными
        }
      }
    } catch (e) {
      // Сети нет: показываем сохранённый выпуск любой даты — обязательно с пометкой
      setState((s) => ({
        ...s, loading: false,
        ...offlineState({ shownData: s.data, cached: loadDaily(langKey), targetDate: date }),
      }));
    } finally { busy.current = false; }
  }, [langMode]);

  useEffect(() => {
    load();
    let day = activeDate();
    const onVisible = () => { if (document.visibilityState === "visible" && activeDate() !== day) { day = activeDate(); load(); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  return { ...state, reload: load };
}

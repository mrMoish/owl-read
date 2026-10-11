import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDaily, requestTranslations, syncBrochure } from "./api.js";
import { loadDaily, localDate, saveDaily } from "./lib/storage.js";
import { initialData, offlineState } from "./lib/offline.js";
import { activeMode, getModeByPath } from "./lib/modes.js";

function activeDate() {
  if (typeof window !== "undefined" && window.location?.search) {
    const q = new URLSearchParams(window.location.search).get("date");
    if (q && /^\d{4}-\d{1,2}-\d{1,2}$/.test(q)) return q;
  }
  return localDate();
}

/** При каждом запуске грузит материал дня для активного режима чтения. */
export function useDaily() {
  const mode = activeMode();
  const langMode = mode.source;
  const isEn = langMode === "en";

  const [state, setState] = useState(() => {
    const cached = loadDaily(langMode);
    const target = activeDate();
    return { data: initialData(cached, target), loading: true, error: null, notice: null, isEn, langMode, mode };
  });
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const date = activeDate();
    const currentMode = activeMode();
    const langKey = currentMode.source;

    setState((s) => ({ ...s, loading: true, error: null, mode: currentMode }));

    // Автоматическая подгрузка/проверка брошюры для языка источника режима
    syncBrochure(langKey).catch(() => {});

    try {
      let data = await fetchDaily(date, langKey);
      saveDaily(data, langKey);
      setState({ data, loading: false, error: null, notice: data.notice, isEn: langKey === "en", langMode: langKey, mode: currentMode });

      if (data.translations_status === "pending" || data.translations_status === "partial") {
        try {
          const t = await requestTranslations(date, langKey);
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
  }, []);

  useEffect(() => {
    load();
    let day = activeDate();
    const onVisible = () => { if (document.visibilityState === "visible" && activeDate() !== day) { day = activeDate(); load(); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  return { ...state, reload: load };
}

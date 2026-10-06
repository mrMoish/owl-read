import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDaily, requestTranslations } from "./api.js";
import { loadDaily, localDate, saveDaily } from "./lib/storage.js";

/** При каждом запуске (и при возврате в приложение в новый день) спрашивает backend о материале дня. */
export function useDaily() {
  const [state, setState] = useState(() => ({ data: loadDaily(), loading: true, error: null, notice: null }));
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const date = localDate();
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      let data = await fetchDaily(date);
      saveDaily(data);
      setState({ data, loading: false, error: null, notice: data.notice });
      if (data.translations_status === "pending" || data.translations_status === "partial") {
        try {
          const t = await requestTranslations(date);
          data = { ...data, translations: t.translations, translations_status: t.translations_status };
          saveDaily(data);
          setState((s) => ({ ...s, data }));
        } catch { /* слова просто останутся русскими */ }
      }
    } catch (e) {
      setState((s) => ({
        ...s, loading: false,
        error: s.data ? null : "Не удалось получить материал. Проверьте подключение и попробуйте снова.",
        notice: s.data ? (s.data.date === date
          ? "Нет связи с сервером — показан сохранённый выпуск."
          : `Не удалось обновить материал. Показан сохранённый выпуск за ${s.data.date}.`) : null,
      }));
    } finally { busy.current = false; }
  }, []);

  useEffect(() => {
    load();
    let day = localDate();
    const onVisible = () => { if (document.visibilityState === "visible" && localDate() !== day) { day = localDate(); load(); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  return { ...state, reload: load };
}

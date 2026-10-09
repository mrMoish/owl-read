// Правила показа материала при недоступности сети и быстрого запуска из кэша.
// Кэш другой даты показывается только при ошибке загрузки и всегда с пометкой —
// устаревший текст никогда не выдаётся за текущий (причина отката прошлой версии офлайна).

export const OFFLINE_ERROR = "Не удалось получить материал. Проверьте подключение и попробуйте снова.";

/** Быстрый путь при запуске: кэш показываем сразу, лишь когда он совпадает с целевой датой. */
export function initialData(cached, targetDate) {
  return cached?.date === targetDate ? cached : null;
}

/**
 * Что показать пользователю, когда сеть недоступна.
 * Приоритет: уже отображённый материал → последний сохранённый выпуск → ошибка.
 *
 * @param {Object|null} shownData материал, уже отрисованный на экране
 * @param {Object|null} cached последний сохранённый выпуск из localStorage
 * @param {string} targetDate дата, которую пользователь запросил
 * @returns {{data: Object|null, error: string|null, notice: string|null}}
 */
export function offlineState({ shownData, cached, targetDate }) {
  const data = shownData ?? cached ?? null;
  if (!data) return { data: null, error: OFFLINE_ERROR, notice: null };
  return {
    data,
    error: null,
    notice: data.date === targetDate
      ? "Нет связи с сервером — показан сохранённый выпуск."
      : `Не удалось обновить материал. Показан сохранённый выпуск за ${data.date}.`,
  };
}

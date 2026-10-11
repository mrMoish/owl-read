/**
 * Утилиты для сопоставления словоформ и применения глобально запомненных переводов.
 */

/**
 * Нормализует лемму или слово к единому виду (нижний регистр, очистка от пунктуации).
 */
export function normalizeLemma(text) {
  if (!text) return "";
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[^\wа-яёáéíóúñü]+|[^\wа-яёáéíóúñü]+$/gi, "");
}

/**
 * Находит все id токенов в meta, которые соответствуют заданной лемме.
 * Токены являются целыми словами с уникальными id, что исключает замену частей других слов.
 */
export function findMatchingTokenIds(meta = {}, targetLemma) {
  const normTarget = normalizeLemma(targetLemma);
  if (!normTarget) return [];

  const matched = [];
  for (const [idStr, info] of Object.entries(meta)) {
    const lemma = normalizeLemma(info?.lemma || info?.w);
    if (lemma === normTarget) {
      matched.push(idStr);
    }
  }
  return matched;
}

/**
 * Применяет глобально запомненные слова к структуре текста.
 *
 * Для каждого токена с подходящей леммой:
 * - В первую очередь используется собственный подготовленный перевод токена (из preparedTranslations),
 *   так как он уже учитывает контекст конкретного предложения;
 * - Если подготовленный перевод для токена отсутствует (например, фоновый перевод ещё не завершён),
 *   используется сохранённый основной перевод леммы (primaryTranslation).
 */
export function applyLearnedTranslations({
  meta = {},
  preparedTranslations = {},
  learnedWords = {},
} = {}) {
  const result = {};
  const learnedKeys = Object.keys(learnedWords);
  if (learnedKeys.length === 0) {
    return result;
  }

  for (const [idStr, info] of Object.entries(meta)) {
    const lemma = normalizeLemma(info?.lemma || info?.w);
    const learned = learnedWords[lemma];
    if (learned) {
      const originalWord = info?.w;
      // 1. Приоритет: контекстный перевод именно этого предложения из подготовленных переводов
      const contextPrepared = preparedTranslations[idStr];
      const translationCandidate =
        contextPrepared && contextPrepared !== originalWord
          ? contextPrepared
          : learned.primaryTranslation;

      if (translationCandidate && translationCandidate !== originalWord) {
        result[idStr] = translationCandidate;
      }
    }
  }

  return result;
}

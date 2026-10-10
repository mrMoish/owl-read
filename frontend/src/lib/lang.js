/**
 * Вычисляет языковой атрибут (lang) для абзаца с учетом доли переведённых слов.
 * Если переведено БОЛЕЕ 50% отображаемых слов (translatedCount / totalWords > 0.5),
 * возвращается целевой язык (targetLang, например 'es' или 'en').
 * Иначе возвращается русский ('ru').
 */
export function countWordsAndTranslations(nodes = [], translations = {}) {
  let totalWords = 0;
  let translatedWords = 0;

  function traverse(list) {
    if (!Array.isArray(list)) return;
    for (const node of list) {
      if (!node) continue;
      if (node.t === "w") {
        totalWords++;
        const id = String(node.id);
        if (translations[id]) {
          translatedWords++;
        }
      } else if (Array.isArray(node.c)) {
        traverse(node.c);
      }
    }
  }

  traverse(nodes);
  return { totalWords, translatedWords };
}

export function getParagraphLang(nodes = [], translations = {}, targetLang = "ru", sourceLang = "ru") {
  const { totalWords, translatedWords } = countWordsAndTranslations(nodes, translations);
  if (totalWords > 0 && translatedWords / totalWords > 0.5) {
    return targetLang;
  }
  return sourceLang;
}

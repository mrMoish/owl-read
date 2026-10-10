/**
 * Утилиты для лингвистически обоснованной перестановки порядка слов
 * при переводе с русского на испанский (es) и английский (en) языки.
 */

// Леммы и слова-исключения для испанского языка (прилагательные, которые обычно ставятся ПЕРЕД существительным):
// - порядковые и ограничительные: последний, первый, второй, следующий и т.д.
// - оценочно-размерные: большой, великий, малый, плохой, хороший, каждый, какой, иной, другой и т.д.
const ES_PRE_NOUN_ADJ_LEMMAS = new Set([
  "последний",
  "первый",
  "второй",
  "третий",
  "четвертый",
  "пятый",
  "следующий",
  "прошлый",
  "большой",
  "великий",
  "малый",
  "маленький", // Если переводится как "gran" или фиксированное выражение, но "маленькая группа" -> "grupo pequeño"
  "хороший",
  "плохой",
  "лучший",
  "худший",
  "каждый",
  "какой",
  "иной",
  "другой",
  "новый",
]);

/**
 * Определение части речи: прилагательное (исходя из POS metadata или морфологии).
 */
export function isAdj(word, info = {}) {
  const pos = String(info.pos || "").toUpperCase();
  if (["ADJF", "ADJS", "PRTF", "PRTS", "COMP"].includes(pos)) {
    return true;
  }
  if (pos && pos !== "") {
    return false;
  }
  const w = String(word || "").toLowerCase();
  return /(ая|яя|ый|ий|ой|ое|ее|ые|ие|им|ым|их|ых|ого|его|ому|ему|ую|юю)$/i.test(w);
}

/**
 * Определение части речи: существительное.
 */
export function isNoun(word, info = {}) {
  const pos = String(info.pos || "").toUpperCase();
  if (pos === "NOUN") {
    return true;
  }
  if (pos && pos !== "") {
    return false;
  }
  const w = String(word || "").toLowerCase();
  return w.length > 1 && !isAdj(word, info) && /[а-яё]/i.test(w);
}

/**
 * Проверяет, входит ли словосочетание в известную идиому или фиксированное выражение,
 * которое не должно переставляться (например, "в последний раз", "в первый раз").
 */
function isFixedExpression(w1, w2, meta = {}) {
  const info1 = meta[String(w1.id)] || {};
  const info2 = meta[String(w2.id)] || {};
  const lemma1 = (info1.lemma || w1.s || "").toLowerCase();
  const lemma2 = (info2.lemma || w2.s || "").toLowerCase();
  const sent = (info1.sent || info2.sent || "").toLowerCase();

  // Выражения типа "последний раз", "первый раз"
  if ((lemma1 === "последний" || lemma1 === "первый") && lemma2 === "раз") {
    return true;
  }
  if (sent.includes("последний раз") || sent.includes("первый раз")) {
    if (lemma1 === "последний" || lemma2 === "раз") return true;
  }

  return false;
}

/**
 * Определяет, нужно ли переставить пару w1 (прилагательное) и w2 (существительное).
 */
export function shouldSwapPair(w1, w2, translations = {}, meta = {}, lang = "es") {
  if (!w1 || !w2 || w1.t !== "w" || w2.t !== "w") {
    return false;
  }

  // Для английского языка порядок Adj + Noun совпадает с русским ("small group", "interesting book", "last time").
  if (lang === "en") {
    return false;
  }

  const id1 = String(w1.id);
  const id2 = String(w2.id);
  const tr1 = translations[id1];
  const tr2 = translations[id2];

  // Перестановка выполняется только если ОБА слова переведены
  if (!tr1 || !tr2) {
    return false;
  }

  const info1 = meta[id1] || {};
  const info2 = meta[id2] || {};

  // Проверяем, что w1 — прилагательное, а w2 — существительное
  if (!isAdj(w1.s, info1) || !isNoun(w2.s, info2)) {
    return false;
  }

  // Не переставляем фиксированные выражения
  if (isFixedExpression(w1, w2, meta)) {
    return false;
  }

  const lemma1 = (info1.lemma || w1.s || "").toLowerCase();
  const tr1Lower = String(tr1).toLowerCase().trim();

  // Исключения для испанского:
  // 1. "большая проблема" -> "gran проблема" (апокопа "gran" ставится перед существительным)
  if (lemma1 === "большой" || tr1Lower === "gran" || tr1Lower.startsWith("gran ")) {
    return false;
  }

  // 2. Порядковые/ограничительные прилагательные ("последний", "первый" и т.д.)
  if (lemma1 === "последний" || lemma1 === "первый" || lemma1 === "следующий") {
    return false;
  }

  // 3. Если переведённое слово w1 явным образом ставится перед существительным
  if (ES_PRE_NOUN_ADJ_LEMMAS.has(lemma1) && lemma1 !== "маленький" && lemma1 !== "интересный") {
    return false;
  }

  // Стандартное правило для испанского языка: качественные прилагательные идут после существительного
  // ("маленькая группа" -> "grupo pequeño", "интересная книга" -> "libro interesante")
  return true;
}

/**
 * Переупорядочивает список узлов (nodes) в соответствии с лингвистическими правилами целевого языка.
 * Функция идемпотентна: повторный вызов не ломает уже переупорядоченную структуру.
 */
export function reorderNodes(nodes = [], translations = {}, meta = {}, lang = "es") {
  if (!Array.isArray(nodes) || nodes.length < 1) {
    return nodes;
  }

  // Сначала рекурсивно обрабатываем вложенные узлы (c)
  const processedNodes = nodes.map((node) => {
    if (node && Array.isArray(node.c)) {
      return {
        ...node,
        c: reorderNodes(node.c, translations, meta, lang),
      };
    }
    return node;
  });

  if (processedNodes.length < 2) {
    return processedNodes;
  }

  const result = [];
  let i = 0;

  while (i < processedNodes.length) {
    const node = processedNodes[i];

    // Поиск пары интерактивных слов (w1 и w2)
    if (node && node.t === "w") {
      let j = i + 1;
      const between = [];
      while (j < processedNodes.length && processedNodes[j] && processedNodes[j].t === "text") {
        between.push(processedNodes[j]);
        j++;
      }

      if (j < processedNodes.length && processedNodes[j] && processedNodes[j].t === "w") {
        const w1 = node;
        const w2 = processedNodes[j];

        if (shouldSwapPair(w1, w2, translations, meta, lang)) {
          // Меняем местами w1 и w2, сохраняя разделительный текст (пробелы/пунктуацию)
          result.push(w2, ...between, w1);
          i = j + 1;
          continue;
        }
      }
    }

    result.push(node);
    i++;
  }

  return result;
}

/**
 * Утилиты для определения изменения порядка слов (прилагательное + существительное)
 * и перестановки узлов для корректного порядка слов в испанском языке.
 */

export function isAdj(word, info = {}) {
  const pos = String(info.pos || "").toUpperCase();
  if (["ADJF", "ADJS", "PRTF", "PRTS", "COMP"].includes(pos)) {
    return true;
  }
  if (pos && pos !== "") {
    return false;
  }
  // Fallback для проверки русскоязычных окончаний прилагательных
  const w = String(word || "").toLowerCase();
  return /(ая|яя|ый|ий|ой|ое|ее|ые|ие|им|ым|их|ых|ого|его|ому|ему|ую|юю)$/i.test(w);
}

export function isNoun(word, info = {}) {
  const pos = String(info.pos || "").toUpperCase();
  if (pos === "NOUN") {
    return true;
  }
  if (pos && pos !== "") {
    return false;
  }
  // Fallback если POS не передан
  const w = String(word || "").toLowerCase();
  return w.length > 1 && !isAdj(word, info) && /[а-яё]/i.test(w);
}

export function shouldSwapPair(w1, w2, translations = {}, meta = {}) {
  if (!w1 || !w2 || w1.t !== "w" || w2.t !== "w") {
    return false;
  }
  const info1 = meta[String(w1.id)] || {};
  const info2 = meta[String(w2.id)] || {};

  if (isAdj(w1.s, info1) && isNoun(w2.s, info2)) {
    const tr1 = Boolean(translations[String(w1.id)]);
    const tr2 = Boolean(translations[String(w2.id)]);
    if (tr1 && tr2) {
      return true;
    }
  }
  return false;
}

/**
 * Переупорядочивает список узлов (nodes), если соседняя пара (Прилагательное + Существительное)
 * переведена так, что порядок слов в испанском меняется на (Существительное + Прилагательное).
 */
export function reorderNodes(nodes = [], translations = {}, meta = {}) {
  if (!Array.isArray(nodes) || nodes.length < 2) {
    return nodes;
  }

  const result = [];
  let i = 0;

  while (i < nodes.length) {
    const node = nodes[i];

    // Если это узел с дочерними элементами (например, em, strong, a)
    if (node && Array.isArray(node.c)) {
      result.push({
        ...node,
        c: reorderNodes(node.c, translations, meta),
      });
      i++;
      continue;
    }

    // Ищем следующее интерактивное слово после i
    if (node && node.t === "w") {
      let j = i + 1;
      const between = [];
      while (j < nodes.length && nodes[j] && nodes[j].t === "text") {
        between.push(nodes[j]);
        j++;
      }

      if (j < nodes.length && nodes[j] && nodes[j].t === "w") {
        const w1 = node;
        const w2 = nodes[j];

        if (shouldSwapPair(w1, w2, translations, meta)) {
          // Меняем местами w1 и w2
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

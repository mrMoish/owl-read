/**
 * Утилиты для обработки порядка слов в тексте.
 *
 * Словосочетания сохраняют естественный порядок слов исходного предложения,
 * чтобы не переставлять слова местами при переводе на английский и испанский языки.
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

export function shouldSwapPair(w1, w2, translations = {}, meta = {}) {
  return false;
}

/**
 * Сохраняет исходный порядок узлов предложения.
 */
export function reorderNodes(nodes = [], translations = {}, meta = {}) {
  if (!Array.isArray(nodes) || nodes.length < 2) {
    return nodes;
  }

  return nodes.map((node) => {
    if (node && Array.isArray(node.c)) {
      return {
        ...node,
        c: reorderNodes(node.c, translations, meta),
      };
    }
    return node;
  });
}

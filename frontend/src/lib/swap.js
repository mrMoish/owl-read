/**
 * Утилиты для лингвистически обоснованной перестановки порядка слов
 * при переводе с русского на испанский (es) и английский (en) языки.
 */

// Русский язык: Леммы определителей, местоимений-прилагательных, числительных
// и пре-позиционных прилагательных, которые остаются перед существительным.
const RU_PRE_NOUN_LEMMAS = new Set([
  // Указательные местоимения (Demonstratives)
  "этот", "тот", "такой", "сей", "оный", "эдакий", "таковой",
  // Притяжательные местоимения (Possessives)
  "мой", "твой", "свой", "наш", "ваш", "его", "ее", "её", "их",
  // Относительные и вопросительные (Relatives & Interrogatives)
  "который", "какой", "чей", "каков", "сколько",
  // Определительные, неопределенные, отрицательные, кванторы (Determiners / Indefinites)
  "каждый", "всякий", "любой", "весь", "всяческий", "некоторый", "никакой", "некий", "иной", "другой", "один", "сам", "самый",
  // Порядковые и числительные (Ordinals & Numerals)
  "первый", "второй", "третий", "четвертый", "четвёртый", "пятый", "шестой", "седьмой", "восьмой", "девятый", "десятый",
  "последний", "следующий", "прошлый",
  // Оценочно-размерные и качественные пре-позиционные в испанском/русском
  "большой", "великий", "малый", "хороший", "плохой", "лучший", "худший", "новый",
]);

// Испанский язык: Слова/леммы/апокопы, которые ставятся перед существительным (Pre-noun determiners & adjectives)
const ES_PRE_NOUN_WORDS = new Set([
  // Demonstratives
  "este", "esta", "estos", "estas", "ese", "esa", "esos", "esas", "aquel", "aquella", "aquellos", "aquellas",
  // Possessives
  "mi", "mis", "tu", "tus", "su", "sus", "nuestro", "nuestra", "nuestros", "nuestras", "vuestro", "vuestra", "vuestros", "vuestras",
  // Relatives / Interrogatives
  "que", "qué", "cual", "cuál", "cuyo", "cuya", "cuyos", "cuyas", "cuanto", "cuántos",
  // Indefinites / Quantifiers
  "cada", "todo", "toda", "todos", "todas", "mismo", "misma", "mismos", "mismas", "otro", "otra", "otros", "otras",
  "algún", "alguno", "alguna", "algunos", "algunas", "ningún", "ninguno", "ninguna",
  "mucho", "mucha", "muchos", "muchas", "poco", "poca", "pocos", "pocas", "varios", "varias", "cierto", "cierta", "ciertos", "ciertas",
  // Apocopes & Pre-noun Adjectives
  "gran", "buen", "bueno", "buenas", "buenos", "mal", "malo", "malas", "malos",
  "primer", "primero", "primera", "primeros", "primeras",
  "tercer", "tercero", "tercera", "terceros", "terceras",
  "segundo", "segunda", "último", "última", "últimos", "últimas", "nuevo", "nueva", "nuevos", "nuevas",
]);

/**
 * Определение части речи: прилагательное/определитель (исходя из POS metadata или морфологии).
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
 * Определяет, нужно ли переставить пару w1 (прилагательное/определитель) и w2 (существительное).
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

  // Проверяем, что w1 — прилагательное/определитель, а w2 — существительное
  if (!isAdj(w1.s, info1) || !isNoun(w2.s, info2)) {
    return false;
  }

  // Не переставляем фиксированные выражения
  if (isFixedExpression(w1, w2, meta)) {
    return false;
  }

  const lemma1 = (info1.lemma || w1.s || "").toLowerCase();
  const tr1Lower = String(tr1).toLowerCase().trim();

  // 1. Если исходное русское слово (лемма) или его перевод являются пре-позиционным определителем,
  // притяжательным/указательным/относительным местоимением, числительным или пре-позиционным прилагательным
  // в испанском языке (например, "этот" -> "este", "мой" -> "mi", "который" -> "que", "первый" -> "primer", "большая" -> "gran"),
  // порядок слов НЕ меняется.
  if (RU_PRE_NOUN_LEMMAS.has(lemma1) || ES_PRE_NOUN_WORDS.has(tr1Lower)) {
    return false;
  }

  const tr1FirstWord = tr1Lower.split(/\s+/)[0];
  if (ES_PRE_NOUN_WORDS.has(tr1FirstWord)) {
    return false;
  }

  // Стандартное правило для испанского языка: качественные описательные прилагательные идут после существительного
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

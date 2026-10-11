/**
  Транслитерация текста для пользователей, не знающих алфавит изучаемого языка.
 */

const RU_TO_LATIN = {
  А: "A", Б: "B", В: "V", Г: "G", Д: "D", Е: "E", Ё: "Yo", Ж: "Zh",
  З: "Z", И: "I", Й: "Y", К: "K", Л: "L", М: "M", Н: "N", О: "O",
  П: "P", Р: "R", С: "S", Т: "T", У: "U", Ф: "F", Х: "Kh", Ц: "Ts",
  Ч: "Ch", Ш: "Sh", Щ: "Sch", Ъ: "", Ы: "Y", Ь: "'", Э: "E", Ю: "Yu", Я: "Ya",
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh",
  з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
  ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "'", э: "e", ю: "yu", я: "ya",
};

const ES_TO_CYRILLIC = {
  ch: "ч", Ch: "Ч", CH: "Ч",
  ll: "й", Ll: "Й", LL: "Й",
  qu: "к", Qu: "К", QU: "К",
  rr: "рр", Rr: "Рр", RR: "РР",
  a: "а", b: "б", c: "к", d: "д", e: "э", f: "ф", g: "г", h: "", i: "и",
  j: "х", k: "к", l: "л", m: "м", n: "н", ñ: "нь", o: "о", p: "п", q: "к",
  r: "р", s: "с", t: "т", u: "у", v: "в", w: "в", x: "кс", y: "и", z: "с",
  á: "а", é: "э", í: "и", ó: "о", ú: "у", ü: "у",
  A: "А", B: "Б", C: "К", D: "Д", E: "Э", F: "Ф", G: "Г", H: "", I: "И",
  J: "Х", K: "К", L: "Л", M: "М", N: "Н", Ñ: "Нь", O: "О", P: "П", Q: "К",
  R: "Р", S: "С", T: "Т", U: "У", V: "В", W: "В", X: "Кс", Y: "И", Z: "С",
  Á: "А", É: "Э", Í: "И", Ó: "О", Ú: "У", Ü: "У",
};

export function transliterateRussianToLatin(text) {
  if (!text || typeof text !== "string") return text;
  return text
    .split("")
    .map((char) => RU_TO_LATIN[char] || char)
    .join("");
}

export function transliterateSpanishToCyrillic(text) {
  if (!text || typeof text !== "string") return text;
  let res = text;
  res = res.replace(/ch/g, "ч").replace(/Ch/g, "Ч").replace(/CH/g, "Ч");
  res = res.replace(/ll/g, "й").replace(/Ll/g, "Й").replace(/LL/g, "Й");
  res = res.replace(/qu/g, "к").replace(/Qu/g, "К").replace(/QU/g, "К");
  res = res.replace(/rr/g, "рр").replace(/Rr/g, "Рр").replace(/RR/g, "РР");

  return res
    .split("")
    .map((char) => ES_TO_CYRILLIC[char] || char)
    .join("");
}

export function transliterateNode(node, sourceLang = "ru", targetLang = "es") {
  if (!node) return node;
  if (node.t === "text" || node.t === "w") {
    const orig = node.s || "";
    let str = orig;
    if (sourceLang === "ru") {
      str = transliterateRussianToLatin(orig);
    } else if (sourceLang === "es") {
      str = transliterateSpanishToCyrillic(orig);
    }
    return { ...node, s: str };
  }
  if (node.c && Array.isArray(node.c)) {
    return {
      ...node,
      c: node.c.map((child) => transliterateNode(child, sourceLang, targetLang)),
    };
  }
  return node;
}

export function transliterateBlock(block, sourceLang = "ru", targetLang = "es") {
  if (!block || !block.nodes) return block;
  return {
    ...block,
    nodes: block.nodes.map((node) => transliterateNode(node, sourceLang, targetLang)),
  };
}

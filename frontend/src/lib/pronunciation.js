/**
 * Utility for word pronunciation audio playback and generating
 * phonetic transcription (IPA) and Russian pronunciation hints.
 */
import { fetchPronunciation, fetchTtsAudio } from "../api.js";

export async function speakWord(text, lang = "es", sentence = "") {
  const clean = text.trim();
  if (!clean) return;
  try {
    const res = await fetchTtsAudio({ word: clean, sentence, lang });
    if (res && res.audio_b64) {
      const mime = res.format === "mp3" ? "audio/mp3" : "audio/wav";
      const audio = new Audio(`data:${mime};base64,${res.audio_b64}`);
      await audio.play();
    }
  } catch (e) {
    console.warn("TTS audio failed:", e);
  }
}

// Common English words dictionary (lower-cased)
const EN_DICT = {
  the: { ipa: "[ðə]", ruHint: "зэ" },
  and: { ipa: "[ænd]", ruHint: "энд" },
  to: { ipa: "[tuː]", ruHint: "ту" },
  of: { ipa: "[əv]", ruHint: "ов" },
  a: { ipa: "[ə]", ruHint: "эй" },
  in: { ipa: "[ɪn]", ruHint: "ин" },
  that: { ipa: "[ðæt]", ruHint: "зэт" },
  have: { ipa: "[hæv]", ruHint: "хэв" },
  i: { ipa: "[aɪ]", ruHint: "ай" },
  it: { ipa: "[ɪt]", ruHint: "ит" },
  for: { ipa: "[fɔːr]", ruHint: "фор" },
  not: { ipa: "[nɑːt]", ruHint: "нот" },
  on: { ipa: "[ɑːn]", ruHint: "он" },
  with: { ipa: "[wɪð]", ruHint: "уиз" },
  he: { ipa: "[hiː]", ruHint: "хи" },
  as: { ipa: "[æz]", ruHint: "эз" },
  you: { ipa: "[juː]", ruHint: "ю" },
  do: { ipa: "[duː]", ruHint: "ду" },
  at: { ipa: "[æt]", ruHint: "эт" },
  this: { ipa: "[ðɪs]", ruHint: "зис" },
  but: { ipa: "[bʌt]", ruHint: "бат" },
  his: { ipa: "[hɪz]", ruHint: "хиз" },
  by: { ipa: "[baɪ]", ruHint: "бай" },
  from: { ipa: "[frɑːm]", ruHint: "фром" },
  they: { ipa: "[ðeɪ]", ruHint: "зэй" },
  we: { ipa: "[wiː]", ruHint: "уи" },
  say: { ipa: "[seɪ]", ruHint: "сэй" },
  her: { ipa: "[hɜːr]", ruHint: "хёр" },
  she: { ipa: "[ʃiː]", ruHint: "ши" },
  or: { ipa: "[ɔːr]", ruHint: "ор" },
  an: { ipa: "[æn]", ruHint: "эн" },
  will: { ipa: "[wɪl]", ruHint: "уил" },
  my: { ipa: "[maɪ]", ruHint: "май" },
  one: { ipa: "[wʌn]", ruHint: "уан" },
  all: { ipa: "[ɔːl]", ruHint: "ол" },
  would: { ipa: "[wʊd]", ruHint: "вуд" },
  there: { ipa: "[ðer]", ruHint: "зэр" },
  their: { ipa: "[ðer]", ruHint: "зэр" },
  what: { ipa: "[wɑːt]", ruHint: "уот" },
  so: { ipa: "[soʊ]", ruHint: "со́у" },
  up: { ipa: "[ʌp]", ruHint: "ап" },
  out: { ipa: "[aʊt]", ruHint: "аут" },
  if: { ipa: "[ɪf]", ruHint: "иф" },
  about: { ipa: "[əˈbaʊt]", ruHint: "эба́ут" },
  who: { ipa: "[huː]", ruHint: "ху" },
  get: { ipa: "[ɡet]", ruHint: "гет" },
  which: { ipa: "[wɪtʃ]", ruHint: "уич" },
  go: { ipa: "[ɡoʊ]", ruHint: "го́у" },
  me: { ipa: "[miː]", ruHint: "ми" },
  when: { ipa: "[wen]", ruHint: "уэн" },
  make: { ipa: "[meɪk]", ruHint: "мэйк" },
  can: { ipa: "[kæn]", ruHint: "кэн" },
  like: { ipa: "[laɪk]", ruHint: "лайк" },
  time: { ipa: "[taɪm]", ruHint: "тайм" },
  no: { ipa: "[noʊ]", ruHint: "но́у" },
  just: { ipa: "[dʒʌst]", ruHint: "джаст" },
  him: { ipa: "[hɪm]", ruHint: "хим" },
  know: { ipa: "[noʊ]", ruHint: "но́у" },
  take: { ipa: "[teɪk]", ruHint: "тэйк" },
  people: { ipa: "[ˈpiːpl]", ruHint: "пи́пл" },
  into: { ipa: "[ˈɪntuː]", ruHint: "и́нту" },
  year: { ipa: "[jɪr]", ruHint: "йир" },
  your: { ipa: "[jɔːr]", ruHint: "йор" },
  good: { ipa: "[ɡʊd]", ruHint: "гуд" },
  some: { ipa: "[sʌm]", ruHint: "сам" },
  could: { ipa: "[kʊd]", ruHint: "куд" },
  them: { ipa: "[ðem]", ruHint: "зэм" },
  see: { ipa: "[siː]", ruHint: "си" },
  other: { ipa: "[ˈʌðər]", ruHint: "а́зэр" },
  than: { ipa: "[ðæn]", ruHint: "зэн" },
  then: { ipa: "[ðen]", ruHint: "зэн" },
  now: { ipa: "[naʊ]", ruHint: "нау" },
  look: { ipa: "[lʊk]", ruHint: "лук" },
  only: { ipa: "[ˈoʊnli]", ruHint: "о́унли" },
  come: { ipa: "[kʌm]", ruHint: "кам" },
  its: { ipa: "[ɪts]", ruHint: "итс" },
  over: { ipa: "[ˈoʊvər]", ruHint: "о́увэр" },
  think: { ipa: "[θɪŋk]", ruHint: "синк" },
  also: { ipa: "[ˈɔːlsoʊ]", ruHint: "о́лсоу" },
  back: { ipa: "[bæk]", ruHint: "бэк" },
  after: { ipa: "[ˈæftər]", ruHint: "э́фтэр" },
  use: { ipa: "[juːz]", ruHint: "юз" },
  two: { ipa: "[tuː]", ruHint: "ту" },
  how: { ipa: "[haʊ]", ruHint: "хау" },
  our: { ipa: "[ˈaʊər]", ruHint: "а́уэр" },
  work: { ipa: "[wɜːrk]", ruHint: "уорк" },
  first: { ipa: "[fɜːrst]", ruHint: "фёрст" },
  well: { ipa: "[wel]", ruHint: "уэл" },
  way: { ipa: "[weɪ]", ruHint: "вэй" },
  even: { ipa: "[ˈiːvn]", ruHint: "и́вэн" },
  new: { ipa: "[nuː]", ruHint: "нью" },
  want: { ipa: "[wɑːnt]", ruHint: "уонт" },
  because: { ipa: "[bɪˈkɔːz]", ruHint: "бико́з" },
  any: { ipa: "[ˈeni]", ruHint: "э́ни" },
  these: { ipa: "[ðiːz]", ruHint: "зиз" },
  give: { ipa: "[ɡɪv]", ruHint: "гив" },
  day: { ipa: "[deɪ]", ruHint: "дэй" },
  most: { ipa: "[moʊst]", ruHint: "мо́уст" },
  us: { ipa: "[ʌs]", ruHint: "ас" },
  is: { ipa: "[ɪz]", ruHint: "из" },
  was: { ipa: "[wəz]", ruHint: "уоз" },
  are: { ipa: "[ɑːr]", ruHint: "ар" },
  been: { ipa: "[bɪn]", ruHint: "бин" },
  were: { ipa: "[wɜːr]", ruHint: "уэр" },
  has: { ipa: "[hæz]", ruHint: "хэз" },
  had: { ipa: "[hæd]", ruHint: "хэд" },
  word: { ipa: "[wɜːrd]", ruHint: "уорд" },
  words: { ipa: "[wɜːrdz]", ruHint: "уордз" },
  god: { ipa: "[ɡɑːd]", ruHint: "гад" },
  lord: { ipa: "[lɔːrd]", ruHint: "лорд" },
  love: { ipa: "[lʌv]", ruHint: "лав" },
  life: { ipa: "[laɪf]", ruHint: "лайф" },
  light: { ipa: "[laɪt]", ruHint: "лайт" },
  truth: { ipa: "[truːθ]", ruHint: "трус" },
  faith: { ipa: "[feɪθ]", ruHint: "фэйс" },
  peace: { ipa: "[piːs]", ruHint: "пис" },
  heart: { ipa: "[hɑːrt]", ruHint: "харт" },
  hope: { ipa: "[hoʊp]", ruHint: "хо́уп" },
  prayer: { ipa: "[prer]", ruHint: "прээр" },
  spirit: { ipa: "[ˈspɪrɪt]", ruHint: "спи́рит" },
  holy: { ipa: "[ˈhoʊli]", ruHint: "хо́ули" },
  bible: { ipa: "[ˈbaɪbl]", ruHint: "ба́йбл" },
  scripture: { ipa: "[ˈskrɪptʃər]", ruHint: "скри́пчэр" },
  verse: { ipa: "[vɜːrs]", ruHint: "вёрс" },
  jesus: { ipa: "[ˈdʒiːzəs]", ruHint: "джи́зэс" },
  christ: { ipa: "[kraɪst]", ruHint: "крайст" },
  father: { ipa: "[ˈfɑːðər]", ruHint: "фа́зэр" },
  son: { ipa: "[sʌn]", ruHint: "сан" },
  man: { ipa: "[mæn]", ruHint: "мэн" },
  men: { ipa: "[men]", ruHint: "мен" },
  woman: { ipa: "[ˈwʊmən]", ruHint: "ву́мэн" },
  world: { ipa: "[wɜːrld]", ruHint: "уо́рлд" },
  earth: { ipa: "[ɜːrθ]", ruHint: "ёрс" },
  heaven: { ipa: "[ˈhevn]", ruHint: "хе́вэн" },
  king: { ipa: "[kɪŋ]", ruHint: "кинг" },
  kingdom: { ipa: "[ˈkɪŋdəm]", ruHint: "ки́нгдам" },
  read: { ipa: "[riːd]", ruHint: "рид" },
  reader: { ipa: "[ˈriːdər]", ruHint: "ри́дэр" },
  daily: { ipa: "[ˈdeɪli]", ruHint: "дэ́йли" },
};

function getSpanishPronunciation(word) {
  const lower = word.toLowerCase();

  // Detect explicit accent
  const accents = { "á": 0, "é": 1, "í": 2, "ó": 3, "ú": 4 };
  let explicitAccentIdx = -1;
  let charArray = Array.from(lower);

  for (let i = 0; i < charArray.length; i++) {
    if (charArray[i] in accents) {
      explicitAccentIdx = i;
      break;
    }
  }

  // Syllabification & phonetics step
  const vowels = new Set(["a", "e", "i", "o", "u", "á", "é", "í", "ó", "ú", "ü"]);

  // Collect vowel positions
  const vowelIndices = [];
  for (let i = 0; i < charArray.length; i++) {
    if (vowels.has(charArray[i])) {
      vowelIndices.push(i);
    }
  }

  // Determine stress vowel index
  let stressedVowelIdx = -1;
  if (explicitAccentIdx !== -1) {
    stressedVowelIdx = explicitAccentIdx;
  } else if (vowelIndices.length > 0) {
    const lastChar = charArray[charArray.length - 1];
    if (vowels.has(lastChar) || lastChar === "n" || lastChar === "s") {
      // Penultimate vowel if exists, else last vowel
      stressedVowelIdx = vowelIndices.length > 1 ? vowelIndices[vowelIndices.length - 2] : vowelIndices[0];
    } else {
      // Ultimate vowel
      stressedVowelIdx = vowelIndices[vowelIndices.length - 1];
    }
  }

  // Build Russian Hint (Standard Spanish)
  let ru = "";
  let i = 0;
  while (i < charArray.length) {
    const c = charArray[i];
    const next = charArray[i + 1] || "";
    const next2 = charArray[i + 2] || "";
    const prev = i > 0 ? charArray[i - 1] : "";

    let pieceRu = "";
    let consumed = 1;

    if (c === "c" && next === "h") {
      pieceRu = "ч";
      consumed = 2;
    } else if (c === "l" && next === "l") {
      pieceRu = "й";
      consumed = 2;
    } else if (c === "n" && next === "g") {
      pieceRu = "нг";
      consumed = 2;
    } else if (c === "q" && next === "u") {
      pieceRu = "к";
      consumed = (next2 === "e" || next2 === "i") ? 2 : 2;
    } else if (c === "g" && next === "u" && (next2 === "e" || next2 === "i")) {
      pieceRu = "г";
      consumed = 2;
    } else if (c === "g" && next === "ü") {
      pieceRu = "гв";
      consumed = 2;
    } else if (c === "c" && (next === "e" || next === "i" || next === "é" || next === "í")) {
      pieceRu = "с";
      consumed = 1;
    } else if (c === "c") {
      pieceRu = "к";
      consumed = 1;
    } else if (c === "g" && (next === "e" || next === "i" || next === "é" || next === "í")) {
      pieceRu = "х";
      consumed = 1;
    } else if (c === "g") {
      pieceRu = "г";
      consumed = 1;
    } else if (c === "j") {
      pieceRu = "х";
      consumed = 1;
    } else if (c === "z") {
      pieceRu = "с";
      consumed = 1;
    } else if (c === "v") {
      pieceRu = "в";
      consumed = 1;
    } else if (c === "b") {
      pieceRu = "б";
      consumed = 1;
    } else if (c === "h") {
      pieceRu = "";
      consumed = 1;
    } else if (c === "ñ") {
      pieceRu = "нь";
      consumed = 1;
    } else if (c === "y") {
      pieceRu = (i === charArray.length - 1) ? "й" : "й";
      consumed = 1;
    } else if (c === "r" && next === "r") {
      pieceRu = "р";
      consumed = 2;
    } else if (c === "r") {
      pieceRu = "р";
      consumed = 1;
    } else if (c === "x") {
      pieceRu = "кс";
      consumed = 1;
    } else if (c === "w") {
      pieceRu = "в";
      consumed = 1;
    } else if (c === "a" || c === "á") {
      pieceRu = "а";
    } else if (c === "e" || c === "é") {
      pieceRu = (i === 0 || vowels.has(prev) || prev === "h") ? "э" : "е";
    } else if (c === "i" || c === "í") {
      pieceRu = "и";
    } else if (c === "o" || c === "ó") {
      pieceRu = "о";
    } else if (c === "u" || c === "ú" || c === "ü") {
      pieceRu = "у";
    } else {
      pieceRu = c;
    }

    if (i === stressedVowelIdx && pieceRu.length > 0) {
      pieceRu = pieceRu[0] + "\u0301" + pieceRu.slice(1);
    }

    ru += pieceRu;
    i += consumed;
  }

  ru = ru.replace(/нь([еияюэóаоуе́а́э́и́о́у́])/g, "н$1");

  let ipaChars = [];
  let curr = 0;
  while (curr < charArray.length) {
    const c = charArray[curr];
    const next = charArray[curr + 1] || "";
    const next2 = charArray[curr + 2] || "";

    if (c === "c" && next === "h") {
      ipaChars.push("tʃ"); curr += 2;
    } else if (c === "l" && next === "l") {
      ipaChars.push("ʝ"); curr += 2;
    } else if (c === "n" && next === "g") {
      ipaChars.push("ŋ"); curr += 2;
    } else if (c === "q" && next === "u") {
      ipaChars.push("k"); curr += 2;
    } else if (c === "g" && next === "u" && (next2 === "e" || next2 === "i" || next2 === "é" || next2 === "í")) {
      ipaChars.push("ɡ"); curr += 2;
    } else if (c === "c" && (next === "e" || next === "i" || next === "é" || next === "í")) {
      ipaChars.push("s"); curr += 1;
    } else if (c === "c") {
      ipaChars.push("k"); curr += 1;
    } else if (c === "g" && (next === "e" || next === "i" || next === "é" || next === "í")) {
      ipaChars.push("x"); curr += 1;
    } else if (c === "g") {
      ipaChars.push("ɡ"); curr += 1;
    } else if (c === "j") {
      ipaChars.push("x"); curr += 1;
    } else if (c === "z") {
      ipaChars.push("s"); curr += 1;
    } else if (c === "v" || c === "b") {
      ipaChars.push("b"); curr += 1;
    } else if (c === "h") {
      curr += 1;
    } else if (c === "ñ") {
      ipaChars.push("ɲ"); curr += 1;
    } else if (c === "r" && next === "r") {
      ipaChars.push("r"); curr += 2;
    } else if (c === "r") {
      ipaChars.push(curr === 0 ? "r" : "ɾ"); curr += 1;
    } else if (c === "a" || c === "á") {
      ipaChars.push("a"); curr += 1;
    } else if (c === "e" || c === "é") {
      ipaChars.push("e"); curr += 1;
    } else if (c === "i" || c === "í") {
      ipaChars.push("i"); curr += 1;
    } else if (c === "o" || c === "ó") {
      ipaChars.push("o"); curr += 1;
    } else if (c === "u" || c === "ú" || c === "ü") {
      ipaChars.push("u"); curr += 1;
    } else {
      ipaChars.push(c); curr += 1;
    }
  }

  if (stressedVowelIdx >= 0) {
    let ipaStr = ipaChars.join("");
    if (ipaStr.length > 2) {
      const mid = Math.max(0, Math.floor(ipaStr.length / 2) - 1);
      ipaStr = ipaStr.slice(0, mid) + "." + ipaStr.slice(mid);
    }
    ipaStr = "ˈ" + ipaStr;
    return { ipa: `[${ipaStr}]`, ruHint: ru };
  }

  return { ipa: `[${ipaChars.join("")}]`, ruHint: ru };
}

function getEnglishPronunciation(word) {
  const clean = word.toLowerCase();
  if (EN_DICT[clean]) {
    return EN_DICT[clean];
  }

  let ipa = clean;
  let ru = clean;

  ru = ru
    .replace(/tion/g, "шн")
    .replace(/sion/g, "жн")
    .replace(/th/g, "с")
    .replace(/ph/g, "ф")
    .replace(/sh/g, "ш")
    .replace(/ch/g, "ч")
    .replace(/ck/g, "к")
    .replace(/ee/g, "и")
    .replace(/ea/g, "и")
    .replace(/oo/g, "у")
    .replace(/ou/g, "ау")
    .replace(/ow/g, "ау")
    .replace(/ay/g, "эй")
    .replace(/ai/g, "эй")
    .replace(/ight/g, "айт")
    .replace(/c([eiy])/g, "с$1")
    .replace(/c/g, "к")
    .replace(/g([eiy])/g, "дж$1")
    .replace(/g/g, "г")
    .replace(/w/g, "у")
    .replace(/v/g, "в")
    .replace(/j/g, "дж")
    .replace(/y$/g, "и")
    .replace(/x/g, "кс");

  ipa = clean
    .replace(/tion/g, "ʃən")
    .replace(/sion/g, "ʒən")
    .replace(/th/g, "θ")
    .replace(/ph/g, "f")
    .replace(/sh/g, "ʃ")
    .replace(/ch/g, "tʃ")
    .replace(/ck/g, "k")
    .replace(/ee/g, "iː")
    .replace(/ea/g, "iː")
    .replace(/oo/g, "uː")
    .replace(/ou/g, "aʊ")
    .replace(/ow/g, "aʊ")
    .replace(/ay/g, "eɪ")
    .replace(/ai/g, "eɪ")
    .replace(/ight/g, "aɪt")
    .replace(/c([eiy])/g, "s$1")
    .replace(/c/g, "k")
    .replace(/g([eiy])/g, "dʒ$1")
    .replace(/g/g, "ɡ");

  return { ipa: `[/${ipa}/]`, ruHint: ru };
}

function getRussianPronunciation(word) {
  const clean = word.trim();
  const vowels = /[аеёиоуыэюя]/i;
  const matchVowels = clean.match(new RegExp(vowels, "gi")) || [];
  let ruHint = clean;

  if (matchVowels.length === 1) {
    const idx = clean.search(vowels);
    if (idx !== -1) {
      ruHint = clean.slice(0, idx + 1) + "\u0301" + clean.slice(idx + 1);
    }
  } else if (!clean.includes("\u0301") && !clean.includes("ё") && matchVowels.length > 1) {
    const idx = clean.search(vowels);
    if (idx !== -1) {
      ruHint = clean.slice(0, idx + 1) + "\u0301" + clean.slice(idx + 1);
    }
  }

  let ipa = clean.toLowerCase()
    .replace(/ч/g, "tʃ")
    .replace(/ш/g, "ʂ")
    .replace(/щ/g, "ɕː")
    .replace(/ж/g, "ʐ")
    .replace(/х/g, "x")
    .replace(/ц/g, "ts")
    .replace(/я/g, "ja")
    .replace(/ю/g, "ju")
    .replace(/е/g, "je")
    .replace(/ё/g, "jo")
    .replace(/в/g, "v")
    .replace(/б/g, "b")
    .replace(/г/g, "ɡ")
    .replace(/д/g, "d")
    .replace(/з/g, "z")
    .replace(/к/g, "k")
    .replace(/л/g, "l")
    .replace(/м/g, "m")
    .replace(/н/g, "n")
    .replace(/п/g, "p")
    .replace(/р/g, "r")
    .replace(/с/g, "s")
    .replace(/т/g, "t")
    .replace(/ф/g, "f");

  return { ipa: `[${ipa}]`, ruHint };
}

export function getPronunciation(rawWord, lang = "es") {
  if (!rawWord || typeof rawWord !== "string") {
    return { ipa: "", ruHint: "" };
  }
  const cleanWord = rawWord.trim().replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
  if (!cleanWord) {
    return { ipa: "", ruHint: "" };
  }

  if (lang === "es") {
    return getSpanishPronunciation(cleanWord);
  } else if (lang === "en") {
    return getEnglishPronunciation(cleanWord);
  } else {
    return getRussianPronunciation(cleanWord);
  }
}

export async function fetchAiPronunciation({ word, sentence = "", lang = "es" }) {
  const fallback = getPronunciation(word, lang);
  try {
    const res = await fetchPronunciation({ word, sentence, lang });
    if (res && (res.ipa || res.ru_hint)) {
      return {
        ipa: res.ipa || fallback.ipa,
        ruHint: res.ru_hint || fallback.ruHint,
      };
    }
  } catch (e) {
    // API unavailable or offline
  }
  return fallback;
}

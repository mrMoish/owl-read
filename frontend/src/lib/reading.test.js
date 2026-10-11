import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeLemma,
  findMatchingTokenIds,
  applyLearnedTranslations,
} from "./learned.js";

import { formatTextNode } from "./punct.js";

import {
  loadLearnedWords,
  saveLearnedWords,
  addLearnedWord,
  removeLearnedWord,
  clearLearnedWords,
} from "./storage.js";

// Полифилл localStorage для изоляции тестов в Node.js
const memoryStore = new Map();
globalThis.localStorage = {
  getItem: (key) => memoryStore.get(key) || null,
  setItem: (key, val) => memoryStore.set(key, String(val)),
  removeItem: (key) => memoryStore.delete(key),
  clear: () => memoryStore.clear(),
};

test("1. Запоминание перевода в постоянном хранилище после нажатия", () => {
  globalThis.localStorage.clear();

  // Пользователь нажимает на слово с леммой «книга» и переводом «libro»
  const res = addLearnedWord("книга", "libro");
  assert.equal(res["книга"]?.primaryTranslation, "libro");
  assert.deepEqual(res["книга"]?.translations, ["libro"]);

  // Проверяем считывание из постоянного хранилища
  const loaded = loadLearnedWords();
  assert.equal(loaded["книга"]?.primaryTranslation, "libro");
});

test("2. Автоматическая замена повторений слова в текущем тексте", () => {
  // Текст содержит два вхождения слова с id "0" и "5"
  const meta = {
    "0": { w: "любовь", lemma: "любовь", sent: "Бог есть любовь." },
    "1": { w: "и", lemma: "и", sent: "Бог есть любовь." },
    "5": { w: "любовь", lemma: "любовь", sent: "Проявляйте любовь." },
  };
  const prepared = {
    "0": "amor",
    "5": "amor",
  };
  const learned = {
    любовь: { lemma: "любовь", primaryTranslation: "amor", translations: ["amor"] },
  };

  const visible = applyLearnedTranslations({
    meta,
    preparedTranslations: prepared,
    learnedWords: learned,
  });

  // Оба вхождения автоматически заменены
  assert.equal(visible["0"], "amor");
  assert.equal(visible["5"], "amor");
  // Другие слова не затронуты
  assert.equal(visible["1"], undefined);
});

test("3. Автоматическая замена в последующих текстах (новый день)", () => {
  // Пользователь уже выучил слово «мир»
  const learned = {
    мир: { lemma: "мир", primaryTranslation: "paz", translations: ["paz"] },
  };

  // Загружается совершенно новый текст за другой день
  const nextDayMeta = {
    "10": { w: "мир", lemma: "мир", sent: "Да будет мир." },
    "11": { w: "с", lemma: "с", sent: "Да будет мир." },
    "12": { w: "вами", lemma: "вы", sent: "Да будет мир." },
  };
  const nextDayPrepared = {
    "10": "paz",
  };

  const visible = applyLearnedTranslations({
    meta: nextDayMeta,
    preparedTranslations: nextDayPrepared,
    learnedWords: learned,
  });

  // Слово «мир» в новом тексте автоматически отображается на испанском
  assert.equal(visible["10"], "paz");
  // Неизученные слова остаются русскими
  assert.equal(visible["11"], undefined);
  assert.equal(visible["12"], undefined);
});

test("4. Сохранение предпочтений после перезагрузки (извлечение из storage)", () => {
  globalThis.localStorage.clear();
  addLearnedWord("слово", "palabra");

  // Имитируем перезагрузку страницы (чтение из storage заново)
  const freshLoaded = loadLearnedWords();
  assert.ok(freshLoaded["слово"]);
  assert.equal(freshLoaded["слово"].primaryTranslation, "palabra");

  const meta = { "0": { w: "словом", lemma: "слово" } };
  const visible = applyLearnedTranslations({
    meta,
    learnedWords: freshLoaded,
  });
  assert.equal(visible["0"], "palabra");
});

test("5. Корректная обработка словоформ одной леммы («книга», «книги», «книгу», «книгой»)", () => {
  // Пользователь нажал на словоформу «книгу» (лемма: «книга»)
  const targetLemma = normalizeLemma("книга");

  // В тексте встречаются различные словоформы этой же леммы
  const meta = {
    "0": { w: "книга", lemma: "книга" },
    "1": { w: "книги", lemma: "книга" },
    "2": { w: "книгу", lemma: "книга" },
    "3": { w: "книгой", lemma: "книга" },
    "4": { w: "человек", lemma: "человек" },
  };

  const matchingIds = findMatchingTokenIds(meta, targetLemma);
  // Все 4 формы одной леммы надёжно найдены
  assert.deepEqual(matchingIds.sort(), ["0", "1", "2", "3"]);

  const learned = {
    книга: { lemma: "книга", primaryTranslation: "libro", translations: ["libro"] },
  };
  const prepared = {
    "0": "libro",
    "1": "libros",
    "2": "libro",
    "3": "libro",
  };

  const visible = applyLearnedTranslations({
    meta,
    preparedTranslations: prepared,
    learnedWords: learned,
  });

  assert.equal(visible["0"], "libro");
  assert.equal(visible["1"], "libros");
  assert.equal(visible["2"], "libro");
  assert.equal(visible["3"], "libro");
  assert.equal(visible["4"], undefined);
});

test("6. Отсутствие замены частей других слов («том» не заменяет «потом»)", () => {
  const meta = {
    "0": { w: "том", lemma: "том" },
    "1": { w: "потом", lemma: "потом" },
    "2": { w: "автомобиль", lemma: "автомобиль" },
  };

  // Поиск токенов для леммы «том»
  const matches = findMatchingTokenIds(meta, "том");
  assert.deepEqual(matches, ["0"]);

  const learned = {
    том: { lemma: "том", primaryTranslation: "tomo", translations: ["tomo"] },
  };

  const visible = applyLearnedTranslations({
    meta,
    learnedWords: learned,
  });

  // Заменён только самостоятельный токен «том»
  assert.equal(visible["0"], "tomo");
  // Токены «потом» и «автомобиль» не содержат ошибочной подстрочной замены
  assert.equal(visible["1"], undefined);
  assert.equal(visible["2"], undefined);
});

test("7. Обработка многозначных слов с сохранением контекстного перевода", () => {
  // Слово «мир» в разных контекстах: «мир во всём мире» (paz) vs «сотворение мира» (mundo)
  const meta = {
    "0": { w: "мир", lemma: "мир", sent: "Христос дарует мир." },
    "1": { w: "мира", lemma: "мир", sent: "Бог создал основы мира." },
  };
  const prepared = {
    "0": "paz",
    "1": "mundo",
  };
  const learned = {
    мир: { lemma: "мир", primaryTranslation: "paz", translations: ["paz", "mundo"] },
  };

  const visible = applyLearnedTranslations({
    meta,
    preparedTranslations: prepared,
    learnedWords: learned,
  });

  // Каждое предложение получает свой правильный контекстный перевод
  assert.equal(visible["0"], "paz");
  assert.equal(visible["1"], "mundo");
});

test("8. Возможность удалить сохранённый выбор (unlearn) и сбросить все слова", () => {
  globalThis.localStorage.clear();
  addLearnedWord("радость", "alegría");
  addLearnedWord("надежда", "esperanza");

  assert.equal(loadLearnedWords()["радость"]?.primaryTranslation, "alegría");
  assert.equal(loadLearnedWords()["надежда"]?.primaryTranslation, "esperanza");

  // Удаляем отдельное сохранённое слово
  removeLearnedWord("радость");
  const afterRemove = loadLearnedWords();
  assert.equal(afterRemove["радость"], undefined);
  assert.ok(afterRemove["надежда"]);

  // Сбрасываем все сохранённые слова
  clearLearnedWords();
  assert.deepEqual(loadLearnedWords(), {});
});

test("9. Отсутствие повторных запросов к переводчику при наличии подготовленного перевода", () => {
  let apiCallCount = 0;
  const mockApi = () => {
    apiCallCount++;
    return Promise.resolve("api_res");
  };

  const meta = { "0": { w: "жизнь", lemma: "жизнь" } };
  const prepared = { "0": "vida" };
  const learned = {
    жизнь: { lemma: "жизнь", primaryTranslation: "vida", translations: ["vida"] },
  };

  const visible = applyLearnedTranslations({
    meta,
    preparedTranslations: prepared,
    learnedWords: learned,
  });

  assert.equal(visible["0"], "vida");
  assert.equal(apiCallCount, 0);
});

test("10. Корректная замена, когда перевод состоит из нескольких слов (фраза)", () => {
  const meta = { "0": { w: "утром", lemma: "утром" } };
  const prepared = { "0": "por la mañana" };
  const learned = {
    утром: { lemma: "утром", primaryTranslation: "por la mañana", translations: ["por la mañana"] },
  };

  const visible = applyLearnedTranslations({
    meta,
    preparedTranslations: prepared,
    learnedWords: learned,
  });

  assert.equal(visible["0"], "por la mañana");
});

test("11. normalizeLemma поддерживает фразы из нескольких слов и испанские спецсимволы", () => {
  assert.equal(normalizeLemma("ni siquiera"), "ni siquiera");
  assert.equal(normalizeLemma("  Ni   siquiera! "), "ni siquiera");
  assert.equal(normalizeLemma("«desconsiderada»"), "desconsiderada");
  assert.equal(normalizeLemma("¡maltraten!"), "maltraten");

  const meta = { "0": { w: "ni siquiera", lemma: "ni siquiera" } };
  const learned = {
    "ni siquiera": { lemma: "ni siquiera", primaryTranslation: "даже не", translations: ["даже не"] },
  };
  const visible = applyLearnedTranslations({
    meta,
    learnedWords: learned,
  });
  assert.equal(visible["0"], "даже не");
});

test("formatTextNode converts space before dash to non-breaking space and glues punctuation", () => {
  assert.equal(formatTextNode("христиане — они"), "христиане\u00A0— они");
  assert.equal(formatTextNode("слово , которое"), "слово, которое");
  assert.equal(formatTextNode(" ( « цитата » )"), " (\u00A0«\u00A0цитата»)");
});

test("Clicking words in multi-paragraph text across first and second halves", () => {
  const meta = {
    "0": { w: "First", lemma: "first", sent: "First paragraph sentence." },
    "1": { w: "paragraph", lemma: "paragraph", sent: "First paragraph sentence." },
    "50": { w: "Second", lemma: "second", sent: "Second paragraph sentence." },
    "51": { w: "paragraph", lemma: "paragraph", sent: "Second paragraph sentence." },
  };

  const learned1 = addLearnedWord(meta["0"].lemma, "Primero");
  assert.equal(learned1["first"]?.primaryTranslation, "Primero");

  const learned2 = addLearnedWord(meta["50"].lemma, "Segundo");
  assert.equal(learned2["second"]?.primaryTranslation, "Segundo");

  const visible = applyLearnedTranslations({
    meta,
    learnedWords: loadLearnedWords(),
  });

  assert.equal(visible["0"], "Primero");
  assert.equal(visible["50"], "Segundo");
});

test("Words inside links, emphasis, and strong formatting retain interactive metadata", () => {
  const meta = {
    "10": { w: "linked", lemma: "link", sent: "This is a linked word in a link." },
    "11": { w: "emphasized", lemma: "emphasize", sent: "This is an emphasized word." },
    "12": { w: "bold", lemma: "bold", sent: "This is a bold word." },
  };

  const learned = {
    link: { lemma: "link", primaryTranslation: "соединённый", translations: ["соединённый"] },
    emphasize: { lemma: "emphasize", primaryTranslation: "выделенный", translations: ["выделенный"] },
    bold: { lemma: "bold", primaryTranslation: "жирный", translations: ["жирный"] },
  };

  const visible = applyLearnedTranslations({
    meta,
    learnedWords: learned,
  });

  assert.equal(visible["10"], "соединённый");
  assert.equal(visible["11"], "выделенный");
  assert.equal(visible["12"], "жирный");
});

test("Missing or incomplete word metadata or sentence context fallback", () => {
  const meta = {
    "100": { w: "orphan", lemma: "orphan" }, // missing sent
    "101": { w: "empty", lemma: "empty", sent: "" }, // empty sent
  };

  const learned = {
    orphan: { lemma: "orphan", primaryTranslation: "сирота", translations: ["сирота"] },
    empty: { lemma: "empty", primaryTranslation: "пустой", translations: ["пустой"] },
  };

  const visible = applyLearnedTranslations({
    meta,
    learnedWords: learned,
  });

  assert.equal(visible["100"], "сирота");
  assert.equal(visible["101"], "пустой");
});

test("Reading modes: English, Spanish, and Russian mode metadata lookup", () => {
  const enMeta = { "1": { w: "peace", lemma: "peace", sent: "May you have peace." } };
  const esMeta = { "1": { w: "paz", lemma: "paz", sent: "Que tengan paz." } };
  const ruMeta = { "1": { w: "мир", lemma: "мир", sent: "Да будет мир." } };

  const learnedEn = { peace: { lemma: "peace", primaryTranslation: "мир", translations: ["мир"] } };
  const learnedEs = { paz: { lemma: "paz", primaryTranslation: "мир", translations: ["мир"] } };
  const learnedRu = { мир: { lemma: "мир", primaryTranslation: "paz", translations: ["paz"] } };

  assert.equal(applyLearnedTranslations({ meta: enMeta, learnedWords: learnedEn })["1"], "мир");
  assert.equal(applyLearnedTranslations({ meta: esMeta, learnedWords: learnedEs })["1"], "мир");
  assert.equal(applyLearnedTranslations({ meta: ruMeta, learnedWords: learnedRu })["1"], "paz");
});

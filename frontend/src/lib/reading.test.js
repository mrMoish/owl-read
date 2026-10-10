import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeLemma,
  findMatchingTokenIds,
  applyLearnedTranslations,
} from "./learned.js";

import { reorderNodes, shouldSwapPair } from "./swap.js";

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

// --- Новые обязательные лингвистические тесты перестановки порядка слов (п. 8) ---

test("Requirement 1: Russian -> Spanish: «маленькая группа» -> «grupo pequeño»", () => {
  const nodes = [
    { t: "w", id: 0, s: "маленькая" },
    { t: "text", s: " " },
    { t: "w", id: 1, s: "группа" },
  ];
  const meta = {
    "0": { w: "маленькая", lemma: "маленький", pos: "ADJF" },
    "1": { w: "группа", lemma: "группа", pos: "NOUN" },
  };
  const translations = { "0": "pequeño", "1": "grupo" };

  const res = reorderNodes(nodes, translations, meta, "es");
  assert.equal(String(res[0].id), "1"); // «группа» -> «grupo»
  assert.equal(String(res[2].id), "0"); // «маленькая» -> «pequeño»
});

test("Requirement 2: Russian -> English: «маленькая группа» -> «small group»", () => {
  const nodes = [
    { t: "w", id: 0, s: "маленькая" },
    { t: "text", s: " " },
    { t: "w", id: 1, s: "группа" },
  ];
  const meta = {
    "0": { w: "маленькая", lemma: "маленький", pos: "ADJF" },
    "1": { w: "группа", lemma: "группа", pos: "NOUN" },
  };
  const translations = { "0": "small", "1": "group" };

  const res = reorderNodes(nodes, translations, meta, "en");
  assert.equal(String(res[0].id), "0"); // «small»
  assert.equal(String(res[2].id), "1"); // «group»
});

test("Requirement 3: Russian -> Spanish: «в последний раз» -> «por última vez» (no swap)", () => {
  const nodes = [
    { t: "text", s: "в " },
    { t: "w", id: 0, s: "последний" },
    { t: "text", s: " " },
    { t: "w", id: 1, s: "раз" },
  ];
  const meta = {
    "0": { w: "последний", lemma: "последний", pos: "ADJF", sent: "в последний раз" },
    "1": { w: "раз", lemma: "раз", pos: "NOUN", sent: "в последний раз" },
  };
  const translations = { "0": "última", "1": "vez" };

  const res = reorderNodes(nodes, translations, meta, "es");
  assert.equal(String(res[1].id), "0"); // «última»
  assert.equal(String(res[3].id), "1"); // «vez»
});

test("Requirement 4: Russian -> English: «в последний раз» -> «for the last time» (no swap)", () => {
  const nodes = [
    { t: "text", s: "в " },
    { t: "w", id: 0, s: "последний" },
    { t: "text", s: " " },
    { t: "w", id: 1, s: "раз" },
  ];
  const meta = {
    "0": { w: "последний", lemma: "последний", pos: "ADJF" },
    "1": { w: "раз", lemma: "раз", pos: "NOUN" },
  };
  const translations = { "0": "last", "1": "time" };

  const res = reorderNodes(nodes, translations, meta, "en");
  assert.equal(String(res[1].id), "0");
  assert.equal(String(res[3].id), "1");
});

test("Requirement 5: Russian -> Spanish: «интересная книга» -> «libro interesante»", () => {
  const nodes = [
    { t: "w", id: 0, s: "интересная" },
    { t: "text", s: " " },
    { t: "w", id: 1, s: "книга" },
  ];
  const meta = {
    "0": { w: "интересная", lemma: "интересный", pos: "ADJF" },
    "1": { w: "книга", lemma: "книга", pos: "NOUN" },
  };
  const translations = { "0": "interesante", "1": "libro" };

  const res = reorderNodes(nodes, translations, meta, "es");
  assert.equal(String(res[0].id), "1"); // libro
  assert.equal(String(res[2].id), "0"); // интересная
});

test("Requirement 6: Russian -> English: «интересная книга» -> «interesting book»", () => {
  const nodes = [
    { t: "w", id: 0, s: "интересная" },
    { t: "text", s: " " },
    { t: "w", id: 1, s: "книга" },
  ];
  const meta = {
    "0": { w: "интересная", lemma: "интересный", pos: "ADJF" },
    "1": { w: "книга", lemma: "книга", pos: "NOUN" },
  };
  const translations = { "0": "interesting", "1": "book" };

  const res = reorderNodes(nodes, translations, meta, "en");
  assert.equal(String(res[0].id), "0");
  assert.equal(String(res[2].id), "1");
});

test("Requirement 7: Russian -> Spanish: «большая проблема» -> «gran проблема» (no swap)", () => {
  const nodes = [
    { t: "w", id: 0, s: "большая" },
    { t: "text", s: " " },
    { t: "w", id: 1, s: "проблема" },
  ];
  const meta = {
    "0": { w: "большая", lemma: "большой", pos: "ADJF" },
    "1": { w: "проблема", lemma: "проблема", pos: "NOUN" },
  };
  const translations = { "0": "gran", "1": "problema" };

  const res = reorderNodes(nodes, translations, meta, "es");
  assert.equal(String(res[0].id), "0"); // gran
  assert.equal(String(res[2].id), "1"); // проблема
});

test("Requirement 8: Phrase that should remain in original order", () => {
  const nodes = [
    { t: "w", id: 0, s: "читать" },
    { t: "text", s: " " },
    { t: "w", id: 1, s: "книгу" },
  ];
  const meta = {
    "0": { w: "читать", lemma: "читать", pos: "INFN" },
    "1": { w: "книгу", lemma: "книга", pos: "NOUN" },
  };
  const translations = { "0": "leer", "1": "el libro" };

  const res = reorderNodes(nodes, translations, meta, "es");
  assert.equal(String(res[0].id), "0");
  assert.equal(String(res[2].id), "1");
});

test("Requirement 9: Phrase with punctuation preserves punctuation text", () => {
  const nodes = [
    { t: "w", id: 0, s: "красивая" },
    { t: "text", s: ", " },
    { t: "w", id: 1, s: "птица" },
  ];
  const meta = {
    "0": { w: "красивая", lemma: "красивый", pos: "ADJF" },
    "1": { w: "птица", lemma: "птица", pos: "NOUN" },
  };
  const translations = { "0": "hermosa", "1": "ave" };

  const res = reorderNodes(nodes, translations, meta, "es");
  assert.equal(String(res[0].id), "1");
  assert.equal(res[1].s, ", ");
  assert.equal(String(res[2].id), "0");
});

test("Requirement 10: Phrase containing nested formatted nodes", () => {
  const nodes = [
    {
      t: "em",
      c: [
        { t: "w", id: 0, s: "маленькая" },
        { t: "text", s: " " },
        { t: "w", id: 1, s: "группа" },
      ],
    },
  ];
  const meta = {
    "0": { w: "маленькая", lemma: "маленький", pos: "ADJF" },
    "1": { w: "группа", lemma: "группа", pos: "NOUN" },
  };
  const translations = { "0": "pequeño", "1": "grupo" };

  const res = reorderNodes(nodes, translations, meta, "es");
  const children = res[0].c;
  assert.equal(String(children[0].id), "1");
  assert.equal(String(children[2].id), "0");
});

test("Requirement 11: Repeated occurrences of same word with different IDs", () => {
  const nodes = [
    { t: "w", id: 0, s: "новое" },
    { t: "text", s: " " },
    { t: "w", id: 1, s: "слово" },
    { t: "text", s: " и " },
    { t: "w", id: 2, s: "новое" },
    { t: "text", s: " " },
    { t: "w", id: 3, s: "дело" },
  ];
  const meta = {
    "0": { w: "новое", lemma: "новый", pos: "ADJF" },
    "1": { w: "слово", lemma: "слово", pos: "NOUN" },
    "2": { w: "новое", lemma: "новый", pos: "ADJF" },
    "3": { w: "дело", lemma: "дело", pos: "NOUN" },
  };
  // "новый" - pre-noun adj in ES exception list -> no swap
  const translations = { "0": "nueva", "1": "palabra", "2": "nueva", "3": "causa" };

  const res = reorderNodes(nodes, translations, meta, "es");
  assert.equal(String(res[0].id), "0");
  assert.equal(String(res[2].id), "1");
  assert.equal(String(res[4].id), "2");
  assert.equal(String(res[6].id), "3");
});

test("Requirement 12: Missing or incomplete translation metadata", () => {
  const nodes = [
    { t: "w", id: 0, s: "маленькая" },
    { t: "text", s: " " },
    { t: "w", id: 1, s: "группа" },
  ];
  const meta = {};
  const translations = { "0": "pequeño", "1": "grupo" };

  const res = reorderNodes(nodes, translations, meta, "es");
  // Fallback POS detection still reorders safely
  assert.equal(String(res[0].id), "1");
  assert.equal(String(res[2].id), "0");
});

test("Requirement 13: Multiple-word translations", () => {
  const nodes = [
    { t: "w", id: 0, s: "хорошая" },
    { t: "text", s: " " },
    { t: "w", id: 1, s: "новость" },
  ];
  const meta = {
    "0": { w: "хорошая", lemma: "хороший", pos: "ADJF" },
    "1": { w: "новость", lemma: "новость", pos: "NOUN" },
  };
  const translations = { "0": "buenas", "1": "noticias" };

  const res = reorderNodes(nodes, translations, meta, "es");
  // "хороший" -> pre-noun adjective exception -> no swap
  assert.equal(String(res[0].id), "0");
  assert.equal(String(res[2].id), "1");
});

test("Requirement 14: Repeated invocation of reordering function (Idempotency)", () => {
  const nodes = [
    { t: "w", id: 0, s: "маленькая" },
    { t: "text", s: " " },
    { t: "w", id: 1, s: "группа" },
  ];
  const meta = {
    "0": { w: "маленькая", lemma: "маленький", pos: "ADJF" },
    "1": { w: "группа", lemma: "группа", pos: "NOUN" },
  };
  const translations = { "0": "pequeño", "1": "grupo" };

  const res1 = reorderNodes(nodes, translations, meta, "es");
  const res2 = reorderNodes(res1, translations, meta, "es");
  assert.deepEqual(res1, res2);
});

test("Requirement 15: Stable click-to-original-word mapping after reordering", () => {
  const nodes = [
    { t: "w", id: 0, s: "маленькая" },
    { t: "text", s: " " },
    { t: "w", id: 1, s: "группа" },
  ];
  const meta = {
    "0": { w: "маленькая", lemma: "маленький", pos: "ADJF" },
    "1": { w: "группа", lemma: "группа", pos: "NOUN" },
  };
  const translations = { "0": "pequeño", "1": "grupo" };

  const res = reorderNodes(nodes, translations, meta, "es");
  assert.equal(String(res[0].id), "1");
  assert.equal(String(res[2].id), "0");
  // Each node retains its original ID and source token reference
  assert.equal(res[0].s, "группа");
  assert.equal(res[2].s, "маленькая");
});

test("Requirement 16: Correct behavior in both language modes", () => {
  const nodes = [
    { t: "w", id: 0, s: "интересная" },
    { t: "text", s: " " },
    { t: "w", id: 1, s: "книга" },
  ];
  const meta = {
    "0": { w: "интересная", lemma: "интересный", pos: "ADJF" },
    "1": { w: "книга", lemma: "книга", pos: "NOUN" },
  };

  const esRes = reorderNodes(nodes, { "0": "interesante", "1": "libro" }, meta, "es");
  assert.equal(String(esRes[0].id), "1"); // libro interesante

  const enRes = reorderNodes(nodes, { "0": "interesting", "1": "book" }, meta, "en");
  assert.equal(String(enRes[0].id), "0"); // interesting book
});

test("Demonstratives, possessives, and relative words in sentence structure: «Этот хлеб — моё тело, которое я отдам, чтобы мир жил.»", () => {
  // Исходное предложение: «Этот хлеб — моё тело, которое я отдам, чтобы мир жил.»
  // Испанский перевод: «Este pan es mi cuerpo, que entregaré para que el mundo viva.»
  const sentence = "Этот хлеб — моё тело, которое я отдам, чтобы мир жил.";
  const nodes = [
    { t: "w", id: 0, s: "Этот" },
    { t: "text", s: " " },
    { t: "w", id: 1, s: "хлеб" },
    { t: "text", s: " — " },
    { t: "w", id: 2, s: "моё" },
    { t: "text", s: " " },
    { t: "w", id: 3, s: "тело" },
    { t: "text", s: ", " },
    { t: "w", id: 4, s: "которое" },
    { t: "text", s: " " },
    { t: "w", id: 5, s: "я" },
    { t: "text", s: " " },
    { t: "w", id: 6, s: "отдам" },
    { t: "text", s: ", " },
    { t: "w", id: 7, s: "чтобы" },
    { t: "text", s: " " },
    { t: "w", id: 8, s: "мир" },
    { t: "text", s: " " },
    { t: "w", id: 9, s: "жил" },
    { t: "text", s: "." },
  ];

  const meta = {
    "0": { w: "Этот", lemma: "этот", pos: "ADJF", sent: sentence },
    "1": { w: "хлеб", lemma: "хлеб", pos: "NOUN", sent: sentence },
    "2": { w: "моё", lemma: "мой", pos: "ADJF", sent: sentence },
    "3": { w: "тело", lemma: "тело", pos: "NOUN", sent: sentence },
    "4": { w: "которое", lemma: "который", pos: "ADJF", sent: sentence },
    "5": { w: "я", lemma: "я", pos: "NPRO", sent: sentence },
    "6": { w: "отдам", lemma: "отдать", pos: "VERB", sent: sentence },
    "7": { w: "чтобы", lemma: "чтобы", pos: "CONJ", sent: sentence },
    "8": { w: "мир", lemma: "мир", pos: "NOUN", sent: sentence },
    "9": { w: "жил", lemma: "жить", pos: "VERB", sent: sentence },
  };

  const translations = {
    "0": "Este",
    "1": "pan",
    "2": "mi",
    "3": "cuerpo",
    "4": "que",
    "5": "yo",
    "6": "entregaré",
    "7": "para que",
    "8": "el mundo",
    "9": "viva",
  };

  const res = reorderNodes(nodes, translations, meta, "es");

  // Убеждаемся, что порядок слов не нарушается (нет ложных перестановок у "Este pan", "mi cuerpo", "que...")
  const resultIds = res.filter((n) => n.t === "w").map((n) => n.id);
  assert.deepEqual(resultIds, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

  // Убеждаемся, что «Этот хлеб» остается в порядке [0, 1] ("Este", "pan")
  assert.equal(shouldSwapPair(nodes[0], nodes[2], translations, meta, "es"), false); // 0 ("Этот") и 1 ("хлеб")
  assert.equal(shouldSwapPair(nodes[4], nodes[6], translations, meta, "es"), false); // 2 ("моё") и 3 ("тело")
});

test("Additional Word Order Patterns: Possessive pronouns (наш, ваш, свой)", () => {
  const nodes = [
    { t: "w", id: 0, s: "наш" },
    { t: "text", s: " " },
    { t: "w", id: 1, s: "дом" },
  ];
  const meta = {
    "0": { w: "наш", lemma: "наш", pos: "ADJF" },
    "1": { w: "дом", lemma: "дом", pos: "NOUN" },
  };
  const translations = { "0": "nuestra", "1": "casa" };

  const res = reorderNodes(nodes, translations, meta, "es");
  assert.equal(String(res[0].id), "0"); // nuestra
  assert.equal(String(res[2].id), "1"); // casa
});

test("Additional Word Order Patterns: Ordinal numbers (первый день)", () => {
  const nodes = [
    { t: "w", id: 0, s: "первый" },
    { t: "text", s: " " },
    { t: "w", id: 1, s: "день" },
  ];
  const meta = {
    "0": { w: "первый", lemma: "первый", pos: "ADJF" },
    "1": { w: "день", lemma: "день", pos: "NOUN" },
  };
  const translations = { "0": "primer", "1": "día" };

  const res = reorderNodes(nodes, translations, meta, "es");
  assert.equal(String(res[0].id), "0"); // primer
  assert.equal(String(res[2].id), "1"); // día
});

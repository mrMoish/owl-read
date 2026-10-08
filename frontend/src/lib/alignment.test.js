import test from "node:test";
import assert from "node:assert";
import {
  buildSentenceIndex,
  normalizeAlignment,
  classifyClick,
  layoutEntries,
} from "./alignment.js";

/** entries так же, как их собирает RichText из узлов предложения. */
function entriesFor(al) {
  return al.words.map((w, i) => ({
    kind: "word",
    id: al.ids[i],
    text: w,
    ruIdx: i,
    unit: al.ruUnit[i] >= 0 ? al.units[al.ruUnit[i]] : null,
    al,
  }));
}

const ws = () => ({ kind: "ws" });
const kinds = (items) => items.map((x) => x.kind);
const texts = (items) => items.map((x) => x.text);
const active = (al, ...positions) =>
  new Set(positions.map((p) => String(al.ids[p])));

function makeAlign(ids, words, esWords, units) {
  return normalizeAlignment(
    { ru_words: words, es_words: esWords, units },
    ids,
    words
  );
}

/* ---------- Сценарий 1: перестановка соседних слов ---------- */
/* «сразу после этого» -> «después de esto inmediatamente» */

const REORDER = () =>
  makeAlign(
    [1, 2, 3],
    ["сразу", "после", "этого"],
    ["después", "de", "esto", "inmediatamente"],
    [
      { ru: [0], es: [3, 3], head: 0 },
      { ru: [1], es: [0, 0], head: 1 },
      { ru: [2], es: [2, 2], head: 2 },
    ]
  );

test("сценарий 1: без активных юнитов слова остаются на русском", () => {
  const al = REORDER();
  assert.ok(al);
  const items = layoutEntries(entriesFor(al), new Set());
  assert.deepEqual(texts(items), ["сразу", "после", "этого"]);
});

test("сценарий 1: все слова переведены — испанский порядок, а не русский", () => {
  const al = REORDER();
  const items = layoutEntries(entriesFor(al), active(al, 0, 1, 2));
  assert.deepEqual(texts(items), ["después", "de", "esto", "inmediatamente"]);
  assert.deepEqual(kinds(items), ["es", "ins", "es", "es"]);
});

test("сценарий 1: непереведённое слово разрывает группу — порядок лишь внутри неё", () => {
  const al = REORDER();
  // «после» ещё не нажато: группа только из «сразу» и отдельная из «этого»
  const items = layoutEntries(entriesFor(al), active(al, 0, 2));
  assert.deepEqual(texts(items), ["inmediatamente", "после", "esto"]);
});

/* ---------- Сценарий 2: новые слова между связанными ---------- */
/* «рано утром» -> «temprano por la mañana» */

const INSERT = () =>
  makeAlign(
    [21, 22],
    ["рано", "утром"],
    ["temprano", "por", "la", "mañana"],
    [
      { ru: [0], es: [0, 0], head: 0 },
      { ru: [1], es: [3, 3], head: 1 },
    ]
  );

test("сценарий 2: переведено только «рано» — вставок ещё нет", () => {
  const al = INSERT();
  assert.ok(al);
  const items = layoutEntries(entriesFor(al), active(al, 0));
  assert.deepEqual(texts(items), ["temprano", "утром"]);
  assert.deepEqual(kinds(items), ["es", "word"]);
});

test("сценарий 2: оба переведены — por la появляются вставками между ними", () => {
  const al = INSERT();
  const items = layoutEntries(entriesFor(al), active(al, 0, 1));
  assert.deepEqual(texts(items), ["temprano", "por", "la", "mañana"]);
  assert.deepEqual(kinds(items), ["es", "ins", "ins", "es"]);
  // вставки не привязаны ни к какому русскому слову — ложных соответствий нет
  for (const it of items.filter((x) => x.kind === "ins")) {
    assert.equal(it.headId, undefined);
    assert.equal(it.unit, undefined);
  }
});

/* ---------- Сценарий 3.1: слово исчезает, сливаясь с переводом соседа ---------- */
/* «за ней наблюдал Иисус» -> «Jesús la observaba» */

const MERGE = () =>
  makeAlign(
    [10, 11, 12, 13],
    ["за", "ней", "наблюдал", "Иисус"],
    ["Jesús", "la", "observaba"],
    [
      { ru: [0, 2], es: [2, 2], head: 2 }, // за + наблюдал -> observaba
      { ru: [1], es: [1, 1], head: 1 }, // ней -> la
      { ru: [3], es: [0, 0], head: 3 }, // Иисус -> Jesús
    ]
  );

test("сценарий 3.1: клик по «наблюдал» — голова юнита «за + наблюдал»", () => {
  const al = MERGE();
  assert.ok(al);
  assert.equal(classifyClick(al, 12), "head");
  assert.equal(al.units[al.ruUnit[2]].translation, "observaba");
});

test("сценарий 3.1: «за» — спутник: гаснет при активном юните, без своего перевода", () => {
  const al = MERGE();
  assert.equal(classifyClick(al, 10), "satellite");
  // активен только «наблюдал»: «за» тает на месте, наблюдается связь за+наблюдал
  const items = layoutEntries(entriesFor(al), active(al, 2));
  assert.deepEqual(kinds(items), ["sat", "word", "es", "word"]);
  assert.deepEqual(texts(items), ["за", "ней", "observaba", "Иисус"]);
});

test("сценарий 3.1: всё предложение переведено — испанский порядок с перестановкой", () => {
  const al = MERGE();
  const items = layoutEntries(entriesFor(al), active(al, 0, 1, 2, 3));
  assert.deepEqual(texts(items), ["Jesús", "la", "за", "observaba"]);
  assert.deepEqual(kinds(items), ["es", "es", "sat", "es"]);
});

/* ---------- Сценарий 3.2: одно слово -> несколько испанских ---------- */

test("сценарий 3.2: «перед» раскрывается в «antes del» одним юнитом", () => {
  const al = makeAlign(
    [31, 32],
    ["перед", "рассветом"],
    ["antes", "del", "amanecer"],
    [
      { ru: [0], es: [0, 1], head: 0 },
      { ru: [1], es: [2, 2], head: 1 },
    ]
  );
  assert.ok(al);
  const items = layoutEntries(entriesFor(al), active(al, 0, 1));
  assert.deepEqual(texts(items), ["antes", "del", "amanecer"]);
  // оба токена «antes del» принадлежат одному юниту с общей головой
  const esItems = items.filter((x) => x.kind === "es");
  assert.equal(esItems[0].unit, esItems[1].unit);
  assert.equal(esItems[0].headId, esItems[1].headId);
});

/* ---------- Сценарий 4: слово без отдельного перевода ---------- */

test("сценарий 4: непокрытое слово классифицируется как none (клик = вибрация)", () => {
  const al2 = makeAlign(
    [41, 42, 43],
    ["за", "ней", "наблюдал"],
    ["observaba"],
    [{ ru: [0, 2], es: [0, 0], head: 2 }]
  );
  assert.ok(al2);
  assert.equal(classifyClick(al2, 42), "none");
  assert.equal(classifyClick(al2, 41), "satellite");
  // непокрытое слово рисуется как обычное русское
  const items = layoutEntries(entriesFor(al2), active(al2, 2));
  assert.deepEqual(texts(items), ["за", "ней", "observaba"]);
});

/* ---------- Нормализация и защита от мусора ---------- */

test("normalize: эхо ru_words не совпало — выравнивание отвергнуто", () => {
  const al = normalizeAlignment(
    { ru_words: ["за", "ней", "другое"], es_words: ["la"], units: [{ ru: [0, 1], es: [0, 0], head: 1 }] },
    [10, 11, 12],
    ["за", "ней", "наблюдал"]
  );
  assert.equal(al, null);
});

test("normalize: пересечение es-диапазонов и ru-индексов отвергнуто", () => {
  assert.equal(
    makeAlign([1, 2], ["а", "б"], ["x", "y"], [
      { ru: [0], es: [0, 1], head: 0 },
      { ru: [1], es: [1, 1], head: 1 },
    ]),
    null
  );
  assert.equal(
    makeAlign([1, 2], ["а", "б"], ["x", "y"], [
      { ru: [0, 1], es: [0, 0], head: 0 },
      { ru: [1], es: [1, 1], head: 1 },
    ]),
    null
  );
});

test("normalize: индексы вне диапазона и head вне списка ru", () => {
  assert.equal(makeAlign([1, 2], ["а", "б"], ["x"], [{ ru: [0, 5], es: [0, 0], head: 0 }]), null);
  assert.equal(makeAlign([1, 2], ["а", "б"], ["x"], [{ ru: [0], es: [0, 9], head: 0 }]), null);
  // head вне списка молча поправляется на последний ru-индекс юнита
  const al = makeAlign([1, 2], ["а", "б"], ["x"], [{ ru: [0, 1], es: [0, 0], head: 99 }]);
  assert.equal(al.units[0].head, 1);
  assert.equal(al.units[0].headId, 2);
});

test("buildSentenceIndex: id предложения по порядку документа с позициями", () => {
  const idx = buildSentenceIndex({
    7: { w: "утром", sent: "S1" },
    5: { w: "рано", sent: "S1" },
    9: { w: "слово", sent: "S2" },
  });
  const s1 = idx.byKey.get("S1#5");
  assert.deepEqual(s1.ids, [5, 7]);
  assert.deepEqual(s1.words, ["рано", "утром"]);
  assert.equal(s1.pos[7], 1);
  assert.equal(idx.keyOf.get(7), "S1#5");
});

test("buildSentenceIndex: повтор предложения — разные вхождения по разрыву id", () => {
  // стих процитирован в комментарии: те же слова, id далеки друг от друга
  const idx = buildSentenceIndex({
    3: { w: "рано", sent: "S" },
    4: { w: "утром", sent: "S" },
    40: { w: "рано", sent: "S" },
    41: { w: "утром", sent: "S" },
  });
  assert.equal(idx.byKey.size, 2);
  assert.equal(idx.keyOf.get(3), "S#3");
  assert.equal(idx.keyOf.get(40), "S#40");
  assert.deepEqual(idx.byKey.get("S#40").ids, [40, 41]);
});

/* ---------- Пробелы вокруг групп не теряются ---------- */

test("layout: пробел после активной группы сохраняется перед следующим русским словом", () => {
  const al = makeAlign(
    [21, 22],
    ["рано", "утром"],
    ["temprano", "mañana"],
    [
      { ru: [0], es: [0, 0], head: 0 },
      { ru: [1], es: [1, 1], head: 1 },
    ]
  );
  // как buildEntries: слова предложения разделены пробельными узлами
  const entries = [];
  for (const [k, e] of entriesFor(al).entries()) {
    if (k > 0) entries.push(ws());
    entries.push(e);
  }
  entries.push(ws());
  entries.push({ kind: "word", id: 99, text: "вставка-контекст", ruIdx: -1, unit: null, al: null });
  const items = layoutEntries(entries, active(al, 0));
  // temprano, пробел, русское слово, пробел, ещё слово — без склейки
  assert.deepEqual(kinds(items), ["es", "ws", "word", "ws", "word"]);
  const wsCount = items.filter((x) => x.kind === "ws").length;
  assert.equal(wsCount, 2);
});

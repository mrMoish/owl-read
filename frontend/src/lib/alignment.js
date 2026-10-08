/** Модель соответствий «диапазон русских слов ↔ диапазон испанских слов».
 *
 * Юнит: { ru:[s,e], es:[s,e], head, headId, translation, esTexts } — связывает
 * непрерывный диапазон русских слов предложения с диапазоном испанских токенов.
 * Русские слова вне юнитов — нет отдельного перевода в контексте (клик = вибрация).
 * Испанские токены вне юнитов — добавленные слова-вставки между соответствиями.
 */

/** Индекс предложений по meta дня. Предложения с одинаковым текстом (повторы
 * в статье) — разные вхождения: слова одного вхождения имеют последовательные
 * id, поэтому группы рвутся при разрыве > 4. Ключ вхождения: "<sent>#<первый id>".
 * -> { byKey: Map<key, {key, sent, ids, words, pos}>, keyOf: Map<id, key> }. */
export function buildSentenceIndex(meta = {}) {
  const bySent = new Map();
  const ids = Object.keys(meta).map(Number).filter(Number.isInteger).sort((a, b) => a - b);
  for (const id of ids) {
    const m = meta[id] || {};
    const sent = m.sent || "";
    if (!sent) continue;
    let list = bySent.get(sent);
    if (!list) { list = []; bySent.set(sent, list); }
    list.push(id);
  }
  const byKey = new Map();
  const keyOf = new Map();
  for (const [sent, idList] of bySent) {
    let group = [];
    const flush = () => {
      if (!group.length) return;
      const key = `${sent}#${group[0]}`;
      const pos = {};
      group.forEach((id, i) => { pos[id] = i; keyOf.set(id, key); });
      byKey.set(key, { key, sent, ids: group, words: group.map((id) => meta[id].w || ""), pos });
      group = [];
    };
    for (const id of idList) {
      if (group.length && id - group[group.length - 1] > 4) flush();
      group.push(id);
    }
    flush();
  }
  return { byKey, keyOf };
}

function hashSent(sent) {
  let h = 5381;
  for (let i = 0; i < sent.length; i++) h = ((h * 33) ^ sent.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const isInt = (v) => Number.isInteger(v);

/** Защитная нормализация ответа сервера + привязка к id слов этого предложения.
 * Возвращает alignment или null. Единицы измерения индексов — позиция слова
 * в предложении (pos из buildSentenceIndex). */
export function normalizeAlignment(server, ids, words) {
  if (!server || !Array.isArray(ids) || !Array.isArray(words) || ids.length !== words.length || !ids.length) return null;
  const ru = server.ru_words;
  if (!Array.isArray(ru) || ru.length !== ids.length) return null;
  for (let i = 0; i < ru.length; i++) {
    if (String(ru[i]).trim() !== String(words[i]).trim()) return null;
  }
  const esWords = Array.isArray(server.es_words) ? server.es_words.map(String) : [];
  if (!esWords.length || esWords.length > 120 || esWords.some((w) => !w.trim())) return null;
  const rawUnits = Array.isArray(server.units) ? server.units : [];
  const raw = [];
  const ruTaken = new Set();
  const esTaken = new Set();
  for (const u of rawUnits) {
    if (!u || !Array.isArray(u.ru) || !Array.isArray(u.es)) return null;
    const [esS, esE] = u.es;
    if (!Array.isArray(u.ru) || !u.ru.length) return null;
    const ruIdx = [...new Set(u.ru.map(Number))].sort((a, b) => a - b);
    if (ruIdx.some((i) => !isInt(i) || i < 0 || i >= ids.length)) return null;
    if (!isInt(esS) || !isInt(esE) || esS < 0 || esE < esS || esE >= esWords.length) return null;
    let head = isInt(u.head) ? u.head : ruIdx[ruIdx.length - 1];
    if (!ruIdx.includes(head)) head = ruIdx[ruIdx.length - 1];
    let clash = false;
    for (const i of ruIdx) if (ruTaken.has(i)) clash = true;
    for (let i = esS; i <= esE; i++) if (esTaken.has(i)) clash = true;
    if (clash) return null;
    for (const i of ruIdx) ruTaken.add(i);
    for (let i = esS; i <= esE; i++) esTaken.add(i);
    raw.push({ ru: ruIdx, es: [esS, esE], head });
  }
  if (!raw.length) return null;
  raw.sort((a, b) => a.es[0] - b.es[0]);
  // карты принадлежности строим ПОСЛЕ сортировки, чтобы индексы указывали на свои юниты
  const ruUnit = new Array(ids.length).fill(-1);
  const esUnitOf = new Array(esWords.length).fill(-1);
  const units = raw.map((u, ui) => {
    for (const i of u.ru) ruUnit[i] = ui;
    for (let i = u.es[0]; i <= u.es[1]; i++) esUnitOf[i] = ui;
    return {
      ru: u.ru, es: u.es, head: u.head,
      headId: ids[u.head],
      translation: esWords.slice(u.es[0], u.es[1] + 1).join(" "),
      esTexts: esWords.slice(u.es[0], u.es[1] + 1),
    };
  });
  return { sentHash: hashSent(words.join(" ") + "|" + esWords.join(" ")), ids, words, esWords, units, ruUnit, esUnitOf };
}

/** Классификация клика по слову id при известном выравнивании предложения.
 * -> "active" | "head" | "satellite" | "none" | null (выравнивания нет). */
export function classifyClick(alignment, id) {
  if (!alignment) return null;
  const pos = alignment.ids.indexOf(id);
  if (pos < 0) return null;
  const ui = alignment.ruUnit[pos];
  if (ui < 0) return "none";
  const unit = alignment.units[ui];
  return unit.head === pos ? "head" : "satellite";
}

/** Разметка показа для списка записей уровня siblings.
 * entries: {kind:"word", id, text, ruIdx, unit, al} | {kind:"ws"} | {kind:"other", node}.
 * activeUnits: Set головных id активных юнитов.
 * Активная группа — подряд идущие слова активных юнитов (плюс пробелы);
 * внутри группы испанские токены идут в испанском порядке, между соседними
 * по es юнитами появляются непокрытые вставки, спутники юнита гаснут рядом с ним. */
export function layoutEntries(entries, activeUnits) {
  const isActive = (e) => e.kind === "word" && e.unit && activeUnits.has(String(e.unit.headId));
  const out = [];
  let i = 0;
  while (i < entries.length) {
    const e = entries[i];
    if (!isActive(e)) { out.push(e); i++; continue; }
    const words = [];
    let j = i;
    let lastWord = -1;
    while (j < entries.length) {
      const x = entries[j];
      if (x.kind === "ws") { j++; continue; }
      if (isActive(x)) { words.push(x); lastWord = j; j++; continue; }
      break;
    }
    // пробелы после последнего слова группы не съедаем — они нужны следующему слову
    if (lastWord >= 0 && j > lastWord + 1) j = lastWord + 1;
    out.push(...expandGroup(words));
    i = j;
  }
  return out;
}

function expandGroup(words) {
  const items = [];
  const headUnits = [];
  const seenHead = new Set();
  for (const w of words) {
    const hid = String(w.unit.headId);
    if (String(w.id) === hid && !seenHead.has(hid)) { seenHead.add(hid); headUnits.push(w.unit); }
  }
  headUnits.sort((a, b) => a.es[0] - b.es[0]);
  // спутники, чья голова попала в другую группу: гаснут в начале, без испанских слов
  for (const w of words) {
    if (String(w.id) !== String(w.unit.headId) && !seenHead.has(String(w.unit.headId))) {
      items.push({ kind: "sat", id: w.id, text: w.text, unit: w.unit });
    }
  }
  for (let k = 0; k < headUnits.length; k++) {
    const u = headUnits[k];
    const al = words.length ? words[0].al : null;
    const sats = words.filter((w) => w.unit === u && String(w.id) !== String(u.headId));
    for (const s of sats) {
      if (s.ruIdx < u.head) items.push({ kind: "sat", id: s.id, text: s.text, unit: u });
    }
    u.esTexts.forEach((text, t) => {
      items.push({
        kind: "es", text, unit: u, headId: u.headId,
        key: t === 0 ? String(u.headId) : `${u.headId}t${u.es[0] + t}`,
      });
    });
    for (const s of sats) {
      if (s.ruIdx > u.head) items.push({ kind: "sat", id: s.id, text: s.text, unit: u });
    }
    if (k + 1 < headUnits.length) {
      const v = headUnits[k + 1];
      for (let t = u.es[1] + 1; t < v.es[0]; t++) {
        if (al && al.esUnitOf[t] === -1) {
          items.push({ kind: "ins", key: `i${al.sentHash}:${t}`, text: al.esWords[t] });
        }
      }
    }
  }
  return items;
}

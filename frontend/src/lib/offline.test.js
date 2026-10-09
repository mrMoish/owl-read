import test from "node:test";
import assert from "node:assert/strict";

import { initialData, offlineState, OFFLINE_ERROR } from "./offline.js";

test("1. Офлайн при совпадении даты: показан сохранённый выпуск с пометкой об отсутствии связи", () => {
  const cached = { date: "2026-10-09", title: "Ежедневный текст" };
  const res = offlineState({ shownData: null, cached, targetDate: "2026-10-09" });

  assert.equal(res.data, cached);
  assert.equal(res.error, null);
  assert.equal(res.notice, "Нет связи с сервером — показан сохранённый выпуск.");
});

test("2. Офлайн при другой дате (утренний сценарий): показан последний выпуск, в пометке его дата", () => {
  const cached = { date: "2026-10-08" };
  const res = offlineState({ shownData: null, cached, targetDate: "2026-10-09" });

  assert.equal(res.data, cached);
  assert.equal(res.error, null);
  assert.equal(res.notice, "Не удалось обновить материал. Показан сохранённый выпуск за 2026-10-08.");
});

test("3. Уже показанный материал приоритетнее сохранённого: экран не подменяется", () => {
  const shown = { date: "2026-10-09" };
  const cached = { date: "2026-10-08" };
  const res = offlineState({ shownData: shown, cached, targetDate: "2026-10-09" });

  assert.equal(res.data, shown);
  assert.equal(res.error, null);
});

test("4. Офлайн без какого-либо кэша: ошибка и экран «Повторить», данных нет", () => {
  const res = offlineState({ shownData: null, cached: null, targetDate: "2026-10-09" });

  assert.equal(res.data, null);
  assert.equal(res.notice, null);
  assert.equal(res.error, OFFLINE_ERROR);
});

test("5. Быстрый путь запуска: кэш другой даты не показывается до загрузки (защита от «вспышки» вчерашнего текста)", () => {
  const cached = { date: "2026-10-08" };
  assert.equal(initialData(cached, "2026-10-09"), null);
  assert.equal(initialData(cached, "2026-10-08"), cached);
  assert.equal(initialData(null, "2026-10-09"), null);
});

test("6. Функции чистые: входные объекты не мутируются", () => {
  const cached = { date: "2026-10-08" };
  const snapshot = JSON.stringify(cached);
  offlineState({ shownData: null, cached, targetDate: "2026-10-09" });
  initialData(cached, "2026-10-09");
  assert.equal(JSON.stringify(cached), snapshot);
});

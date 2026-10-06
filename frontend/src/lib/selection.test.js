import test from "node:test";
import assert from "node:assert";
import { pickShown } from "./selection.js";
const order = [5, 2, 9, 1], tr = { 5: "a", 2: "b", 9: "c", 1: "d" };
test("0% — ничего", () => assert.equal(pickShown(order, tr, 0).size, 0));
test("50% — верхняя половина по приоритету", () => assert.deepEqual([...pickShown(order, tr, 50)], [5, 2]));
test("рост процента не убирает слова", () => {
  const a = pickShown(order, tr, 25), b = pickShown(order, tr, 50);
  for (const x of a) assert.ok(b.has(x));
});
test("слово без перевода остаётся русским", () => assert.equal(pickShown(order, { 2: "b" }, 50).has(5), false));

import test from "node:test";
import assert from "node:assert";

import {
  loadSmoothSettings,
  saveSmoothSettings,
  loadUserSettings,
  saveUserSettings,
} from "./storage.js";
import { getSmoothToggleLabel } from "./modes.js";
import { pickShown } from "./selection.js";

// Mock localStorage for node environment if not present
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

test("getSmoothToggleLabel returns correct toggle switch label per mode", () => {
  assert.strictEqual(getSmoothToggleLabel("ru-es"), "плавное освоение русского");
  assert.strictEqual(getSmoothToggleLabel("es-ru"), "плавное освоение испанского");
  assert.strictEqual(getSmoothToggleLabel("en-ru"), "плавное освоение английского");
  assert.strictEqual(getSmoothToggleLabel("ru-es-translit"), "плавное освоение русского");
  assert.strictEqual(getSmoothToggleLabel("es-ru-translit"), "плавное освоение испанского");
});

test("loadSmoothSettings defaults to disabled (enabled: false) and percent: 10", () => {
  localStorage.clear();
  const ruEsSettings = loadSmoothSettings("ru-es");
  assert.strictEqual(ruEsSettings.enabled, false);
  assert.strictEqual(ruEsSettings.percent, 10);

  const esRuSettings = loadSmoothSettings("es-ru");
  assert.strictEqual(esRuSettings.enabled, false);
  assert.strictEqual(esRuSettings.percent, 10);
});

test("saveSmoothSettings persists mode-specific settings independently in localStorage", () => {
  localStorage.clear();

  saveSmoothSettings("ru-es", { enabled: true, percent: 30 });
  saveSmoothSettings("es-ru", { enabled: false, percent: 15 });

  const ruEs = loadSmoothSettings("ru-es");
  assert.strictEqual(ruEs.enabled, true);
  assert.strictEqual(ruEs.percent, 30);

  const esRu = loadSmoothSettings("es-ru");
  assert.strictEqual(esRu.enabled, false);
  assert.strictEqual(esRu.percent, 15);
});

test("pickShown selects correct translation tokens for percentage slider", () => {
  const order = ["w1", "w2", "w3", "w4", "w5"];
  const translations = {
    w1: "uno",
    w2: "dos",
    w3: "tres",
    w4: "cuatro",
    w5: "cinco",
  };

  const set0 = pickShown(order, translations, 0);
  assert.strictEqual(set0.size, 0);

  const set40 = pickShown(order, translations, 40);
  assert.strictEqual(set40.size, 2);
  assert.ok(set40.has("w1"));
  assert.ok(set40.has("w2"));

  const set100 = pickShown(order, translations, 100);
  assert.strictEqual(set100.size, 5);
});

test("long-press target check excludes word elements", () => {
  const shouldIgnoreLongPress = (targetElem) => {
    return Boolean(
      targetElem?.closest?.(".settings-bottom-sheet") ||
      targetElem?.closest?.(".word") ||
      targetElem?.closest?.("button") ||
      targetElem?.closest?.("input") ||
      targetElem?.closest?.("a")
    );
  };

  const wordNode = {
    className: "word word--translated",
    closest: (sel) => (sel === ".word" ? wordNode : null),
  };

  const articleNode = {
    className: "article",
    closest: () => null,
  };

  assert.strictEqual(shouldIgnoreLongPress(wordNode), true);
  assert.strictEqual(shouldIgnoreLongPress(articleNode), false);
});

test("smoothTranslations properly filters visible translations when smoothConfig is enabled", () => {
  const allTranslations = {
    w1: "uno",
    w2: "dos",
    w3: "tres",
    w4: "cuatro",
    w5: "cinco",
  };
  const order = ["w1", "w2", "w3", "w4", "w5"];

  // Helper simulating App.jsx translation combination
  const computeVisible = (enabled, percent, tokenTranslations = {}) => {
    let smoothTranslations = {};
    if (enabled) {
      const shownSet = pickShown(order, allTranslations, percent);
      for (const id of shownSet) {
        if (allTranslations[id]) smoothTranslations[id] = allTranslations[id];
      }
    }

    const combinedPrepared = enabled
      ? { ...smoothTranslations, ...tokenTranslations }
      : { ...allTranslations, ...tokenTranslations };

    return enabled
      ? { ...smoothTranslations, ...tokenTranslations }
      : { ...tokenTranslations };
  };

  // Disabled: only user clicked tokens are shown
  const disabledRes = computeVisible(false, 10, { w1: "uno" });
  assert.deepStrictEqual(disabledRes, { w1: "uno" });

  // Enabled at 20%: only top 1 token (w1) is shown
  const enabled20 = computeVisible(true, 20, {});
  assert.deepStrictEqual(enabled20, { w1: "uno" });

  // Enabled at 60%: top 3 tokens (w1, w2, w3) are shown
  const enabled60 = computeVisible(true, 60, {});
  assert.deepStrictEqual(enabled60, { w1: "uno", w2: "dos", w3: "tres" });
});

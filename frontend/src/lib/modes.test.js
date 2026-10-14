import { test } from "node:test";
import assert from "node:assert";
import { getModeByPath, MODES, saveSelectedMode, loadSelectedMode, activeMode } from "./modes.js";

const memoryStore = new Map();
globalThis.localStorage = {
  getItem: (key) => memoryStore.get(key) || null,
  setItem: (key, val) => memoryStore.set(key, String(val)),
  removeItem: (key) => memoryStore.delete(key),
  clear: () => memoryStore.clear(),
};

test("Modes configuration defines canonical modes correctly", () => {
  assert.strictEqual(MODES["ru-es"].source, "ru");
  assert.strictEqual(MODES["ru-es"].target, "es");
  assert.strictEqual(MODES["ru-es"].transliterate, false);
  assert.strictEqual(MODES["ru-es"].path, "/ru-es/");

  assert.strictEqual(MODES["es-ru"].source, "es");
  assert.strictEqual(MODES["es-ru"].target, "ru");
  assert.strictEqual(MODES["es-ru"].transliterate, false);

  assert.strictEqual(MODES["ru-es-translit"].source, "ru");
  assert.strictEqual(MODES["ru-es-translit"].target, "es");
  assert.strictEqual(MODES["ru-es-translit"].transliterate, true);

  assert.strictEqual(MODES["en-ru"].source, "en");
  assert.strictEqual(MODES["en-ru"].target, "ru");
  assert.strictEqual(MODES["en-ru"].transliterate, false);

  assert.strictEqual(MODES["es-ru-translit"].source, "es");
  assert.strictEqual(MODES["es-ru-translit"].target, "ru");
  assert.strictEqual(MODES["es-ru-translit"].transliterate, true);
});

test("Route detection resolves canonical /ru-es/, /es-ru/, /ru-es-translit/, /es-ru-translit/, /en-ru/ routes", () => {
  assert.strictEqual(getModeByPath("/ru-es/"), MODES["ru-es"]);
  assert.strictEqual(getModeByPath("/es-ru/"), MODES["es-ru"]);
  assert.strictEqual(getModeByPath("/ru-es-translit/"), MODES["ru-es-translit"]);
  assert.strictEqual(getModeByPath("/es-ru-translit/"), MODES["es-ru-translit"]);
  assert.strictEqual(getModeByPath("/en-ru/"), MODES["en-ru"]);
});

test("Backward compatibility routes map to appropriate canonical modes", () => {
  assert.strictEqual(getModeByPath("/s1/"), MODES["ru-es"]);
  assert.strictEqual(getModeByPath("/es/"), MODES["ru-es"]);
  assert.strictEqual(getModeByPath("/s2/"), MODES["es-ru"]);
  assert.strictEqual(getModeByPath("/ru/"), MODES["es-ru"]);
  assert.strictEqual(getModeByPath("/s3/"), MODES["ru-es-translit"]);
  assert.strictEqual(getModeByPath("/s4/"), MODES["en-ru"]);
  assert.strictEqual(getModeByPath("/en/"), MODES["en-ru"]);
});

test("Selected mode persistence: saveSelectedMode and loadSelectedMode", () => {
  globalThis.localStorage.clear();

  assert.strictEqual(loadSelectedMode(), null);

  // Save by mode ID
  saveSelectedMode("ru-es-translit");
  assert.strictEqual(loadSelectedMode(), MODES["ru-es-translit"]);

  // Save by mode object
  saveSelectedMode(MODES["es-ru-translit"]);
  assert.strictEqual(loadSelectedMode(), MODES["es-ru-translit"]);

  // Save by path
  saveSelectedMode("/en-ru/");
  assert.strictEqual(loadSelectedMode(), MODES["en-ru"]);
});

test("activeMode auto-persists mode when visiting non-root paths", () => {
  globalThis.localStorage.clear();

  globalThis.window = {
    location: { pathname: "/es-ru-translit/" },
  };

  const mode = activeMode();
  assert.strictEqual(mode, MODES["es-ru-translit"]);
  assert.strictEqual(loadSelectedMode(), MODES["es-ru-translit"]);
});

test("Mode navigation persistence between es-ru (/ru/) and ru-es modes", () => {
  globalThis.localStorage.clear();

  // Visiting /ru/ (es-ru)
  globalThis.window = {
    location: { pathname: "/ru/" },
  };
  assert.strictEqual(activeMode(), MODES["es-ru"]);
  assert.strictEqual(loadSelectedMode(), MODES["es-ru"]);

  // User clicks navigation button to switch to ru-es
  saveSelectedMode("ru-es");
  assert.strictEqual(loadSelectedMode(), MODES["ru-es"]);

  // User navigates to /ru-es/
  globalThis.window = {
    location: { pathname: "/ru-es/" },
  };
  assert.strictEqual(activeMode(), MODES["ru-es"]);

  // User clicks return button to switch back to es-ru
  saveSelectedMode("es-ru");
  assert.strictEqual(loadSelectedMode(), MODES["es-ru"]);
});

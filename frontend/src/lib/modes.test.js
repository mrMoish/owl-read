import { test, beforeEach } from "node:test";
import assert from "node:assert";
import { getModeByPath, MODES, saveSelectedMode, loadSelectedMode, activeMode } from "./modes.js";

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

test("Mode persistence in localStorage", () => {
  const mockStorage = {};
  global.window = {
    localStorage: {
      getItem: (k) => mockStorage[k] || null,
      setItem: (k, v) => { mockStorage[k] = String(v); },
    },
    location: { pathname: "/" },
  };

  saveSelectedMode("es-ru-translit");
  assert.strictEqual(loadSelectedMode(), MODES["es-ru-translit"]);
  assert.strictEqual(activeMode(), MODES["es-ru-translit"]);

  // Test activeMode updates persistence when path matches
  global.window.location.pathname = "/en-ru/";
  assert.strictEqual(activeMode(), MODES["en-ru"]);
  assert.strictEqual(loadSelectedMode(), MODES["en-ru"]);

  delete global.window;
});

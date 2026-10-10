import test from "node:test";
import assert from "node:assert/strict";

import {
  loadLanguagePreference,
  saveLanguagePreference,
  resolveLanguageMode,
} from "./storage.js";

// Mock localStorage and window
const memoryStore = new Map();
globalThis.localStorage = {
  getItem: (key) => memoryStore.get(key) || null,
  setItem: (key, val) => memoryStore.set(key, String(val)),
  removeItem: (key) => memoryStore.delete(key),
  clear: () => memoryStore.clear(),
};

function setWindowLocationSearch(searchStr) {
  globalThis.window = {
    location: {
      search: searchStr,
    },
  };
}

test("1. Opening the website with ?en activates English mode and persists 'en'", () => {
  globalThis.localStorage.clear();
  setWindowLocationSearch("?en");

  const mode = resolveLanguageMode();
  assert.equal(mode, "en");
  assert.equal(loadLanguagePreference(), "en");
});

test("2. Opening the website with ?lang=en activates English mode and persists 'en'", () => {
  globalThis.localStorage.clear();
  setWindowLocationSearch("?lang=en");

  const mode = resolveLanguageMode();
  assert.equal(mode, "en");
  assert.equal(loadLanguagePreference(), "en");
});

test("3. Selected language is persisted in localStorage", () => {
  globalThis.localStorage.clear();
  saveLanguagePreference("en");
  assert.equal(loadLanguagePreference(), "en");
});

test("4. Reloading the application without query parameters restores English mode", () => {
  globalThis.localStorage.clear();
  // First visit with ?en
  setWindowLocationSearch("?en");
  resolveLanguageMode();

  // Reload without query params
  setWindowLocationSearch("");
  const mode = resolveLanguageMode();
  assert.equal(mode, "en");
});

test("5. Launching the application without query parameters restores English mode when an English preference was previously saved", () => {
  globalThis.localStorage.clear();
  saveLanguagePreference("en");

  setWindowLocationSearch(""); // Launched from home screen without params
  const mode = resolveLanguageMode();
  assert.equal(mode, "en");
});

test("6. An explicit language parameter overrides the previously saved preference", () => {
  globalThis.localStorage.clear();
  saveLanguagePreference("en");

  // User explicitly opens with ?lang=es
  setWindowLocationSearch("?lang=es");
  const modeEs = resolveLanguageMode();
  assert.equal(modeEs, "es");
  assert.equal(loadLanguagePreference(), "es");

  // Next reload without params retains Spanish preference
  setWindowLocationSearch("");
  assert.equal(resolveLanguageMode(), "es");

  // Now user explicitly opens with ?lang=en
  setWindowLocationSearch("?lang=en");
  const modeEn = resolveLanguageMode();
  assert.equal(modeEn, "en");
  assert.equal(loadLanguagePreference(), "en");
});

test("7. When neither a URL language parameter nor a saved preference exists, the existing default language is preserved", () => {
  globalThis.localStorage.clear();
  setWindowLocationSearch("");

  const mode = resolveLanguageMode();
  assert.equal(mode, "es");
});

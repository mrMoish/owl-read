import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { resolveLanguageMode, saveLanguagePreference } from "./language.js";

// Mock window & localStorage for node environment tests
class LocalStorageMock {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] || null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

const localStorageMock = new LocalStorageMock();
globalThis.localStorage = localStorageMock;
globalThis.window = {
  location: { pathname: "/", search: "" },
  localStorage: localStorageMock,
};

test("Language Resolution: /en path resolves to English mode", () => {
  const res = resolveLanguageMode({ pathname: "/en", search: "" });
  assert.equal(res.isEn, true);
  assert.equal(res.source, "path");

  const resTrailing = resolveLanguageMode({ pathname: "/en/today", search: "" });
  assert.equal(resTrailing.isEn, true);
  assert.equal(resTrailing.source, "path");
});

test("Language Resolution: ?en query param resolves to English mode", () => {
  const res = resolveLanguageMode({ pathname: "/", search: "?en=1" });
  assert.equal(res.isEn, true);
  assert.equal(res.source, "query");

  const resLang = resolveLanguageMode({ pathname: "/", search: "?lang=en" });
  assert.equal(resLang.isEn, true);
  assert.equal(resLang.source, "query");
});

test("Language Resolution: Container storage preference restoration", () => {
  globalThis.localStorage.clear();
  saveLanguagePreference(true);
  const resSavedEn = resolveLanguageMode({ pathname: "/", search: "" });
  assert.equal(resSavedEn.isEn, true);
  assert.equal(resSavedEn.source, "storage");

  saveLanguagePreference(false);
  const resSavedEs = resolveLanguageMode({ pathname: "/", search: "" });
  assert.equal(resSavedEs.isEn, false);
  assert.equal(resSavedEs.source, "storage");
});

test("Language Resolution: Default mode is Spanish", () => {
  globalThis.localStorage.clear();
  const res = resolveLanguageMode({ pathname: "/", search: "" });
  assert.equal(res.isEn, false);
  assert.equal(res.source, "default");
});

test("Language Precedence: URL explicit parameters override container storage", () => {
  globalThis.localStorage.clear();
  saveLanguagePreference(false); // stored Spanish
  const resPath = resolveLanguageMode({ pathname: "/en/", search: "" });
  assert.equal(resPath.isEn, true); // Path overrides storage

  const resQuery = resolveLanguageMode({ pathname: "/", search: "?en" });
  assert.equal(resQuery.isEn, true); // Query overrides storage
});

test("Web App Manifests: Check start_url, scope, id", () => {
  const publicDir = path.resolve(process.cwd(), "public");
  const manifestEs = JSON.parse(fs.readFileSync(path.join(publicDir, "manifest.webmanifest"), "utf8"));
  const manifestEn = JSON.parse(fs.readFileSync(path.join(publicDir, "manifest-en.webmanifest"), "utf8"));

  assert.equal(manifestEs.start_url, "/");
  assert.equal(manifestEs.scope, "/");
  assert.equal(manifestEs.id, "/");

  assert.equal(manifestEn.start_url, "/en/");
  assert.equal(manifestEn.scope, "/en/");
  assert.equal(manifestEn.id, "/en/");
});

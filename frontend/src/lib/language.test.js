import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isEnglishPath, isSpanishPath } from "./language.js";

test("Path-based Language Resolution: isEnglishPath and isSpanishPath", () => {
  assert.equal(isEnglishPath("/"), false);
  assert.equal(isEnglishPath("/en"), true);
  assert.equal(isEnglishPath("/en/"), true);
  assert.equal(isEnglishPath("/en/today"), true);
  assert.equal(isEnglishPath("/english"), false);

  assert.equal(isSpanishPath("/"), false);
  assert.equal(isSpanishPath("/es"), true);
  assert.equal(isSpanishPath("/es/"), true);
  assert.equal(isSpanishPath("/es/today"), true);
  assert.equal(isSpanishPath("/espanol"), false);
});

test("No query or storage language parsing: ?en parameters do not alter isEnglishPath", () => {
  assert.equal(isEnglishPath("/"), false);
});

test("Web App Manifests: Russian vs English vs Spanish manifests", () => {
  const publicDir = path.resolve(process.cwd(), "public");
  const manifestRu = JSON.parse(fs.readFileSync(path.join(publicDir, "manifest.webmanifest"), "utf8"));
  const manifestEn = JSON.parse(fs.readFileSync(path.join(publicDir, "manifest-en.webmanifest"), "utf8"));
  const manifestEs = JSON.parse(fs.readFileSync(path.join(publicDir, "manifest-es.webmanifest"), "utf8"));

  assert.equal(manifestRu.start_url, "/");
  assert.equal(manifestRu.scope, "/");
  assert.equal(manifestRu.id, "/");

  assert.equal(manifestEn.name, "English");
  assert.equal(manifestEn.short_name, "English");
  assert.equal(manifestEn.start_url, "/en/");
  assert.equal(manifestEn.scope, "/en/");
  assert.equal(manifestEn.id, "/en/");

  assert.equal(manifestEs.name, "Español");
  assert.equal(manifestEs.short_name, "Español");
  assert.equal(manifestEs.start_url, "/es/");
  assert.equal(manifestEs.scope, "/es/");
  assert.equal(manifestEs.id, "/es/");

  for (const icon of [...manifestRu.icons, ...manifestEn.icons, ...manifestEs.icons]) {
    const iconPath = path.join(publicDir, icon.src.replace(/^\//, ""));
    assert.equal(fs.existsSync(iconPath), true, `Icon missing: ${icon.src}`);
  }
});

test("HTML Entry Points: Static manifest links check", () => {
  const rootDir = process.cwd();
  const htmlRu = fs.readFileSync(path.resolve(rootDir, "index.html"), "utf8");
  const htmlEn = fs.readFileSync(path.resolve(rootDir, "en/index.html"), "utf8");
  const htmlEs = fs.readFileSync(path.resolve(rootDir, "es/index.html"), "utf8");

  assert.match(htmlRu, /<link\s+rel="manifest"\s+href="\/manifest\.webmanifest"/);
  assert.match(htmlEn, /<link\s+rel="manifest"\s+href="\/manifest-en\.webmanifest"/);
  assert.match(htmlEs, /<link\s+rel="manifest"\s+href="\/manifest-es\.webmanifest"/);
});

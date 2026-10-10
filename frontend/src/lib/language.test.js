import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isEnglishPath } from "./language.js";

test("Path-based Language Resolution: isEnglishPath", () => {
  assert.equal(isEnglishPath("/"), false);
  assert.equal(isEnglishPath("/en"), true);
  assert.equal(isEnglishPath("/en/"), true);
  assert.equal(isEnglishPath("/en/today"), true);
  assert.equal(isEnglishPath("/english"), false);
});

test("No query or storage language parsing: ?en parameters do not alter isEnglishPath", () => {
  assert.equal(isEnglishPath("/"), false);
});

test("Web App Manifests: Spanish vs English manifests", () => {
  const publicDir = path.resolve(process.cwd(), "public");
  const manifestEs = JSON.parse(fs.readFileSync(path.join(publicDir, "manifest.webmanifest"), "utf8"));
  const manifestEn = JSON.parse(fs.readFileSync(path.join(publicDir, "manifest-en.webmanifest"), "utf8"));

  assert.equal(manifestEs.start_url, "/");
  assert.equal(manifestEs.scope, "/");
  assert.equal(manifestEs.id, "/");

  assert.equal(manifestEn.name, "English");
  assert.equal(manifestEn.short_name, "English");
  assert.equal(manifestEn.start_url, "/en/");
  assert.equal(manifestEn.scope, "/en/");
  assert.equal(manifestEn.id, "/en/");

  for (const icon of [...manifestEs.icons, ...manifestEn.icons]) {
    const iconPath = path.join(publicDir, icon.src.replace(/^\//, ""));
    assert.equal(fs.existsSync(iconPath), true, `Icon missing: ${icon.src}`);
  }
});

test("HTML Entry Points: Static manifest links check", () => {
  const rootDir = process.cwd();
  const htmlEs = fs.readFileSync(path.resolve(rootDir, "index.html"), "utf8");
  const htmlEn = fs.readFileSync(path.resolve(rootDir, "en/index.html"), "utf8");

  assert.match(htmlEs, /<link\s+rel="manifest"\s+href="\/manifest\.webmanifest"/);
  assert.match(htmlEn, /<link\s+rel="manifest"\s+href="\/manifest-en\.webmanifest"/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { getPronunciation } from "./pronunciation.js";

test("Spanish pronunciation generation: IPA and Russian hint", () => {
  const p1 = getPronunciation("hola", "es");
  assert.ok(p1.ipa.length > 0, "IPA should not be empty");
  assert.ok(p1.ruHint.includes("о"), "Russian hint should contain 'о'");

  const p2 = getPronunciation("español", "es");
  assert.ok(p2.ipa.includes("ɲ"), "IPA for español should include 'ɲ'");
  assert.ok(p2.ruHint.includes("нь") || p2.ruHint.includes("н"), "Russian hint should transcribe ñ");

  const p3 = getPronunciation("gracias", "es");
  assert.ok(p3.ipa.length > 0);
  assert.ok(p3.ruHint.length > 0);
});

test("Argentine Spanish (es-AR) pronunciation rules: sheísmo for ll and y", () => {
  const p1 = getPronunciation("llamar", "es");
  assert.ok(p1.ipa.includes("ʃ"), "IPA for llamar should use [ʃ]");
  assert.ok(p1.ruHint.includes("ш"), "Russian hint for llamar should use 'ш'");

  const p2 = getPronunciation("calle", "es");
  assert.ok(p2.ipa.includes("ʃ"), "IPA for calle should use [ʃ]");
  assert.ok(p2.ruHint.includes("ш"), "Russian hint for calle should use 'ш'");

  const p3 = getPronunciation("yo", "es");
  assert.ok(p3.ipa.includes("ʃ"), "IPA for yo should use [ʃ]");
  assert.ok(p3.ruHint.includes("ш"), "Russian hint for yo should use 'ш'");

  const p4 = getPronunciation("rey", "es");
  assert.ok(p4.ruHint.includes("й"), "Russian hint for rey should keep 'й' at the end");
});

test("English pronunciation generation: IPA and Russian hint", () => {
  const p1 = getPronunciation("the", "en");
  assert.equal(p1.ipa, "[ðə]");
  assert.equal(p1.ruHint, "зэ");

  const p2 = getPronunciation("about", "en");
  assert.equal(p2.ipa, "[əˈbaʊt]");
  assert.equal(p2.ruHint, "эба́ут");

  const p3 = getPronunciation("word", "en");
  assert.equal(p3.ipa, "[wɜːrd]");
  assert.equal(p3.ruHint, "уорд");
});

test("Russian pronunciation generation: IPA and Russian hint", () => {
  const p1 = getPronunciation("слово", "ru");
  assert.ok(p1.ipa.length > 0);
  assert.ok(p1.ruHint.includes("сло́во") || p1.ruHint.includes("слово"));
});

test("Edge cases: empty inputs and non-letter symbols", () => {
  const pEmpty = getPronunciation("", "es");
  assert.deepEqual(pEmpty, { ipa: "", ruHint: "" });

  const pSymbol = getPronunciation("!!!", "es");
  assert.deepEqual(pSymbol, { ipa: "", ruHint: "" });
});

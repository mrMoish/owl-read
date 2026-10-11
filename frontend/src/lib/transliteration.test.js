import test from "node:test";
import assert from "node:assert/strict";
import {
  transliterateRussianToLatin,
  transliterateSpanishToCyrillic,
  transliterateBlock,
} from "./transliteration.js";

test("Transliterate Russian to Latin phonetic representation", () => {
  assert.equal(transliterateRussianToLatin("Почтительный"), "Pochtitel'nyy");
  assert.equal(transliterateRussianToLatin("Иегова"), "Iegova");
  assert.equal(transliterateRussianToLatin("любовь"), "lyubov'");
});

test("Transliterate Spanish to Cyrillic phonetic representation", () => {
  assert.equal(transliterateSpanishToCyrillic("Examinemos"), "Эксаминэмос");
  assert.equal(transliterateSpanishToCyrillic("llama"), "йама");
  assert.equal(transliterateSpanishToCyrillic("chico"), "чико");
});

test("Transliterate Block structure", () => {
  const block = {
    nodes: [
      { t: "text", s: "Слово " },
      { t: "w", s: "Иегова" },
    ],
  };
  const res = transliterateBlock(block, "ru", "es");
  assert.equal(res.nodes[0].s, "Slovo ");
  assert.equal(res.nodes[1].s, "Iegova");
});

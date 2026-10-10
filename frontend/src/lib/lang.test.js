import test from "node:test";
import assert from "node:assert/strict";

import { getParagraphLang, countWordsAndTranslations } from "./lang.js";

test("countWordsAndTranslations accurately counts total and translated words in nested nodes", () => {
  const nodes = [
    { t: "w", id: 1, s: "слово1" },
    { t: "text", s: " " },
    {
      t: "em",
      c: [
        { t: "w", id: 2, s: "слово2" },
        { t: "text", s: " " },
        { t: "w", id: 3, s: "слово3" },
      ],
    },
  ];

  const translations = { "1": "word1", "3": "word3" };
  const counts = countWordsAndTranslations(nodes, translations);

  assert.equal(counts.totalWords, 3);
  assert.equal(counts.translatedWords, 2);
});

test("Paragraph lang attribute: <= 50% translated -> lang='ru'", () => {
  const nodes = [
    { t: "w", id: 1, s: "один" },
    { t: "text", s: " " },
    { t: "w", id: 2, s: "два" },
    { t: "text", s: " " },
    { t: "w", id: 3, s: "три" },
    { t: "text", s: " " },
    { t: "w", id: 4, s: "четыре" },
  ];

  // 2 out of 4 translated (50%) -> <= 50% -> 'ru'
  const translations50 = { "1": "one", "2": "two" };
  assert.equal(getParagraphLang(nodes, translations50, "es"), "ru");
  assert.equal(getParagraphLang(nodes, translations50, "en"), "ru");

  // 1 out of 4 translated (25%) -> <= 50% -> 'ru'
  const translations25 = { "1": "one" };
  assert.equal(getParagraphLang(nodes, translations25, "es"), "ru");
  assert.equal(getParagraphLang(nodes, translations25, "en"), "ru");

  // 0 out of 4 translated (0%) -> <= 50% -> 'ru'
  assert.equal(getParagraphLang(nodes, {}, "es"), "ru");
});

test("Paragraph lang attribute: > 50% translated -> target language", () => {
  const nodes = [
    { t: "w", id: 1, s: "один" },
    { t: "text", s: " " },
    { t: "w", id: 2, s: "два" },
    { t: "text", s: " " },
    { t: "w", id: 3, s: "три" },
  ];

  // 2 out of 3 translated (66.7%) -> > 50% -> target language
  const translations = { "1": "uno", "2": "dos" };
  assert.equal(getParagraphLang(nodes, translations, "es"), "es");
  assert.equal(getParagraphLang(nodes, translations, "en"), "en");
});

test("Calculation considers only displayed translations, not merely available ones", () => {
  const nodes = [
    { t: "w", id: 1, s: "один" },
    { t: "text", s: " " },
    { t: "w", id: 2, s: "два" },
  ];

  // Available metadata / dictionary translations vs actually displayed translations
  const visibleTranslations = { "1": "one" }; // 1 out of 2 translated (50%)

  assert.equal(getParagraphLang(nodes, visibleTranslations, "en"), "ru");
});

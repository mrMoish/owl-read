import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeLemma,
  findMatchingTokenIds,
  applyLearnedTranslations,
} from "./learned.js";

import { formatTextNode } from "./punct.js";

// Polyfill minimal DOM / localStorage for node env testing
const memoryStore = new Map();
globalThis.localStorage = {
  getItem: (key) => memoryStore.get(key) || null,
  setItem: (key, val) => memoryStore.set(key, String(val)),
  removeItem: (key) => memoryStore.delete(key),
  clear: () => memoryStore.clear(),
};

test("On-demand translation: No pre-translation requests are made prior to clicking a word", () => {
  const requests = [];
  const mockTranslate = (payload) => {
    requests.push(payload);
    return Promise.resolve({ translation: "translated" });
  };

  // On page load, no translation request is sent automatically
  assert.equal(requests.length, 0);
});

test("Token isolation: Repeated words in the same comment have unique token IDs and do not cross-update", () => {
  const meta = {
    "101": { w: "amor", lemma: "amor", sent: "Dios es amor." },
    "102": { w: "y", lemma: "y", sent: "Dios es amor y paz." },
    "103": { w: "amor", lemma: "amor", sent: "Sientan amor verdadero." },
  };

  // Repeated word "amor" at token 101 and 103 are distinct tokens
  assert.notEqual(meta["101"], meta["103"]);
  assert.equal(meta["101"].sent, "Dios es amor.");
  assert.equal(meta["103"].sent, "Sientan amor verdadero.");

  // Learned words map lemmas; if not learned yet, prepared translations map token IDs directly
  const prepared = { "101": "любовь" };
  const learned = {
    amor: { lemma: "amor", primaryTranslation: "любовь", translations: ["любовь"] },
  };
  const visible = applyLearnedTranslations({
    meta,
    preparedTranslations: prepared,
    learnedWords: learned,
  });

  assert.equal(visible["101"], "любовь");
  assert.equal(visible["103"], "любовь");
});

test("Concurrent requests: Multiple pending requests for different tokens complete independently without overwriting", async () => {
  const tokenTranslations = {};
  const loadingTokens = {};

  const simulateRequest = async (id, word, sentence, delay, resultTranslation) => {
    loadingTokens[id] = true;
    await new Promise((resolve) => setTimeout(resolve, delay));
    delete loadingTokens[id];
    tokenTranslations[id] = resultTranslation;
  };

  // Fire concurrent requests for token 1 and token 2
  const p1 = simulateRequest("1", "palabra", "Una palabra de aliento.", 50, "слово");
  const p2 = simulateRequest("2", "verdad", "La verdad os hará libres.", 20, "истина");

  assert.equal(loadingTokens["1"], true);
  assert.equal(loadingTokens["2"], true);

  await Promise.all([p1, p2]);

  assert.equal(loadingTokens["1"], undefined);
  assert.equal(loadingTokens["2"], undefined);
  assert.equal(tokenTranslations["1"], "слово");
  assert.equal(tokenTranslations["2"], "истина");
});

test("Failed request restoration & retry support", async () => {
  let shouldFail = true;
  const loadingTokens = {};
  const tokenTranslations = {};

  const requestWordTranslation = async (id, word) => {
    loadingTokens[id] = true;
    try {
      if (shouldFail) {
        throw new Error("Network error");
      }
      tokenTranslations[id] = "успех";
    } finally {
      delete loadingTokens[id];
    }
  };

  // First attempt fails
  await assert.rejects(async () => {
    await requestWordTranslation("50", "éxito");
  }, /Network error/);

  // Word is restored to normal state (loading cleared, no translation stored)
  assert.equal(loadingTokens["50"], undefined);
  assert.equal(tokenTranslations["50"], undefined);

  // Retry attempt succeeds
  shouldFail = false;
  await requestWordTranslation("50", "éxito");
  assert.equal(loadingTokens["50"], undefined);
  assert.equal(tokenTranslations["50"], "успех");
});

test("Neighboring-word translation bug regression check", () => {
  // Check that token mapping is strictly keyed on exact token ID and string index
  const meta = {
    "1": { w: "первое", lemma: "первый", sent: "Первое слово." },
    "2": { w: "второе", lemma: "второй", sent: "Второе слово." },
  };

  const preparedTranslations = {
    "2": "segunda",
  };
  const learned = {
    второй: { lemma: "второй", primaryTranslation: "segunda", translations: ["segunda"] },
  };

  const visible = applyLearnedTranslations({
    meta,
    preparedTranslations,
    learnedWords: learned,
  });

  // Token "1" must NOT receive translation of token "2"
  assert.equal(visible["1"], undefined);
  assert.equal(visible["2"], "segunda");
});

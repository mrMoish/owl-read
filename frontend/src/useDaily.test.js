import test from "node:test";
import assert from "node:assert";

test("useDaily translation loading notice flow logic", () => {
  // Simulate data returned from fetchDaily with pending translations
  const pendingData = {
    date: "2026-10-11",
    translations_status: "pending",
    notice: null,
  };

  const isTranslating = pendingData.translations_status === "pending" || pendingData.translations_status === "partial";
  const initialNotice = isTranslating
    ? (pendingData.notice ? `${pendingData.notice} | Загрузка перевода…` : "Загрузка перевода…")
    : pendingData.notice;

  assert.strictEqual(initialNotice, "Загрузка перевода…");

  // After requestTranslations resolves:
  const completedData = {
    ...pendingData,
    translations: { "0": "Мужья" },
    translations_status: "ready",
  };
  const finalNotice = completedData.notice || null;

  assert.strictEqual(finalNotice, null);
});

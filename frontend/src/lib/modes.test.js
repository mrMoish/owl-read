import test from "node:test";
import assert from "node:assert/strict";
import { MODES, getModeByPath } from "./modes.js";

test("Modes configuration defines S1, S2, S3, S4 correctly", () => {
  assert.equal(MODES.s1.source, "ru");
  assert.equal(MODES.s1.target, "es");
  assert.equal(MODES.s1.transliterate, false);

  assert.equal(MODES.s2.source, "es");
  assert.equal(MODES.s2.target, "ru");
  assert.equal(MODES.s2.transliterate, false);

  assert.equal(MODES.s3.source, "ru");
  assert.equal(MODES.s3.target, "es");
  assert.equal(MODES.s3.transliterate, true);

  assert.equal(MODES.s4.source, "en");
  assert.equal(MODES.s4.target, "ru");
  assert.equal(MODES.s4.transliterate, false);
});

test("Route detection resolves explicit /s1/, /s2/, /s3/, /s4/ routes", () => {
  assert.equal(getModeByPath("/s1/").id, "s1");
  assert.equal(getModeByPath("/s2/").id, "s2");
  assert.equal(getModeByPath("/s3/").id, "s3");
  assert.equal(getModeByPath("/s4/").id, "s4");
});

test("Backward compatibility routes map to appropriate modes", () => {
  assert.equal(getModeByPath("/es/").id, "s1");
  assert.equal(getModeByPath("/ru/").id, "s2");
  assert.equal(getModeByPath("/en/").id, "s4");
});

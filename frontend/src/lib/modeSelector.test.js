import { test } from "node:test";
import assert from "node:assert";
import { MODES } from "./modes.js";

test("ModeSelector component configuration renders canonical mode links", () => {
  const modesList = Object.values(MODES);
  assert.strictEqual(modesList.length, 5);

  const paths = modesList.map((m) => m.path);
  assert.deepStrictEqual(paths, ["/ru-es/", "/es-ru/", "/ru-es-translit/", "/en-ru/", "/es-ru-translit/"]);
});

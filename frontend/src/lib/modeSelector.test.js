import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("ModeSelector component renders language selector and target routes", () => {
  const fileContent = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/ModeSelector.jsx"),
    "utf8"
  );

  assert.match(fileContent, /\/ru\//);
  assert.match(fileContent, /\/es\//);
  assert.match(fileContent, /\/en\//);

  assert.match(fileContent, /Ваш родной язык/);
  assert.match(fileContent, /Аргентинское произношение/);
  assert.match(fileContent, /Не знаю алфавит/);
});

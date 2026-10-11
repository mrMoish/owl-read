import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("ModeSelector component renders all three mode paths", () => {
  const fileContent = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/ModeSelector.jsx"),
    "utf8"
  );

  assert.match(fileContent, /path:\s*["']\/ru\/["']/);
  assert.match(fileContent, /path:\s*["']\/es\/["']/);
  assert.match(fileContent, /path:\s*["']\/en\/["']/);

  assert.match(fileContent, /es\s*→\s*ru/);
  assert.match(fileContent, /ru\s*→\s*es/);
  assert.match(fileContent, /en\s*→\s*ru/);
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("ModeSelector component renders S1, S2, S3, S4 mode links", () => {
  const fileContent = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/ModeSelector.jsx"),
    "utf8"
  );

  const modesContent = fs.readFileSync(
    path.resolve(process.cwd(), "src/lib/modes.js"),
    "utf8"
  );

  assert.match(modesContent, /\/s1\//);
  assert.match(modesContent, /\/s2\//);
  assert.match(modesContent, /\/s3\//);
  assert.match(modesContent, /\/s4\//);
  assert.match(fileContent, /MODES\.s1/);
});

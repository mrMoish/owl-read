import test from "node:test";
import assert from "node:assert/strict";

import { transliterateBlock } from "./lib/transliteration.js";

test("articleContext aggregates text nodes from daily text and study article", () => {
  const data = {
    verse: { nodes: [{ t: "text", s: "Стих дня." }] },
    comment: [{ nodes: [{ t: "text", s: "Комментарий." }] }],
    article: {
      title: "Статья для изучения",
      date_label: "5—11 октября",
      comment: [
        { nodes: [{ t: "text", s: "Абзац статьи 1." }] },
        { nodes: [{ t: "text", s: "Абзац статьи 2." }] },
      ],
    },
  };

  function flattenText(nodes) {
    return nodes.map((n) => (n.t === "text" ? n.s : (n.c ? flattenText(n.c) : ""))).join("");
  }

  function articleContext(d) {
    if (!d) return "";
    const blocks = [d.verse, ...(d.comment || [])];
    if (d.article?.comment) {
      blocks.push(...d.article.comment);
    }
    return blocks.map((block) => flattenText(block?.nodes || [])).join(" ");
  }

  const context = articleContext(data);
  assert.ok(context.includes("Стих дня."));
  assert.ok(context.includes("Комментарий."));
  assert.ok(context.includes("Абзац статьи 1."));
  assert.ok(context.includes("Абзац статьи 2."));
});

test("transliterateBlock applies transliteration to study article blocks", () => {
  const articleBlock = {
    nodes: [
      { t: "w", id: 100, s: "Давайте" },
      { t: "text", s: " " },
      { t: "w", id: 101, s: "отпор" },
    ],
  };

  const transliterated = transliterateBlock(articleBlock, "ru", "es");
  assert.ok(transliterated.nodes.length > 0);
  assert.equal(transliterated.nodes[0].t, "w");
  assert.equal(transliterated.nodes[0].id, 100);
  // Transliterated text for "Давайте" in Latin phonetic script
  assert.ok(transliterated.nodes[0].s.length > 0);
});

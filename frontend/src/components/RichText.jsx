import React, { useLayoutEffect, useRef } from "react";
import { reorderNodes } from "../lib/swap.js";

function Node({ node, index, translations, onWordClick, meta, registerRef }) {
  if (!node) return null;
  if (node.t === "text") return node.s;
  if (node.t === "w") {
    const id = String(node.id);
    const word = node.s;
    const info = meta[id] || {};
    const translated = translations[id];
    const content = translated || word;
    return (
      <span
        key={id}
        ref={(el) => registerRef && registerRef(id, el)}
        className={`word ${translated ? "word--translated" : ""}`}
        onClick={() => onWordClick({
          id: node.id,
          word,
          lemma: info.lemma || word,
          sentence: info.sent || "",
          context: "",
        })}
        role="button"
        tabIndex="0"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onWordClick({
              id: node.id,
              word,
              lemma: info.lemma || word,
              sentence: info.sent || "",
              context: "",
            });
          }
        }}
        aria-label={translated ? `Вернуть слово ${word}` : `Перевести слово ${word}`}
      >
        {content}
      </span>
    );
  }

  const children = Array.isArray(node.c) ? node.c.map((child, idx) => (
    <Node
      key={`${node.t}-${idx}`}
      node={child}
      index={idx}
      translations={translations}
      onWordClick={onWordClick}
      meta={meta}
      registerRef={registerRef}
    />
  )) : null;

  if (node.t === "em") return <em>{children}</em>;
  if (node.t === "strong") return <strong>{children}</strong>;
  if (node.t === "a") return <a href={node.href} target="_blank" rel="noopener noreferrer">{children}</a>;
  return <>{children}</>;
}

export default function RichText({ nodes = [], translations = {}, onWordClick = () => {}, meta = {} }) {
  const wordRefs = useRef({});
  const prevRects = useRef({});

  const registerRef = (id, el) => {
    if (el) {
      wordRefs.current[id] = el;
    } else {
      delete wordRefs.current[id];
    }
  };

  const reordered = reorderNodes(nodes, translations, meta);

  useLayoutEffect(() => {
    const currentRects = {};
    for (const [id, el] of Object.entries(wordRefs.current)) {
      if (el) {
        currentRects[id] = el.getBoundingClientRect();
      }
    }

    // FLIP Animation
    for (const [id, el] of Object.entries(wordRefs.current)) {
      if (!el) continue;
      const prev = prevRects.current[id];
      const current = currentRects[id];

      if (prev && current) {
        const deltaX = prev.left - current.left;
        const deltaY = prev.top - current.top;

        if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) {
          // Invert
          el.style.transition = "none";
          el.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
          el.classList.add("word--swapping");

          // Play
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              el.style.transition = "transform 0.4s cubic-bezier(0.2, 0, 0.2, 1)";
              el.style.transform = "";
              setTimeout(() => {
                el.classList.remove("word--swapping");
                el.style.transition = "";
              }, 400);
            });
          });
        }
      }
    }

    prevRects.current = currentRects;
  });

  return reordered.map((node, index) => (
    <Node
      key={node.t === "w" ? String(node.id) : `${index}-${node.t}`}
      node={node}
      index={index}
      translations={translations}
      onWordClick={onWordClick}
      meta={meta}
      registerRef={registerRef}
    />
  ));
}

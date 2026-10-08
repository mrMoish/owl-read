import React from "react";

function flattenText(nodes = []) {
  return nodes.map((n) => {
    if (n.t === "text") return n.s;
    if (n.c) return flattenText(n.c);
    return "";
  }).join("");
}

function Node({ node, index, translations, onWordClick, meta }) {
  if (node.t === "text") return node.s;
  if (node.t === "w") {
    const id = String(node.id);
    const word = node.s;
    const info = meta[id] || {};
    const translated = translations[id];
    const content = translated || word;
    return (
      <button
        key={index}
        type="button"
        className={translated ? "word word--translated" : "word"}
        onClick={() => onWordClick({
          id: node.id,
          word,
          lemma: info.lemma || word,
          sentence: info.sent || "",
          context: "",
        })}
        aria-label={translated ? `Вернуть слово ${word}` : `Перевести слово ${word}`}
      >
        {content}
      </button>
    );
  }

  const children = Array.isArray(node.c) ? node.c.map((child, idx) => (
    <Node key={`${node.t}-${idx}`} node={child} index={idx} translations={translations} onWordClick={onWordClick} meta={meta} />
  )) : null;

  if (node.t === "em") return <em>{children}</em>;
  if (node.t === "strong") return <strong>{children}</strong>;
  if (node.t === "a") return <a href={node.href} target="_blank" rel="noopener noreferrer">{children}</a>;
  return <>{children}</>;
}

export default function RichText({ nodes = [], translations = {}, onWordClick = () => {}, meta = {} }) {
  return nodes.map((node, index) => (
    <Node key={`${index}-${node.t}`} node={node} index={index} translations={translations} onWordClick={onWordClick} meta={meta} />
  ));
}

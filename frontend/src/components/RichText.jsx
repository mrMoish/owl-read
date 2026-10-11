import React from "react";
import { formatTextNode } from "../lib/punct.js";

function Node({ node, index, translations, onWordClick, meta, lang }) {
  if (!node) return null;
  if (node.t === "text") return formatTextNode(node.s);
  if (node.t === "w") {
    const id = String(node.id);
    const word = node.s;
    const info = meta[id] || {};
    const translated = translations[id];
    const content = translated || word;
    const wordLang = translated ? lang : "ru";
    return (
      <span
        key={id}
        lang={wordLang}
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
      lang={lang}
    />
  )) : null;

  if (node.t === "em") return <em>{children}</em>;
  if (node.t === "strong") return <strong>{children}</strong>;
  if (node.t === "a") return <a href={node.href} target="_blank" rel="noopener noreferrer">{children}</a>;
  return <>{children}</>;
}

export default function RichText({ nodes = [], translations = {}, onWordClick = () => {}, meta = {}, lang = "es" }) {
  return nodes.map((node, index) => (
    <Node
      key={node.t === "w" ? String(node.id) : `${index}-${node.t}`}
      node={node}
      index={index}
      translations={translations}
      onWordClick={onWordClick}
      meta={meta}
      lang={lang}
    />
  ));
}

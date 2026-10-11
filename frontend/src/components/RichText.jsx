import React, { useRef } from "react";
import { formatTextNode } from "../lib/punct.js";

function WordSpan({ id, word, info, translated, content, wordLang, lang, sourceLang, targetLang, onWordClick, onWordLongPress }) {
  const timerRef = useRef(null);
  const startPosRef = useRef({ x: 0, y: 0 });
  const isLongPressRef = useRef(false);

  const activeLang = sourceLang || (lang === "ru" ? "es" : lang);

  const startPress = (clientX, clientY, targetElem) => {
    isLongPressRef.current = false;
    startPosRef.current = { x: clientX, y: clientY };
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      if (onWordLongPress) {
        const rect = targetElem ? targetElem.getBoundingClientRect() : null;
        onWordLongPress({
          id,
          word,
          lemma: info.lemma || word,
          sentence: info.sent || "",
          lang: activeLang,
          rect,
        });
      }
    }, 500);
  };

  const cancelPress = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handlePointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    startPress(e.clientX, e.clientY, e.currentTarget);
  };

  const handlePointerMove = (e) => {
    if (!timerRef.current) return;
    const dx = Math.abs(e.clientX - startPosRef.current.x);
    const dy = Math.abs(e.clientY - startPosRef.current.y);
    if (dx > 10 || dy > 10) {
      cancelPress();
    }
  };

  const handlePointerUp = () => {
    cancelPress();
  };

  const handleClick = (e) => {
    if (isLongPressRef.current) {
      e.preventDefault();
      e.stopPropagation();
      isLongPressRef.current = false;
      return;
    }
    onWordClick({
      id,
      word,
      lemma: info.lemma || word,
      sentence: info.sent || "",
      context: "",
    });
  };

  const handleContextMenu = (e) => {
    if (isLongPressRef.current) {
      e.preventDefault();
    }
  };

  return (
    <span
      lang={wordLang}
      className={`word ${translated ? "word--translated" : ""}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      role="button"
      tabIndex="0"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onWordClick({
            id,
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

function Node({ node, index, translations, onWordClick, onWordLongPress, meta, lang, sourceLang, targetLang }) {
  if (!node) return null;
  if (node.t === "text") return formatTextNode(node.s);
  if (node.t === "w") {
    const id = String(node.id);
    const word = node.s;
    const info = meta[id] || {};
    const translated = translations[id];
    const content = translated || word;
    const effSourceLang = sourceLang || (lang === "ru" ? "es" : lang);
    const effTargetLang = targetLang || (effSourceLang === "es" ? "ru" : (effSourceLang === "en" ? "ru" : "es"));
    const wordLang = translated ? effTargetLang : effSourceLang;
    return (
      <WordSpan
        key={id}
        id={node.id}
        word={word}
        info={info}
        translated={translated}
        content={content}
        wordLang={wordLang}
        lang={lang}
        sourceLang={effSourceLang}
        targetLang={effTargetLang}
        onWordClick={onWordClick}
        onWordLongPress={onWordLongPress}
      />
    );
  }

  const children = Array.isArray(node.c) ? node.c.map((child, idx) => (
    <Node
      key={`${node.t}-${idx}`}
      node={child}
      index={idx}
      translations={translations}
      onWordClick={onWordClick}
      onWordLongPress={onWordLongPress}
      meta={meta}
      lang={lang}
      sourceLang={sourceLang}
      targetLang={targetLang}
    />
  )) : null;

  if (node.t === "em") return <em>{children}</em>;
  if (node.t === "strong") return <strong>{children}</strong>;
  if (node.t === "a") return <a href={node.href} target="_blank" rel="noopener noreferrer">{children}</a>;
  return <>{children}</>;
}

export default function RichText({
  nodes = [],
  translations = {},
  onWordClick = () => {},
  onWordLongPress = () => {},
  meta = {},
  lang = "es",
  sourceLang,
  targetLang,
}) {
  return nodes.map((node, index) => (
    <Node
      key={node.t === "w" ? String(node.id) : `${index}-${node.t}`}
      node={node}
      index={index}
      translations={translations}
      onWordClick={onWordClick}
      onWordLongPress={onWordLongPress}
      meta={meta}
      lang={lang}
      sourceLang={sourceLang}
      targetLang={targetLang}
    />
  ));
}

import React, { useEffect, useRef } from "react";
import RichText from "./RichText.jsx";
import { getParagraphLang } from "../lib/lang.js";

function CommentParagraph({
  index,
  block,
  translations,
  loadingTokens,
  onWordClick,
  onWordLongPress,
  meta,
  lang,
  sourceLang,
  targetLang,
  onBlockCompleted,
}) {
  const pRef = useRef(null);
  const clicksRef = useRef(0);
  const completedRef = useRef(false);

  useEffect(() => {
    clicksRef.current = 0;
    completedRef.current = false;
  }, [block]);

  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    const elem = pRef.current;
    if (!elem) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting && entry.boundingClientRect.top < 0 && !completedRef.current) {
            completedRef.current = true;
            if (onBlockCompleted) {
              onBlockCompleted(index, clicksRef.current);
            }
          }
        });
      },
      { threshold: 0.1 }
    );

    observer.observe(elem);
    return () => observer.disconnect();
  }, [index, onBlockCompleted]);

  const handleWordClickWrapper = (args) => {
    clicksRef.current += 1;
    onWordClick(args);
  };

  const pLang = getParagraphLang(block?.nodes || [], translations, targetLang, sourceLang);

  return (
    <p ref={pRef} lang={pLang} data-block-index={index}>
      <RichText
        nodes={block?.nodes || []}
        translations={translations}
        loadingTokens={loadingTokens}
        onWordClick={handleWordClickWrapper}
        onWordLongPress={onWordLongPress}
        meta={meta}
        lang={lang}
        sourceLang={sourceLang}
        targetLang={targetLang}
      />
    </p>
  );
}

export default function Comment({
  blocks = [],
  translations = {},
  loadingTokens = {},
  onWordClick = () => {},
  onWordLongPress = () => {},
  meta = {},
  lang = "es",
  sourceLang,
  targetLang,
  onBlockCompleted,
}) {
  const effSourceLang = sourceLang || (lang === "ru" ? "es" : lang);
  const effTargetLang = targetLang || (effSourceLang === "es" ? "ru" : (effSourceLang === "en" ? "ru" : "es"));

  return (
    <div className="comment">
      {blocks.map((b, i) => (
        <CommentParagraph
          key={i}
          index={i}
          block={b}
          translations={translations}
          loadingTokens={loadingTokens}
          onWordClick={onWordClick}
          onWordLongPress={onWordLongPress}
          meta={meta}
          lang={lang}
          sourceLang={effSourceLang}
          targetLang={effTargetLang}
          onBlockCompleted={onBlockCompleted}
        />
      ))}
    </div>
  );
}

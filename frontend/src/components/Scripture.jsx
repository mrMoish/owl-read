import React from "react";
import RichText from "./RichText.jsx";
import { getParagraphLang } from "../lib/lang.js";

export default function Scripture({ block, translations = {}, loadingTokens = {}, onWordClick = () => {}, onWordLongPress = () => {}, meta = {}, lang = "es", sourceLang, targetLang }) {
  const effSourceLang = sourceLang || (lang === "ru" ? "es" : lang);
  const effTargetLang = targetLang || (effSourceLang === "es" ? "ru" : (effSourceLang === "en" ? "ru" : "es"));
  const pLang = getParagraphLang(block?.nodes || [], translations, effTargetLang, effSourceLang);
  return (
    <blockquote className="verse">
      <p lang={pLang}>
        <RichText nodes={block?.nodes || []} translations={translations} loadingTokens={loadingTokens} onWordClick={onWordClick} onWordLongPress={onWordLongPress} meta={meta} lang={lang} sourceLang={effSourceLang} targetLang={effTargetLang} />
      </p>
    </blockquote>
  );
}

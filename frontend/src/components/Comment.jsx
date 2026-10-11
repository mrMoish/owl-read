import React from "react";
import RichText from "./RichText.jsx";
import { getParagraphLang } from "../lib/lang.js";

export default function Comment({ blocks = [], translations = {}, onWordClick = () => {}, onWordLongPress = () => {}, meta = {}, lang = "es", sourceLang, targetLang }) {
  const effSourceLang = sourceLang || (lang === "ru" ? "es" : lang);
  const effTargetLang = targetLang || (effSourceLang === "es" ? "ru" : (effSourceLang === "en" ? "ru" : "es"));
  return (
    <div className="comment">
      {blocks.map((b, i) => {
        const pLang = getParagraphLang(b?.nodes || [], translations, effTargetLang, effSourceLang);
        return (
          <p key={i} lang={pLang}>
            <RichText nodes={b?.nodes || []} translations={translations} onWordClick={onWordClick} onWordLongPress={onWordLongPress} meta={meta} lang={lang} sourceLang={effSourceLang} targetLang={effTargetLang} />
          </p>
        );
      })}
    </div>
  );
}

import React from "react";
import RichText from "./RichText.jsx";
import { getParagraphLang } from "../lib/lang.js";

export default function Scripture({ block, translations = {}, onWordClick = () => {}, onWordLongPress = () => {}, meta = {}, lang = "es" }) {
  const pLang = getParagraphLang(block?.nodes || [], translations, lang);
  return (
    <blockquote className="verse">
      <p lang={pLang}>
        <RichText nodes={block?.nodes || []} translations={translations} onWordClick={onWordClick} onWordLongPress={onWordLongPress} meta={meta} lang={lang} />
      </p>
    </blockquote>
  );
}

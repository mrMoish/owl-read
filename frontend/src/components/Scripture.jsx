import React from "react";
import RichText from "./RichText.jsx";
import { getParagraphLang } from "../lib/lang.js";

export default function Scripture({ block, translations = {}, onWordClick = () => {}, meta = {}, lang = "es", sourceLang = "ru" }) {
  const pLang = getParagraphLang(block?.nodes || [], translations, lang, sourceLang);
  return (
    <blockquote className="verse">
      <p lang={pLang}>
        <RichText nodes={block?.nodes || []} translations={translations} onWordClick={onWordClick} meta={meta} lang={lang} sourceLang={sourceLang} />
      </p>
    </blockquote>
  );
}

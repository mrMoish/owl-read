import React from "react";
import RichText from "./RichText.jsx";
import { getParagraphLang } from "../lib/lang.js";

export default function Comment({ blocks = [], translations = {}, onWordClick = () => {}, meta = {}, lang = "es", sourceLang = "ru" }) {
  return (
    <div className="comment">
      {blocks.map((b, i) => {
        const pLang = getParagraphLang(b?.nodes || [], translations, lang, sourceLang);
        return (
          <p key={i} lang={pLang}>
            <RichText nodes={b?.nodes || []} translations={translations} onWordClick={onWordClick} meta={meta} lang={lang} sourceLang={sourceLang} />
          </p>
        );
      })}
    </div>
  );
}

import React from "react";
import RichText from "./RichText.jsx";

export default function Scripture({ block, translations = {}, onWordClick = () => {}, meta = {}, lang = "es" }) {
  return (
    <blockquote className="verse">
      <p>
        <RichText nodes={block.nodes} translations={translations} onWordClick={onWordClick} meta={meta} lang={lang} />
      </p>
    </blockquote>
  );
}

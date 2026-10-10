import React from "react";
import RichText from "./RichText.jsx";

export default function Comment({ blocks, translations = {}, onWordClick = () => {}, meta = {}, lang = "es" }) {
  return (
    <div className="comment">
      {blocks.map((b, i) => (
        <p key={i}>
          <RichText nodes={b.nodes} translations={translations} onWordClick={onWordClick} meta={meta} lang={lang} />
        </p>
      ))}
    </div>
  );
}

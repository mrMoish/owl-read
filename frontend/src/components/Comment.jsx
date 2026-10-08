import React from "react";
import RichText from "./RichText.jsx";

export default function Comment({ blocks, translations = {}, onWordClick = () => {}, meta = {}, alignOf = null, activeUnits }) {
  return (
    <div className="comment">
      {blocks.map((b, i) => (
        <p key={i}>
          <RichText nodes={b.nodes} translations={translations} onWordClick={onWordClick} meta={meta} alignOf={alignOf} activeUnits={activeUnits} />
        </p>
      ))}
    </div>
  );
}

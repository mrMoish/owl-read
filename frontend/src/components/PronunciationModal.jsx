import React, { useEffect } from "react";
import { getPronunciation, speakWord } from "../lib/pronunciation.js";

export default function PronunciationModal({ data, onClose }) {
  if (!data || !data.word) return null;

  const { word, lang = "es" } = data;
  const { ipa, ruHint } = getPronunciation(word, lang);

  // Auto-play pronunciation once when modal opens
  useEffect(() => {
    speakWord(word, lang);
  }, [word, lang]);

  // Handle ESC key press to close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handlePlay = (e) => {
    e.stopPropagation();
    speakWord(word, lang);
  };

  return (
    <div className="pronunciation-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="pronunciation-modal" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="pronunciation-play-btn"
          onClick={handlePlay}
          aria-label="Воспроизвести произношение"
          title="Воспроизвести"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="6,4 20,12 6,20" />
          </svg>
        </button>

        <div className="pronunciation-info">
          <div className="pronunciation-word-line">
            <span className="pronunciation-word">{word}</span>
            {ipa && <span className="pronunciation-ipa">{ipa}</span>}
          </div>
          {ruHint && <div className="pronunciation-ru-hint">{ruHint}</div>}
        </div>

        <button
          type="button"
          className="pronunciation-close-btn"
          onClick={onClose}
          aria-label="Закрыть"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

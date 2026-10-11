import React, { useEffect, useState } from "react";
import { fetchAiPronunciation, getPronunciation, speakWord } from "../lib/pronunciation.js";

export default function PronunciationModal({ data, onClose }) {
  const word = data?.word || "";
  const sentence = data?.sentence || "";
  const lang = data?.lang || "es";

  const [pronData, setPronData] = useState(() => getPronunciation(word, lang));

  useEffect(() => {
    if (!word) return;
    setPronData(getPronunciation(word, lang));
  }, [word, lang]);

  // Fetch AI pronunciation on mount and update state
  useEffect(() => {
    let cancelled = false;
    fetchAiPronunciation({ word, sentence, lang }).then((res) => {
      if (!cancelled && res) {
        setPronData(res);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [word, sentence, lang]);

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

  if (!data || !data.word) return null;

  const { ipa, ruHint } = pronData;

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
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="6,4 20,12 6,20" />
          </svg>
        </button>

        <div className="pronunciation-info">
          <div className="pronunciation-line-word">{word}</div>
          <div className="pronunciation-line-ipa">{ipa}</div>
          <div className="pronunciation-line-hint">{ruHint}</div>
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

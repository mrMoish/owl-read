import React, { useEffect, useState } from "react";
import { fetchAiPronunciation, getPronunciation, speakWord } from "../lib/pronunciation.js";

export default function PronunciationModal({ data, onClose }) {
  const word = data?.word || "";
  const sentence = data?.sentence || "";
  const lang = data?.lang || "es";

  const [pronData, setPronData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [audioLoading, setAudioLoading] = useState(false);

  // Fetch AI pronunciation on mount and update state
  useEffect(() => {
    if (!word) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchAiPronunciation({ word, sentence, lang })
      .then((res) => {
        if (!cancelled) {
          setPronData(res || getPronunciation(word, lang));
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPronData(getPronunciation(word, lang));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [word, sentence, lang]);

  const playAudio = async () => {
    if (!word || audioLoading) return;
    setAudioLoading(true);
    try {
      await speakWord(word, lang, sentence);
    } finally {
      setAudioLoading(false);
    }
  };

  // Auto-play pronunciation once when modal opens
  useEffect(() => {
    playAudio();
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
    playAudio();
  };

  if (!data || !data.word) return null;

  const { ipa = "", ruHint = "" } = pronData || {};

  return (
    <div className="pronunciation-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="pronunciation-modal" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="pronunciation-play-btn"
          onClick={handlePlay}
          disabled={audioLoading}
          aria-label={lang === "es" ? "Reproducir pronunciación" : (lang === "en" ? "Play pronunciation" : "Воспроизвести произношение")}
          title={lang === "es" ? "Reproducir" : (lang === "en" ? "Play" : "Воспроизвести")}
        >
          {audioLoading ? (
            <span className="pronunciation-play-spinner" />
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="6,4 20,12 6,20" />
            </svg>
          )}
        </button>

        <div className="pronunciation-info">
          {loading ? (
            <div className="pronunciation-loading" aria-label={lang === "es" ? "Cargando pronunciación" : (lang === "en" ? "Loading pronunciation" : "Загрузка произношения")}>
              <span className="pronunciation-spinner" />
            </div>
          ) : (
            <>
              <div className="pronunciation-line-word">{word}</div>
              <div className="pronunciation-line-ipa">{ipa}</div>
              <div className="pronunciation-line-hint">{ruHint}</div>
            </>
          )}
        </div>

        <button
          type="button"
          className="pronunciation-close-btn"
          onClick={onClose}
          aria-label={lang === "es" ? "Cerrar" : (lang === "en" ? "Close" : "Закрыть")}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

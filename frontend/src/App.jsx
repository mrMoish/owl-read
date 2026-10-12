import React, { useEffect, useMemo, useState } from "react";
import { translateWord } from "./api.js";
import {
  loadLearnedWords,
  addLearnedWord,
  removeLearnedWord,
} from "./lib/storage.js";
import {
  normalizeLemma,
  applyLearnedTranslations,
} from "./lib/learned.js";
import Scripture from "./components/Scripture.jsx";
import Comment from "./components/Comment.jsx";
import PronunciationModal from "./components/PronunciationModal.jsx";
import ModeSelector from "./components/ModeSelector.jsx";
import { useDaily } from "./useDaily.js";
import { transliterateBlock, transliterateRussianToLatin } from "./lib/transliteration.js";

const BUILD_ID = "2026.10.10.v10";

function flattenText(nodes) {
  return nodes.map((n) => {
    if (n.t === "text") return n.s;
    if (n.c) return flattenText(n.c);
    return "";
  }).join("");
}

function articleContext(data) {
  if (!data) return "";
  const blocks = [data.verse, ...(data.comment || [])];
  return blocks.map((block) => flattenText(block.nodes || [])).join(" ");
}

export default function App() {
  const { data, loading, error, notice, reload, mode } = useDaily();
  const [learnedWords, setLearnedWords] = useState(() => loadLearnedWords());
  const [pronunciationWordData, setPronunciationWordData] = useState(null);

  const [isDebug, setIsDebug] = useState(false);
  const [swControlled, setSwControlled] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      setIsDebug(params.has("debug"));
      setSwControlled(Boolean(navigator.serviceWorker?.controller));
    }
  }, []);

  const visibleTranslations = useMemo(() => {
    const raw = applyLearnedTranslations({
      meta: data?.meta,
      preparedTranslations: data?.translations,
      learnedWords,
    });
    if (mode.id === "es-ru-translit" && raw) {
      const transliterated = {};
      for (const [k, val] of Object.entries(raw)) {
        if (typeof val === "string") {
          transliterated[k] = transliterateRussianToLatin(val);
        } else {
          transliterated[k] = val;
        }
      }
      return transliterated;
    }
    return raw;
  }, [data?.meta, data?.translations, learnedWords, mode.id]);

  const sourceLang = mode.source;
  const targetLang = mode.target;

  const displayVerse = useMemo(() => {
    if (!data?.verse) return null;
    if (mode.transliterate && mode.source === "ru") {
      return transliterateBlock(data.verse, sourceLang, targetLang);
    }
    return data.verse;
  }, [data?.verse, mode.transliterate, sourceLang, targetLang]);

  const displayComment = useMemo(() => {
    if (!data?.comment) return [];
    if (mode.transliterate && mode.source === "ru") {
      return data.comment.map((b) => transliterateBlock(b, sourceLang, targetLang));
    }
    return data.comment;
  }, [data?.comment, mode.transliterate, sourceLang, targetLang]);

  const handleWordClick = async ({ id, word, sentence, context, lemma }) => {
    if (!data?.date || !sentence) {
      return;
    }
    const key = String(id);
    const normLemma = normalizeLemma(lemma || word);
    const isCurrentlyTranslated = Boolean(visibleTranslations[key]);

    if (isCurrentlyTranslated) {
      const nextLearned = removeLearnedWord(normLemma);
      setLearnedWords(nextLearned || {});
      return;
    }

    let translated = data?.translations?.[key];
    if (!translated || translated === word) {
      try {
        const payload = {
          word,
          lemma: lemma || word,
          sentence,
          context: context || articleContext(data),
          date: data.date,
          lang: sourceLang,
        };
        const res = await translateWord(payload);
        translated = res?.translation || res?.original || word;
      } catch {
        // Fallback
      }
    }

    if (!translated || translated === word) {
      return;
    }

    const nextLearned = addLearnedWord(normLemma, translated);
    setLearnedWords(nextLearned || {});
  };

  const handleWordLongPress = ({ word, sentence, lang, rect }) => {
    setPronunciationWordData({
      word,
      sentence,
      lang: lang || sourceLang,
      rect,
    });
  };

  const isRootPath = typeof window !== "undefined" && (window.location.pathname === "/" || window.location.pathname === "");

  if (isRootPath) {
    return <ModeSelector />;
  }

  return (
    <>
      <main className="page">
        {/* TEMPORARY FEATURE: Navigation button on /ru-es/ to switch to /ru-es-translit/. Intended for future removal. */}
        {mode.id === "ru-es" && (
          <div className="temp-nav-banner" style={{ marginBottom: "16px", textAlign: "center" }}>
            <a
              href="/ru-es-translit/"
              className="temp-nav-btn"
              style={{
                display: "inline-block",
                padding: "8px 16px",
                backgroundColor: "#0F6B63",
                color: "#FFFFFF",
                borderRadius: "20px",
                textDecoration: "none",
                fontWeight: "500",
                fontSize: "14px",
              }}
            >
              Leer más rápido
            </a>
          </div>
        )}

        {isDebug && (
          <section className="debug-panel" style={{ background: "#111", color: "#0f0", padding: "12px", borderRadius: "8px", fontSize: "12px", fontFamily: "monospace", marginBottom: "16px", wordBreak: "break-all" }}>
            <h3>[Diagnostic Panel]</h3>
            <div><strong>Build ID:</strong> {BUILD_ID}</div>
            <div><strong>SW Controlled:</strong> {swControlled ? "Yes (active)" : "No"}</div>
            <div><strong>Active Mode ID:</strong> {mode.id} ({mode.pair})</div>
            <div><strong>Source Lang:</strong> {sourceLang}</div>
            <div><strong>Target Lang:</strong> {targetLang}</div>
            <div><strong>Transliteration:</strong> {mode.transliterate ? "On" : "Off"}</div>
          </section>
        )}
        {notice && <p className="notice" role="status">{notice}</p>}
        {data ? (
          <article>
            <h1>{data.date_label}</h1>
            {displayVerse && (
              <Scripture
                block={displayVerse}
                translations={visibleTranslations}
                onWordClick={handleWordClick}
                onWordLongPress={handleWordLongPress}
                meta={data.meta || {}}
                sourceLang={sourceLang}
                targetLang={targetLang}
                lang={targetLang}
              />
            )}
            <Comment
              blocks={displayComment}
              translations={visibleTranslations}
              onWordClick={handleWordClick}
              onWordLongPress={handleWordLongPress}
              meta={data.meta || {}}
              sourceLang={sourceLang}
              targetLang={targetLang}
              lang={targetLang}
            />
            {data.title && <p className="source">{data.title}</p>}
          </article>
        ) : loading ? (
          <p className="notice" role="status">
            {targetLang === "es" ? "Cargando el texto del día…" : (sourceLang === "en" ? "Loading daily text…" : "Загружаю материал дня…")}
          </p>
        ) : (
          <div className="notice">
            <p>{error}</p>
            <button onClick={reload}>
              {targetLang === "es" ? "Reintentar" : (sourceLang === "en" ? "Retry" : "Повторить")}
            </button>
          </div>
        )}
      </main>

      {pronunciationWordData && (
        <PronunciationModal
          data={pronunciationWordData}
          onClose={() => setPronunciationWordData(null)}
        />
      )}
    </>
  );
}

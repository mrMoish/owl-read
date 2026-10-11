import React, { useEffect, useMemo, useState } from "react";
import { translateWord } from "./api.js";
import {
  loadLearnedWords,
  addLearnedWord,
  removeLearnedWord,
  loadUserSettings,
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
import { transliterateBlock } from "./lib/transliteration.js";

const BUILD_ID = "2026.10.10.v6";

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
  const { data, loading, error, notice, reload, isEn, langMode, langSource } = useDaily();
  const [learnedWords, setLearnedWords] = useState(() => loadLearnedWords());
  const [pronunciationWordData, setPronunciationWordData] = useState(null);

  const [isDebug, setIsDebug] = useState(false);
  const [swControlled, setSwControlled] = useState(false);
  const [userSettings, setUserSettings] = useState(() => loadUserSettings());

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      setIsDebug(params.has("debug"));
      setSwControlled(Boolean(navigator.serviceWorker?.controller));
    }
  }, []);

  // Вычисляем видимые переводы: глобально запомненные слова и словоформы
  const visibleTranslations = useMemo(() => {
    return applyLearnedTranslations({
      meta: data?.meta,
      preparedTranslations: data?.translations,
      learnedWords,
    });
  }, [data?.meta, data?.translations, learnedWords]);

  const currentLang = langMode || (isEn ? "en" : "ru");
  const sourceLang = currentLang;
  const targetLang = currentLang === "en" ? "ru" : (currentLang === "es" ? "ru" : "es");

  // Транслитерация если включена опция noAlphabet
  const displayVerse = useMemo(() => {
    if (!data?.verse) return null;
    if (userSettings?.noAlphabet) {
      return transliterateBlock(data.verse, sourceLang, targetLang);
    }
    return data.verse;
  }, [data?.verse, userSettings?.noAlphabet, sourceLang, targetLang]);

  const displayComment = useMemo(() => {
    if (!data?.comment) return [];
    if (userSettings?.noAlphabet) {
      return data.comment.map((b) => transliterateBlock(b, sourceLang, targetLang));
    }
    return data.comment;
  }, [data?.comment, userSettings?.noAlphabet, sourceLang, targetLang]);

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
          lang: currentLang,
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
        {isDebug && (
          <section className="debug-panel" style={{ background: "#111", color: "#0f0", padding: "12px", borderRadius: "8px", fontSize: "12px", fontFamily: "monospace", marginBottom: "16px", wordBreak: "break-all" }}>
            <h3>[Diagnostic Panel]</h3>
            <div><strong>Build ID:</strong> {BUILD_ID}</div>
            <div><strong>SW Controlled:</strong> {swControlled ? "Yes (active)" : "No"}</div>
            <div><strong>Effective Lang:</strong> {currentLang}</div>
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
            {targetLang === "es" ? "Cargando el texto del día…" : (currentLang === "en" ? "Loading daily text…" : "Загружаю материал дня…")}
          </p>
        ) : (
          <div className="notice">
            <p>{error}</p>
            <button onClick={reload}>
              {targetLang === "es" ? "Reintentar" : (currentLang === "en" ? "Retry" : "Повторить")}
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

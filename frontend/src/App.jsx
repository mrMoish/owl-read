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
import { useDaily } from "./useDaily.js";

const BUILD_ID = "2026.10.10.v5";

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

  const isStandalone = typeof window !== "undefined" && (
    window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true
  );

  const rawStoredLang = typeof window !== "undefined" ? localStorage.getItem("reader.lang") : null;
  const lastApiUrl = data?.date ? `/api/daily?date=${data.date}${isEn ? "&en=1" : ""}` : "N/A";

  const handleWordClick = async ({ id, word, sentence, context, lemma }) => {
    if (!data?.date || !sentence) {
      return;
    }
    const key = String(id);
    const normLemma = normalizeLemma(lemma || word);
    const isCurrentlyTranslated = Boolean(visibleTranslations[key]);

    if (isCurrentlyTranslated) {
      // Пользователь нажал на переведённое слово -> сброс слова и его словоформ
      const nextLearned = removeLearnedWord(normLemma);
      setLearnedWords(nextLearned || {});
      return;
    }

    // 1. Получаем перевод для нажатого слова (подготовленный или fallback)
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
        // Ошибка перевода не ломает UX.
      }
    }

    if (!translated || translated === word) {
      return;
    }

    // 2. Сохраняем выбор пользователя в постоянном глобальном хранилище.
    // Применение к текущему и последующим текстам произойдет через applyLearnedTranslations.
    const nextLearned = addLearnedWord(normLemma, translated);
    setLearnedWords(nextLearned || {});
  };

  const handleWordLongPress = ({ word, lang, rect }) => {
    setPronunciationWordData({
      word,
      lang: lang || sourceLang,
      rect,
    });
  };

  return (
    <>
      <main className="page">
        {isDebug && (
          <section className="debug-panel" style={{ background: "#111", color: "#0f0", padding: "12px", borderRadius: "8px", fontSize: "12px", fontFamily: "monospace", marginBottom: "16px", wordBreak: "break-all" }}>
            <h3>[Diagnostic Panel]</h3>
            <div><strong>Build ID:</strong> {BUILD_ID}</div>
            <div><strong>SW Controlled:</strong> {swControlled ? "Yes (active)" : "No"}</div>
            <div><strong>location.href:</strong> {typeof window !== "undefined" ? window.location.href : ""}</div>
            <div><strong>Standalone mode:</strong> {isStandalone ? "True (PWA)" : "False (Browser)"}</div>
            <div><strong>Effective Lang:</strong> {currentLang}</div>
            <div><strong>Lang Source:</strong> {langSource}</div>
            <div><strong>Raw Stored reader.lang:</strong> {rawStoredLang || "null"}</div>
            <div><strong>Last /api/daily Request:</strong> {lastApiUrl}</div>
            <div><strong>Response Date / Label:</strong> {data ? `${data.date} (${data.date_label})` : "loading..."}</div>
          </section>
        )}
        {notice && <p className="notice" role="status">{notice}</p>}
        {data ? (
          <article>
            <h1>{data.date_label}</h1>
            <Scripture
              block={data.verse}
              translations={visibleTranslations}
              onWordClick={handleWordClick}
              onWordLongPress={handleWordLongPress}
              meta={data.meta || {}}
              sourceLang={sourceLang}
              targetLang={targetLang}
              lang={targetLang}
            />
            <Comment
              blocks={data.comment}
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
          <p className="notice" role="status">Загружаю материал дня…</p>
        ) : (
          <div className="notice"><p>{error}</p><button onClick={reload}>Повторить</button></div>
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

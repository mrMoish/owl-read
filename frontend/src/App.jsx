import React, { useEffect, useMemo, useState } from "react";
import { translateWord } from "./api.js";
import {
  loadLearnedWords,
  addLearnedWord,
  removeLearnedWord,
  loadDailyReadStatus,
  saveDailyReadStatus,
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
import { saveSelectedMode, loadSelectedMode } from "./lib/modes.js";

const BUILD_ID = "2026.10.10.v14";

function flattenText(nodes) {
  return nodes ? nodes.map((n) => {
    if (n.t === "text" || n.t === "w") return n.s;
    if (n.c) return flattenText(n.c);
    return "";
  }).join("") : "";
}

function articleContext(data) {
  if (!data) return "";
  const blocks = [
    data.verse,
    ...(data.comment || []),
    ...(data.article?.comment || [])
  ];
  return blocks.map((block) => flattenText(block?.nodes || [])).join(" ");
}

function countWordsInBlocks(verse, comment) {
  const text = [
    flattenText(verse?.nodes || []),
    ...(comment || []).map((b) => flattenText(b?.nodes || []))
  ].join(" ");
  const matches = text.match(/[\p{L}\p{N}]+/gu);
  return matches ? matches.length : 0;
}

export default function App() {
  const { data, loading, error, notice, reload, mode } = useDaily();
  const [learnedWords, setLearnedWords] = useState(() => loadLearnedWords());
  const [pronunciationWordData, setPronunciationWordData] = useState(null);
  const [loadingTokens, setLoadingTokens] = useState({});
  const [tokenTranslations, setTokenTranslations] = useState({});
  const [frontendCache, setFrontendCache] = useState({});

  const [isDebug, setIsDebug] = useState(false);
  const [swControlled, setSwControlled] = useState(false);

  // View state: 'daily' or 'article'
  const [activeTab, setActiveTab] = useState("daily");
  const [isRead, setIsRead] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const wordCount = useMemo(() => {
    if (!data) return 0;
    return countWordsInBlocks(data.verse, data.comment);
  }, [data]);

  // Target required reading time: ~180 wpm (e.g. 150 words = ~50s), minimum 10s
  const requiredSeconds = useMemo(() => {
    if (wordCount <= 0) return 10;
    const calculated = Math.round((wordCount / 180) * 60);
    return Math.max(10, Math.min(300, calculated));
  }, [wordCount]);

  // Sync read status and default active tab when date changes
  useEffect(() => {
    if (data?.date) {
      const readStatus = loadDailyReadStatus(data.date);
      setIsRead(readStatus);
      setElapsedSeconds(readStatus ? requiredSeconds : 0);
      if (readStatus && data.article) {
        setActiveTab("article");
      } else {
        setActiveTab("daily");
      }
    }
    setTokenTranslations({});
    setLoadingTokens({});
  }, [data?.date, mode.id, data?.article]);

  // Active reading timer when in 'daily' tab and not yet marked as read
  useEffect(() => {
    if (!data?.date || isRead || activeTab !== "daily") {
      return;
    }
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => {
        const next = prev + 1;
        if (next >= requiredSeconds) {
          setIsRead(true);
          saveDailyReadStatus(data.date, true);
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [data?.date, isRead, activeTab, requiredSeconds]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      setIsDebug(params.has("debug"));
      setSwControlled(Boolean(navigator.serviceWorker?.controller));
    }
  }, []);

  const visibleTranslations = useMemo(() => {
    const combinedPrepared = {
      ...(data?.translations || {}),
      ...tokenTranslations,
    };
    const raw = applyLearnedTranslations({
      meta: data?.meta,
      preparedTranslations: combinedPrepared,
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
  }, [data?.meta, data?.translations, tokenTranslations, learnedWords, mode.id]);

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

  const displayArticleComment = useMemo(() => {
    if (!data?.article?.comment) return [];
    if (mode.transliterate && mode.source === "ru") {
      return data.article.comment.map((b) => transliterateBlock(b, sourceLang, targetLang));
    }
    return data.article.comment;
  }, [data?.article?.comment, mode.transliterate, sourceLang, targetLang]);

  const handleWordClick = async ({ id, word, sentence, context, lemma }) => {
    if (!data?.date || !sentence) {
      return;
    }
    const key = String(id);
    if (loadingTokens[key]) {
      return;
    }

    const normLemma = normalizeLemma(lemma || word);
    const isCurrentlyTranslated = Boolean(visibleTranslations[key]);

    if (isCurrentlyTranslated) {
      const nextLearned = removeLearnedWord(normLemma);
      setLearnedWords(nextLearned || {});
      setTokenTranslations((prev) => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
      return;
    }

    const currentDate = data.date;
    const currentModeId = mode.id;
    const cacheKey = `${currentDate}:${currentModeId}:${key}`;

    let translated = frontendCache[cacheKey];

    if (!translated) {
      setLoadingTokens((prev) => ({ ...prev, [key]: true }));
      try {
        const payload = {
          word,
          lemma: lemma || word,
          sentence,
          context: context || articleContext(data),
          date: currentDate,
          lang: sourceLang,
        };
        const res = await translateWord(payload);
        translated = res?.translation || res?.original || word;
        if (translated && translated !== word) {
          setFrontendCache((prev) => ({ ...prev, [cacheKey]: translated }));
        }
      } catch {
        // Translation request failed
      } finally {
        setLoadingTokens((prev) => {
          const copy = { ...prev };
          delete copy[key];
          return copy;
        });
      }
    }

    if (!translated || translated === word) {
      return;
    }

    // Guard against stale response if user switched date or mode while request was pending
    if (data?.date !== currentDate || mode.id !== currentModeId) {
      return;
    }

    setTokenTranslations((prev) => ({
      ...prev,
      [key]: translated,
    }));

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

  useEffect(() => {
    if (isRootPath) {
      const savedMode = loadSelectedMode();
      if (savedMode && savedMode.path) {
        window.location.replace(savedMode.path);
      }
    }
  }, [isRootPath]);

  if (isRootPath) {
    const savedMode = loadSelectedMode();
    if (savedMode && savedMode.path) {
      return null;
    }
    return <ModeSelector />;
  }

  return (
    <>
      <main className="page">
        {/* TEMPORARY FEATURE: Navigation buttons on /ru-es/ to switch to /es-ru/ or /ru-es-translit/. Intended for future removal. */}
        {mode.id === "ru-es" && (
          <div className="temp-nav-banner" style={{ marginBottom: "16px", textAlign: "center", display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" }}>
            <a
              href="/es-ru/"
              target="_self"
              className="temp-nav-btn"
              onClick={(e) => {
                e.preventDefault();
                saveSelectedMode("es-ru");
                window.location.href = "/es-ru/";
              }}
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
              Leer en español
            </a>
            <a
              href="/ru-es-translit/"
              target="_self"
              className="temp-nav-btn"
              onClick={(e) => {
                e.preventDefault();
                saveSelectedMode("ru-es-translit");
                window.location.href = "/ru-es-translit/";
              }}
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

        {/* TEMPORARY FEATURE: Navigation button on /es-ru/ to switch to /ru-es/. Intended for future removal. */}
        {mode.id === "es-ru" && (
          <div className="temp-nav-banner" style={{ marginBottom: "16px", textAlign: "center" }}>
            <a
              href="/ru-es/"
              target="_self"
              className="temp-nav-btn"
              onClick={(e) => {
                e.preventDefault();
                saveSelectedMode("ru-es");
                window.location.href = "/ru-es/";
              }}
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
              Leer en ruso
            </a>
          </div>
        )}

        {/* TEMPORARY FEATURE: Navigation button on /es-ru-translit/ to switch to /ru-es/. Intended for future removal. */}
        {mode.id === "es-ru-translit" && (
          <div className="temp-nav-banner" style={{ marginBottom: "16px", textAlign: "center" }}>
            <a
              href="/ru-es/"
              target="_self"
              className="temp-nav-btn"
              onClick={(e) => {
                e.preventDefault();
                saveSelectedMode("ru-es");
                window.location.href = "/ru-es/";
              }}
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
              Leer en ruso
            </a>
          </div>
        )}

        {/* TEMPORARY FEATURE: Navigation button on /ru-es-translit/ to switch to /es-ru-translit/. Intended for future removal. */}
        {mode.id === "ru-es-translit" && (
          <div className="temp-nav-banner" style={{ marginBottom: "16px", textAlign: "center" }}>
            <a
              href="/es-ru-translit/"
              target="_self"
              className="temp-nav-btn"
              onClick={(e) => {
                e.preventDefault();
                saveSelectedMode("es-ru-translit");
                window.location.href = "/es-ru-translit/";
              }}
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
              Leer en español
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
            {/* Navigation and Transition Bar */}
            {data.article && (
              <div className="view-toggle-bar">
                {activeTab === "daily" ? (
                  isRead ? (
                    <button
                      type="button"
                      className="article-transition-btn unlocked"
                      onClick={() => setActiveTab("article")}
                    >
                      {targetLang === "es"
                        ? "Ir al artículo de estudio →"
                        : (sourceLang === "en" ? "Go to Study Article →" : "Перейти к статье для изучения →")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="article-transition-btn locked"
                      disabled
                    >
                      {targetLang === "es"
                        ? "Lea el comentario del día"
                        : (sourceLang === "en"
                          ? "Read daily comment"
                          : "Прочитайте комментарий")}
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    className="article-transition-btn back"
                    onClick={() => setActiveTab("daily")}
                  >
                    {targetLang === "es"
                      ? "← Volver al texto del día"
                      : (sourceLang === "en" ? "← Back to Daily Text" : "← Назад к тексту на день")}
                  </button>
                )}
              </div>
            )}

            {activeTab === "daily" ? (
              <>
                <h1>{data.date_label}</h1>
                {displayVerse && (
                  <Scripture
                    block={displayVerse}
                    translations={visibleTranslations}
                    loadingTokens={loadingTokens}
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
                  loadingTokens={loadingTokens}
                  onWordClick={handleWordClick}
                  onWordLongPress={handleWordLongPress}
                  meta={data.meta || {}}
                  sourceLang={sourceLang}
                  targetLang={targetLang}
                  lang={targetLang}
                />
              </>
            ) : (
              data.article && (
                <section className="study-article">
                  <header className="study-article-header">
                    <span className="study-article-badge">
                      {targetLang === "es" ? "Artículo de estudio" : (sourceLang === "en" ? "Study Article" : "Статья для изучения")}
                    </span>
                    <h2>{data.article.title}</h2>
                    {data.article.date_range_label && (
                      <p className="study-article-dates">{data.article.date_range_label}</p>
                    )}
                  </header>
                  <Comment
                    blocks={displayArticleComment}
                    translations={visibleTranslations}
                    loadingTokens={loadingTokens}
                    onWordClick={handleWordClick}
                    onWordLongPress={handleWordLongPress}
                    meta={data.meta || {}}
                    sourceLang={sourceLang}
                    targetLang={targetLang}
                    lang={targetLang}
                  />
                </section>
              )
            )}
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

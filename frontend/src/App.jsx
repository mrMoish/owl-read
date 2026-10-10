import React, { useEffect, useMemo, useState } from "react";
import { translateWord } from "./api.js";
import {
  loadTranslations,
  saveTranslations,
  loadLearnedWords,
  addLearnedWord,
  removeLearnedWord,
} from "./lib/storage.js";
import {
  normalizeLemma,
  findMatchingTokenIds,
  applyLearnedTranslations,
} from "./lib/learned.js";
import Scripture from "./components/Scripture.jsx";
import Comment from "./components/Comment.jsx";
import { useDaily } from "./useDaily.js";

const BUILD_ID = "2026.10.10.v6-path";

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
  const { data, loading, error, notice, reload, isEn } = useDaily();
  const [learnedWords, setLearnedWords] = useState(() => loadLearnedWords());
  const [manualTranslations, setManualTranslations] = useState({});

  const [isDebug, setIsDebug] = useState(false);
  const [swControlled, setSwControlled] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const checkHash = () => setIsDebug(window.location.hash === "#debug");
      checkHash();
      window.addEventListener("hashchange", checkHash);
      setSwControlled(Boolean(navigator.serviceWorker?.controller));
      return () => window.removeEventListener("hashchange", checkHash);
    }
  }, []);

  useEffect(() => {
    if (!data?.date) return;
    setManualTranslations(loadTranslations(data.date));
  }, [data?.date]);

  useEffect(() => {
    if (!data?.date) return;
    saveTranslations(data.date, manualTranslations);
  }, [data?.date, manualTranslations]);

  // Вычисляем видимые переводы: локальные замены + глобально запомненные слова и словоформы
  const visibleTranslations = useMemo(() => {
    return applyLearnedTranslations({
      meta: data?.meta,
      preparedTranslations: data?.translations,
      learnedWords,
      manualTranslations,
    });
  }, [data?.meta, data?.translations, learnedWords, manualTranslations]);

  const targetLang = isEn ? "en" : "es";

  const isStandalone = typeof window !== "undefined" && (
    window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true
  );

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

      const matchingIds = findMatchingTokenIds(data?.meta, normLemma);
      setManualTranslations((prev) => {
        const next = { ...prev };
        delete next[key];
        for (const mid of matchingIds) {
          delete next[mid];
        }
        return next;
      });
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
          lang: isEn ? "en" : "ru",
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

    // 2. Сохраняем выбор пользователя в постоянном глобальном хранилище
    const nextLearned = addLearnedWord(normLemma, translated);
    setLearnedWords(nextLearned || {});

    // 3. Заменяем все вхождения этого слова и его словоформ в текущем тексте
    const matchingIds = findMatchingTokenIds(data?.meta, normLemma);
    setManualTranslations((prev) => {
      const next = { ...prev, [key]: translated };
      for (const mid of matchingIds) {
        const contextEs = data?.translations?.[mid];
        next[mid] = (contextEs && contextEs !== data?.meta?.[mid]?.w) ? contextEs : translated;
      }
      return next;
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
            <div><strong>Effective Lang:</strong> {isEn ? "English (en)" : "Spanish (es/default)"}</div>
            <div><strong>Lang Source:</strong> URL path</div>
            <div><strong>Last /api/daily Request:</strong> {lastApiUrl}</div>
            <div><strong>Response Date / Label:</strong> {data ? `${data.date} (${data.date_label})` : "loading..."}</div>
          </section>
        )}
        {notice && <p className="notice" role="status">{notice}</p>}
        {data ? (
          <article>
            <h1>{data.date_label}</h1>
            <Scripture block={data.verse} translations={visibleTranslations} onWordClick={handleWordClick} meta={data.meta || {}} lang={targetLang} />
            <Comment blocks={data.comment} translations={visibleTranslations} onWordClick={handleWordClick} meta={data.meta || {}} lang={targetLang} />
            {data.title && <p className="source">{data.title}</p>}
          </article>
        ) : loading ? (
          <p className="notice" role="status">Загружаю материал дня…</p>
        ) : (
          <div className="notice"><p>{error}</p><button onClick={reload}>Повторить</button></div>
        )}
      </main>
    </>
  );
}

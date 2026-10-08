import React, { useEffect, useMemo, useState } from "react";
import { translateWord } from "./api.js";
import { loadTranslations, saveTranslations } from "./lib/storage.js";
import Scripture from "./components/Scripture.jsx";
import Comment from "./components/Comment.jsx";
import { useDaily } from "./useDaily.js";

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
  const { data, loading, error, notice, reload } = useDaily();
  const [manualTranslations, setManualTranslations] = useState({});

  useEffect(() => {
    if (!data?.date) return;
    setManualTranslations(loadTranslations(data.date));
  }, [data?.date]);

  useEffect(() => {
    if (!data?.date) return;
    saveTranslations(data.date, manualTranslations);
  }, [data?.date, manualTranslations]);

  const baseTranslations = data?.translations || {};
  const visibleTranslations = useMemo(() => ({ ...baseTranslations, ...manualTranslations }), [baseTranslations, manualTranslations]);

  const handleWordClick = async ({ id, word, sentence, context, lemma }) => {
    console.log("[handleWordClick] CLICK", { id, word, sentence, context, lemma, dataDate: data?.date });
    if (!data?.date || !sentence) {
      console.log("[handleWordClick] Missing data.date or sentence, returning");
      return;
    }
    const key = String(id);
    if (visibleTranslations[key]) {
      console.log("[handleWordClick] Word already translated, toggling back to Russian");
      setManualTranslations((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    console.log("[handleWordClick] Starting translation request");
    try {
      const payload = {
        word,
        lemma: lemma || word,
        sentence,
        context: context || articleContext(data),
        date: data.date,
      };
      console.log("[handleWordClick] Payload:", payload);
      const res = await translateWord(payload);
      console.log("[handleWordClick] Response:", res);
      const translated = res?.translation || res?.original || word;
      console.log("[handleWordClick] Translated word:", translated);
      if (!translated || translated === word) {
        console.log("[handleWordClick] Translation is same as original or empty, not updating");
        return;
      }
      setManualTranslations((prev) => ({ ...prev, [key]: translated }));
      console.log("[handleWordClick] Translation saved");
    } catch (e) {
      console.error("[handleWordClick] Error:", e);
    }
  };

  return (
    <>
      <main className="page">
        {notice && <p className="notice" role="status">{notice}</p>}
        {data ? (
          <article>
            <h1>{data.date_label}</h1>
            <Scripture block={data.verse} translations={visibleTranslations} onWordClick={handleWordClick} meta={data.meta || {}} />
            <Comment blocks={data.comment} translations={visibleTranslations} onWordClick={handleWordClick} meta={data.meta || {}} />
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

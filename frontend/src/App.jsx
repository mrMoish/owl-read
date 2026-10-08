import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { translateWord } from "./api.js";
import { loadTranslations, saveTranslations, loadAlignState, saveAlignState } from "./lib/storage.js";
import { buildSentenceIndex, normalizeAlignment, classifyClick } from "./lib/alignment.js";
import Scripture from "./components/Scripture.jsx";
import Comment from "./components/Comment.jsx";
import { useDaily } from "./useDaily.js";

const EMPTY_ALIGNMENTS = {};

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

/** «Для этого слова нет отдельного перевода в данном контексте». Без ошибки, без перевода. */
function vibrateNoTranslation() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(15);
    }
  } catch {
    // устройство/браузер без vibration API — просто продолжаем
  }
}

function reducedMotion() {
  try {
    return typeof window !== "undefined" && window.matchMedia
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export default function App() {
  const { data, loading, error, notice, reload } = useDaily();
  const [manualTranslations, setManualTranslations] = useState({});
  const [alignments, setAlignments] = useState(EMPTY_ALIGNMENTS);
  const [activeUnits, setActiveUnits] = useState(() => new Set());
  const articleRef = useRef(null);
  const flipRects = useRef(null);

  const sentIdx = useMemo(() => buildSentenceIndex(data?.meta || {}), [data?.meta]);
  /** Выравнивание для конкретного слова (по вхождению его предложения). */
  const alignOf = (id) => alignments[sentIdx.keyOf.get(id)] || null;

  useEffect(() => {
    if (!data?.date) return;
    setManualTranslations(loadTranslations(data.date));
    const saved = loadAlignState(data.date);
    setAlignments(saved.alignments);
    setActiveUnits(new Set(saved.active));
  }, [data?.date]);

  useEffect(() => {
    if (!data?.date) return;
    saveTranslations(data.date, manualTranslations);
  }, [data?.date, manualTranslations]);

  useEffect(() => {
    if (!data?.date) return;
    saveAlignState(data.date, alignments, activeUnits);
  }, [data?.date, alignments, activeUnits]);

  const baseTranslations = data?.translations || {};
  const visibleTranslations = useMemo(() => ({ ...baseTranslations, ...manualTranslations }), [baseTranslations, manualTranslations]);

  /** Снимок позиций слов до изменения — основа FLIP-анимации перестановок. */
  const snapshotRects = () => {
    const root = articleRef.current;
    if (!root) return;
    const snap = new Map();
    root.querySelectorAll("[data-fk]").forEach((el) => snap.set(el.dataset.fk, el.getBoundingClientRect()));
    flipRects.current = snap;
  };

  // После изменения активных юнитов: гасим спутники (на кадр позже, чтобы сыграл
  // CSS-transition) и проигрываем короткое перемещение изменившим позицию словам.
  useLayoutEffect(() => {
    const root = articleRef.current;
    if (!root) return;
    const sats = root.querySelectorAll(".word.sat:not(.sat--faded)");
    if (sats.length && typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => sats.forEach((el) => el.classList.add("sat--faded")));
    }
    const prev = flipRects.current;
    flipRects.current = null;
    if (!prev || prev.size === 0 || reducedMotion()) return;
    root.querySelectorAll("[data-fk]").forEach((el) => {
      if (typeof el.animate !== "function") return;
      const r0 = prev.get(el.dataset.fk);
      const r1 = el.getBoundingClientRect();
      if (r0) {
        const dx = r0.left - r1.left;
        const dy = r0.top - r1.top;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          el.animate(
            [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
            { duration: 260, easing: "cubic-bezier(.25, .7, .3, 1)" }
          );
        }
      } else if (el.classList.contains("ins")) {
        el.animate(
          [{ opacity: 0, transform: "scale(.86)" }, { opacity: 1, transform: "none" }],
          { duration: 240, easing: "ease-out" }
        );
      }
    });
  }, [alignments, activeUnits]);

  const handleWordClick = async ({ id, word, sentence, lemma }) => {
    if (!data?.date || !sentence) {
      return;
    }
    const sentKey = sentIdx.keyOf.get(id);
    const al = alignments[sentKey];
    if (al) {
      const kind = classifyClick(al, id);
      if (kind === "head") {
        snapshotRects();
        const headId = String(id);
        setActiveUnits((prev) => {
          const next = new Set(prev);
          if (next.has(headId)) next.delete(headId);
          else next.add(headId);
          return next;
        });
        return;
      }
      vibrateNoTranslation(); // спутник или слово без юнита: отдельного перевода нет
      return;
    }
    // выравнивания предложения ещё нет — спрашиваем сервер
    const s = sentIdx.byKey.get(sentKey);
    const payload = {
      word,
      lemma: lemma || word,
      sentence,
      context: articleContext(data),
      date: data.date,
    };
    if (s && s.pos[id] !== undefined) {
      payload.ru_words = s.words;
      payload.clicked_index = s.pos[id];
    }
    // прежнее поведение: повторный клик убирает простой перевод-строку
    if (visibleTranslations[String(id)]) {
      setManualTranslations((prev) => {
        const next = { ...prev };
        delete next[String(id)];
        return next;
      });
      return;
    }
    snapshotRects();
    let res = null;
    try {
      res = await translateWord(payload);
    } catch {
      return; // ошибка перевода не ломает UX
    }
    const sa = s && res?.alignment ? normalizeAlignment(res.alignment, s.ids, s.words) : null;
    if (sa) {
      setAlignments((prev) => ({ ...prev, [sentKey]: sa }));
      if (classifyClick(sa, id) === "head") {
        setActiveUnits((prev) => new Set(prev).add(String(id)));
      } else {
        vibrateNoTranslation();
      }
      return;
    }
    // выравнивание не дали — деградируем к простой замене слова
    const translated = res?.translation || res?.original || word;
    if (!translated || translated === word) {
      return;
    }
    setManualTranslations((prev) => ({ ...prev, [String(id)]: translated }));
  };

  return (
    <>
      <main className="page">
        {notice && <p className="notice" role="status">{notice}</p>}
        {data ? (
          <article ref={articleRef}>
            <h1>{data.date_label}</h1>
            <Scripture block={data.verse} translations={visibleTranslations} onWordClick={handleWordClick} meta={data.meta || {}} alignOf={alignOf} activeUnits={activeUnits} />
            <Comment blocks={data.comment} translations={visibleTranslations} onWordClick={handleWordClick} meta={data.meta || {}} alignOf={alignOf} activeUnits={activeUnits} />
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

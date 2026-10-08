import React from "react";
import { layoutEntries } from "../lib/alignment.js";

const EMPTY_ACTIVE = new Set();

/** Записи уровня siblings: слово с данными выравнивания, пробел, прочий узел. */
function buildEntries(nodes, meta, alignOf) {
  const entries = [];
  for (const node of nodes) {
    if (node.t === "w") {
      const info = meta[String(node.id)] || {};
      const sent = info.sent || "";
      const al = alignOf ? alignOf(node.id) : null;
      let ruIdx = -1;
      let unit = null;
      if (al) {
        ruIdx = al.ids.indexOf(node.id);
        if (ruIdx >= 0 && al.ruUnit[ruIdx] >= 0) unit = al.units[al.ruUnit[ruIdx]];
      }
      entries.push({ kind: "word", id: node.id, text: node.s, ruIdx, unit, al, sent, lemma: info.lemma || node.s });
    } else if (node.t === "text" && !node.s.trim()) {
      entries.push({ kind: "ws" });
    } else {
      entries.push({ kind: "other", node });
    }
  }
  return entries;
}

const keyDownHandler = (onClick) => (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    onClick();
  }
};

function renderPlainWord(item, ctx, key) {
  const id = String(item.id);
  // прежний простой перевод-строка живёт только у предложений без выравнивания
  const legacy = item.al ? null : ctx.translations[id];
  const content = legacy || item.text;
  const onClick = () => ctx.onWordClick({
    id: item.id, word: item.text, lemma: item.lemma, sentence: item.sent,
  });
  return (
    <span
      key={key}
      data-fk={id}
      className={legacy ? "word es" : "word"}
      onClick={onClick}
      role="button"
      tabIndex="0"
      onKeyDown={keyDownHandler(onClick)}
      aria-label={legacy ? `Вернуть слово ${item.text}` : `Перевести слово ${item.text}`}
    >
      {content}
    </span>
  );
}

function renderExpanded(item, ctx, key) {
  if (item.kind === "ins") {
    return (
      <span key={key} data-fk={item.key} className="word es ins" aria-hidden="true">
        {item.text}
      </span>
    );
  }
  if (item.kind === "sat") {
    const id = String(item.id);
    const onClick = () => ctx.onWordClick({
      id: item.id, word: item.text, lemma: item.text, sentence: ctx.sentOf(item.id),
    });
    return (
      <span
        key={key}
        data-fk={id}
        className="word sat"
        onClick={onClick}
        role="button"
        tabIndex="0"
        onKeyDown={keyDownHandler(onClick)}
        aria-label={`У слова ${item.text} нет отдельного перевода`}
      >
        {item.text}
      </span>
    );
  }
  // испанское слово активного юнита: клик возвращает русское
  const info = ctx.meta[String(item.headId)] || {};
  const word = info.w || "";
  const onClick = () => ctx.onWordClick({
    id: item.headId, word, lemma: info.lemma || word, sentence: info.sent || "",
  });
  return (
    <span
      key={key}
      data-fk={item.key}
      className="word es"
      onClick={onClick}
      role="button"
      tabIndex="0"
      onKeyDown={keyDownHandler(onClick)}
      aria-label={`Вернуть слово ${word}`}
    >
      {item.text}
    </span>
  );
}

function renderOtherNode(node, ctx, key) {
  if (node.t === "text") return <React.Fragment key={key}>{node.s}</React.Fragment>;
  const children = Array.isArray(node.c) ? renderNodes(node.c, ctx) : null;
  if (node.t === "em") return <em key={key}>{children}</em>;
  if (node.t === "strong") return <strong key={key}>{children}</strong>;
  if (node.t === "a") return <a key={key} href={node.href} target="_blank" rel="noopener noreferrer">{children}</a>;
  return <React.Fragment key={key}>{children}</React.Fragment>;
}

function isExpanded(item) {
  return item.kind === "es" || item.kind === "ins" || item.kind === "sat";
}

function renderNodes(nodes, ctx) {
  const entries = buildEntries(nodes, ctx.meta, ctx.alignOf);
  const items = layoutEntries(entries, ctx.activeUnits);
  const out = [];
  let prevExpanded = false;
  items.forEach((item, idx) => {
    if (isExpanded(item)) {
      if (prevExpanded) out.push(<React.Fragment key={`sp${idx}`}> </React.Fragment>);
      out.push(renderExpanded(item, ctx, item.key ?? `x${idx}`));
      prevExpanded = true;
      return;
    }
    prevExpanded = false;
    if (item.kind === "ws") out.push(<React.Fragment key={`ws${idx}`}> </React.Fragment>);
    else if (item.kind === "word") out.push(renderPlainWord(item, ctx, String(item.id)));
    else out.push(renderOtherNode(item.node, ctx, `o${idx}`));
  });
  return out;
}

export default function RichText({
  nodes = [],
  translations = {},
  onWordClick = () => {},
  meta = {},
  alignOf = null,
  activeUnits = EMPTY_ACTIVE,
}) {
  const ctx = {
    translations,
    onWordClick,
    meta,
    alignOf,
    activeUnits,
    sentOf: (id) => (meta[String(id)] || {}).sent || "",
  };
  return renderNodes(nodes, ctx);
}

import React, { useMemo, useState } from "react";
import { useDaily } from "./useDaily.js";
import { loadPercent, savePercent } from "./lib/storage.js";
import { pickShown } from "./lib/selection.js";
import Scripture from "./components/Scripture.jsx";
import Comment from "./components/Comment.jsx";
import SettingsFab from "./components/SettingsFab.jsx";

export default function App() {
  const { data, loading, error, notice, reload } = useDaily();
  const [percent, setPercent] = useState(loadPercent);
  const tr = data?.translations;
  const shown = useMemo(() => pickShown(data?.order, tr, percent), [data?.order, tr, percent]);
  const set = (v) => { setPercent(v); savePercent(v); };

  return (
    <>
      <main className="page">
        {notice && <p className="notice" role="status">{notice}</p>}
        {data ? (
          <article>
            <h1>{data.date_label}</h1>
            <Scripture block={data.verse} shown={shown} tr={tr || {}} />
            <Comment blocks={data.comment} shown={shown} tr={tr || {}} />
            {data.title && <p className="source">{data.title}</p>}
          </article>
        ) : loading ? (
          <p className="notice" role="status">Загружаю материал дня…</p>
        ) : (
          <div className="notice"><p>{error}</p><button onClick={reload}>Повторить</button></div>
        )}
      </main>
      <SettingsFab percent={percent} onChange={set} status={data?.translations_status} />
    </>
  );
}

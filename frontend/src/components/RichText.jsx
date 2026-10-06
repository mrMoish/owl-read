import React from "react";

/** Рендерит узлы текста. Выбранные слова ЗАМЕНЯЮТСЯ испанскими (русское слово не показывается). */
function Nodes({ nodes, shown, tr }) {
  return nodes.map((n, i) => {
    if (n.t === "text") return n.s;
    if (n.t === "w") return shown.has(n.id) ? <span key={i} className="es" lang="es-AR">{tr[n.id]}</span> : n.s;
    const kids = <Nodes nodes={n.c} shown={shown} tr={tr} />;
    if (n.t === "em") return <em key={i}>{kids}</em>;
    if (n.t === "strong") return <strong key={i}>{kids}</strong>;
    if (n.t === "a") return <a key={i} href={n.href} target="_blank" rel="noopener noreferrer">{kids}</a>;
    return null;
  });
}
export default React.memo(Nodes);

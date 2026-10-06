import React, { useEffect, useState } from "react";

export default function SettingsFab({ percent, onChange, status }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const esc = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  const hint = { pending: "Загружаю переводы…", partial: "Часть слов не переведена", unavailable: "Переводы недоступны" }[status];
  return (
    <>
      {open && <div className="backdrop" onPointerDown={() => setOpen(false)} />}
      {open && (
        <div className="panel" role="dialog" aria-label="Настройка перевода">
          <label htmlFor="pct"><span>Слов на испанском</span><b>{percent}%</b></label>
          <input id="pct" type="range" min="0" max="50" step="1" value={percent} onChange={(e) => onChange(Number(e.target.value))} />
          {hint && <small>{hint}</small>}
        </div>
      )}
      <button className="fab" aria-label="Настройки перевода" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 5h9M8.5 3v2M6 5c.6 3 2.6 5.5 5.5 7M12 5c-.6 3-2.8 5.7-6.5 7.3" /><path d="M13 20l4-9 4 9M14.4 17h5.2" />
        </svg>
      </button>
    </>
  );
}

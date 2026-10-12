import React, { useEffect, useState, useRef } from "react";
import { getSmoothToggleLabel, getModeTransitions } from "../lib/modes.js";

export default function SettingsFab({
  mode = { id: "ru-es" },
  smoothConfig = { enabled: false, percent: 10 },
  onSmoothToggle = () => {},
  onSmoothPercentChange = () => {},
}) {
  const [open, setOpen] = useState(false);
  const startPosRef = useRef({ x: 0, y: 0 });
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const esc = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  // Long press on any part of the page opens settings bottom sheet
  useEffect(() => {
    const handlePointerDown = (e) => {
      // Don't register long press if user is clicking interactive controls in modal/sheet
      if (
        e.target.closest(".settings-bottom-sheet") ||
        e.target.closest("button") ||
        e.target.closest("input") ||
        e.target.closest("a")
      ) {
        return;
      }

      startPosRef.current = { x: e.clientX, y: e.clientY };
      if (timerRef.current) clearTimeout(timerRef.current);

      timerRef.current = setTimeout(() => {
        setOpen(true);
      }, 500);
    };

    const handlePointerMove = (e) => {
      if (!timerRef.current) return;
      const dx = Math.abs(e.clientX - startPosRef.current.x);
      const dy = Math.abs(e.clientY - startPosRef.current.y);
      if (dx > 10 || dy > 10) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const handlePointerUp = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);

  const toggleLabel = getSmoothToggleLabel(mode?.id);
  const transitions = getModeTransitions(mode?.id);

  return (
    <>
      {open && (
        <div
          className="settings-backdrop"
          onPointerDown={() => setOpen(false)}
          data-testid="settings-backdrop"
        />
      )}
      {open && (
        <div
          className="settings-bottom-sheet"
          role="dialog"
          aria-label="Настройки"
          data-testid="settings-sheet"
        >
          <div className="settings-sheet-content">
            {smoothConfig.enabled && (
              <div className="settings-slider-group">
                <label htmlFor="smooth-pct-slider">
                  <span>Слов переведено</span>
                  <b>{smoothConfig.percent}%</b>
                </label>
                <input
                  id="smooth-pct-slider"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={smoothConfig.percent}
                  onChange={(e) => onSmoothPercentChange(Number(e.target.value))}
                />
              </div>
            )}

            <div className="settings-toggle-group">
              <label className="toggle-switch-label" htmlFor="smooth-toggle-checkbox">
                <span>{toggleLabel}</span>
                <input
                  id="smooth-toggle-checkbox"
                  type="checkbox"
                  checked={smoothConfig.enabled}
                  onChange={(e) => onSmoothToggle(e.target.checked)}
                />
                <span className="toggle-slider" />
              </label>
            </div>

            {transitions.length > 0 && (
              <div className="settings-mode-transitions">
                {transitions.map((t) => (
                  <a key={t.path} href={t.path} className="mode-transition-btn">
                    {t.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <button
        className="fab"
        aria-label="Настройки перевода"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 5h9M8.5 3v2M6 5c.6 3 2.6 5.5 5.5 7M12 5c-.6 3-2.8 5.7-6.5 7.3" />
          <path d="M13 20l4-9 4 9M14.4 17h5.2" />
        </svg>
      </button>
    </>
  );
}

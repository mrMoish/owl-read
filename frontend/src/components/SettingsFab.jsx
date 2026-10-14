import React, { useEffect, useState, useRef } from "react";
import { getSmoothToggleLabel } from "../lib/modes.js";

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
      const targetElem = e.target?.nodeType === 3 ? e.target.parentElement : e.target;
      if (!targetElem) return;

      // Don't register long press if user is clicking interactive controls or words
      if (
        targetElem.closest(".settings-bottom-sheet") ||
        targetElem.closest(".word") ||
        targetElem.closest("button") ||
        targetElem.closest("input") ||
        targetElem.closest("a")
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
          </div>
        </div>
      )}
    </>
  );
}

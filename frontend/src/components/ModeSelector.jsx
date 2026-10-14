import React from "react";
import { MODES, saveSelectedMode } from "../lib/modes.js";

export default function ModeSelector() {
  const modesList = Object.values(MODES);

  return (
    <div className="mode-selector-page" style={{ padding: "24px", maxWidth: "600px", margin: "0 auto" }}>
      <header style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: "bold" }}>Owl Read — Выбор режима</h1>
        <p style={{ color: "#666", marginTop: "8px" }}>
          Выберите язык обучения и направление перевода для изучения материалов.
        </p>
      </header>

      <div className="modes-grid" style={{ display: "grid", gap: "16px" }}>
        {modesList.map((m) => (
          <a
            key={m.id}
            href={m.path}
            target="_self"
            onClick={(e) => {
              e.preventDefault();
              saveSelectedMode(m.id);
              window.location.href = m.path;
            }}
            className="mode-card"
            style={{
              display: "block",
              padding: "16px",
              border: "1px solid #ddd",
              borderRadius: "8px",
              textDecoration: "none",
              color: "inherit",
              background: "#fff",
              transition: "box-shadow 0.2s ease",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: "600", fontSize: "18px" }}>{m.subtitle}</span>
              <span
                style={{
                  fontSize: "12px",
                  padding: "4px 8px",
                  borderRadius: "12px",
                  background: m.transliterate ? "#FFF3CD" : "#E2E3E5",
                  color: "#333",
                  fontWeight: "500",
                }}
              >
                {m.pair}
              </span>
            </div>
            <p style={{ fontSize: "14px", color: "#555", marginTop: "8px", marginBottom: "0" }}>
              {m.description}
            </p>
          </a>
        ))}
      </div>
    </div>
  );
}

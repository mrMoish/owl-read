import React from "react";
import { MODES } from "../lib/modes.js";

export default function ModeSelector() {
  const modesList = [MODES.s1, MODES.s2, MODES.s3, MODES.s4];

  return (
    <div className="mode-selector-page">
      <header className="mode-selector-header">
        <h1>Owl Read</h1>
        <p className="mode-selector-subtitle">
          Выберите режим чтения / Selecciona el modo de lectura
        </p>
      </header>

      <div className="mode-cards-grid">
        {modesList.map((mode) => (
          <a
            key={mode.id}
            href={mode.path}
            className="mode-card"
          >
            <div className="mode-card-header">
              <span className="mode-pair-badge">{mode.pair}</span>
              <h2 className="mode-card-title">{mode.title}</h2>
            </div>
            <p className="mode-card-subtitle">{mode.subtitle}</p>
            <p className="mode-card-desc">{mode.description}</p>
          </a>
        ))}
      </div>
    </div>
  );
}

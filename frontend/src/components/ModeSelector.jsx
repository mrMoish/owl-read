import React, { useState } from "react";
import { loadUserSettings, saveUserSettings } from "../lib/storage.js";

const UI_STRINGS = {
  ru: {
    nativeLabel: "Ваш родной язык:",
    targetLangLabel: "Изучаемый язык:",
    argentineLabel: "Аргентинское произношение",
    noAlphabetLabel: "Не знаю алфавит изучаемого языка",
    submitBtn: "Далее",
    russian: "Русский",
    spanish: "Испанский",
    english: "Английский",
  },
  es: {
    nativeLabel: "Tu idioma materno:",
    targetLangLabel: "Idioma de estudio:",
    argentineLabel: "Pronunciación argentina",
    noAlphabetLabel: "No conozco el alfabeto del idioma de estudio",
    submitBtn: "Continuar",
    russian: "Ruso",
    spanish: "Español",
    english: "Inglés",
  },
};

export default function ModeSelector() {
  const [settings, setSettings] = useState(() => {
    const saved = loadUserSettings();
    const native = saved.nativeLang || "es";
    const target = saved.targetLang || (native === "es" ? "ru" : "es");
    return {
      nativeLang: native,
      targetLang: target,
      argentineAccent: saved.argentineAccent !== undefined ? saved.argentineAccent : true,
      noAlphabet: saved.noAlphabet !== undefined ? saved.noAlphabet : false,
    };
  });

  const ui = UI_STRINGS[settings.nativeLang] || UI_STRINGS.es;

  const handleNativeSelect = (langCode) => {
    const defaultTarget = langCode === "es" ? "ru" : "es";
    setSettings((s) => ({
      ...s,
      nativeLang: langCode,
      targetLang: defaultTarget,
    }));
  };

  const handleTargetSelect = (langCode) => {
    setSettings((s) => ({
      ...s,
      targetLang: langCode,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    saveUserSettings(settings);
    const route = settings.targetLang === "es" ? "/es/" : (settings.targetLang === "en" ? "/en/" : "/ru/");
    window.location.href = route;
  };

  // Изучаемый язык: русский, испанский, английский (без родного)
  const allTargetLanguages = [
    { code: "ru", label: ui.russian },
    { code: "es", label: ui.spanish },
    { code: "en", label: ui.english },
  ];

  const availableTargetLanguages = allTargetLanguages.filter(
    (l) => l.code !== settings.nativeLang
  );

  return (
    <div className="mode-selector-page">
      <header className="mode-selector-header">
        <h1>Owl Read</h1>
      </header>

      <form className="mode-selector-form" onSubmit={handleSubmit}>
        {/* Родной язык: кнопки Русский и Español */}
        <div className="form-section">
          <label className="section-label">{ui.nativeLabel}</label>
          <div className="target-lang-options">
            <button
              type="button"
              className={`target-lang-card ${settings.nativeLang === "ru" ? "selected" : ""}`}
              onClick={() => handleNativeSelect("ru")}
            >
              <strong>Русский</strong>
            </button>
            <button
              type="button"
              className={`target-lang-card ${settings.nativeLang === "es" ? "selected" : ""}`}
              onClick={() => handleNativeSelect("es")}
            >
              <strong>Español</strong>
            </button>
          </div>
        </div>

        {/* Изучаемый язык */}
        <div className="form-section target-lang-section">
          <label className="section-label">{ui.targetLangLabel}</label>
          <div className="target-lang-options">
            {availableTargetLanguages.map((l) => (
              <button
                key={l.code}
                type="button"
                className={`target-lang-card ${settings.targetLang === l.code ? "selected" : ""}`}
                onClick={() => handleTargetSelect(l.code)}
              >
                <strong>{l.label}</strong> ({l.code})
              </button>
            ))}
          </div>

          {/* Галочка аргентинское произношение (если изучаемый язык - испанский) */}
          {settings.targetLang === "es" && (
            <label className="checkbox-setting">
              <input
                type="checkbox"
                checked={settings.argentineAccent}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, argentineAccent: e.target.checked }))
                }
              />
              <span>{ui.argentineLabel}</span>
            </label>
          )}

          {/* Галочка не знаю алфавит изучаемого языка */}
          <label className="checkbox-setting">
            <input
              type="checkbox"
              checked={settings.noAlphabet}
              onChange={(e) =>
                setSettings((s) => ({ ...s, noAlphabet: e.target.checked }))
              }
            />
            <span>{ui.noAlphabetLabel}</span>
          </label>
        </div>

        <button type="submit" className="submit-mode-button">
          {ui.submitBtn}
        </button>
      </form>
    </div>
  );
}

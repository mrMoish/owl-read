import React, { useState } from "react";
import { loadUserSettings, saveUserSettings } from "../lib/storage.js";

const ALL_LANGUAGES = [
  { code: "ru", name: "Русский", nativeName: "Русский" },
  { code: "es", name: "Испанский", nativeName: "Español" },
  { code: "en", name: "Английский", nativeName: "English" },
  { code: "de", name: "Немецкий", nativeName: "Deutsch" },
  { code: "fr", name: "Французский", nativeName: "Français" },
  { code: "it", name: "Итальянский", nativeName: "Italiano" },
  { code: "pt", name: "Португальский", nativeName: "Português" },
  { code: "zh", name: "Китайский", nativeName: "中文" },
  { code: "ja", name: "Японский", nativeName: "日本語" },
  { code: "ko", name: "Корейский", nativeName: "한국어" },
  { code: "ar", name: "Арабский", nativeName: "العربية" },
  { code: "hi", name: "Хинди", nativeName: "हिन्दी" },
  { code: "tr", name: "Турецкий", nativeName: "Türkçe" },
  { code: "uk", name: "Украинский", nativeName: "Українська" },
];

const UI_STRINGS = {
  ru: {
    nativeLabel: "Ваш родной язык и основной язык системы",
    otherLangsLabel: "Или остальные предпочитаемые языки и языки клавиатуры:",
    targetLangLabel: "Изучаемый язык:",
    argentineLabel: "Аргентинское произношение",
    noAlphabetLabel: "Не знаю алфавит изучаемого языка",
    submitBtn: "Далее",
    searchPlaceholder: "Поиск языка...",
    russian: "Русский",
    spanish: "Испанский",
    english: "Английский",
  },
  es: {
    nativeLabel: "Tu idioma materno y el idioma principal del sistema",
    otherLangsLabel: "O los demás idiomas preferidos e idiomas del teclado:",
    targetLangLabel: "Idioma de estudio:",
    argentineLabel: "Pronunciación argentina",
    noAlphabetLabel: "No conozco el alfabeto del idioma de estudio",
    submitBtn: "Continuar",
    searchPlaceholder: "Buscar idioma...",
    russian: "Ruso",
    spanish: "Español",
    english: "Inglés",
  },
  en: {
    nativeLabel: "Your native language and main system language",
    otherLangsLabel: "Or other preferred languages and keyboard languages:",
    targetLangLabel: "Language to learn:",
    argentineLabel: "Argentine pronunciation",
    noAlphabetLabel: "I don't know the alphabet of the language I'm learning",
    submitBtn: "Next",
    searchPlaceholder: "Search language...",
    russian: "Russian",
    spanish: "Spanish",
    english: "English",
  },
};

export default function ModeSelector() {
  const [settings, setSettings] = useState(() => {
    const saved = loadUserSettings();
    const native = saved.nativeLang || "es"; // По умолчанию испанский или сохраненный
    const target = saved.targetLang || (native === "es" ? "ru" : "es");
    return {
      nativeLang: native,
      targetLang: target,
      argentineAccent: saved.argentineAccent !== undefined ? saved.argentineAccent : true,
      noAlphabet: saved.noAlphabet !== undefined ? saved.noAlphabet : false,
    };
  });

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const ui = UI_STRINGS[settings.nativeLang] || UI_STRINGS.es;

  const handleNativeSelect = (langCode) => {
    // Если выбираем испанский родной -> изучаемый по умолчанию русский, иначе испанский
    const defaultTarget = langCode === "es" ? "ru" : "es";
    setSettings((s) => ({
      ...s,
      nativeLang: langCode,
      targetLang: defaultTarget,
    }));
    setIsDropdownOpen(false);
    setSearchQuery("");
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
    // Направление на нужный маршрут приложения
    const route = settings.targetLang === "es" ? "/es/" : (settings.targetLang === "en" ? "/en/" : "/ru/");
    window.location.href = route;
  };

  const selectedNativeObj = ALL_LANGUAGES.find((l) => l.code === settings.nativeLang) || ALL_LANGUAGES[0];

  const filteredLanguages = ALL_LANGUAGES.filter(
    (l) =>
      l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.nativeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="mode-selector-page">
      <header className="mode-selector-header">
        <h1>Owl Read</h1>
      </header>

      <form className="mode-selector-form" onSubmit={handleSubmit}>
        {/* Строка 1: Ваш родной язык и основной язык системы */}
        <div className="form-section">
          <label className="section-label">{ui.nativeLabel}</label>
          <div className="main-lang-selector">
            <button
              type="button"
              className="main-lang-button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            >
              <span>{selectedNativeObj.nativeName} ({selectedNativeObj.name})</span>
              <span className="dropdown-arrow">{isDropdownOpen ? "▲" : "▼"}</span>
            </button>

            {isDropdownOpen && (
              <div className="lang-dropdown">
                <input
                  type="text"
                  className="lang-search-input"
                  placeholder={ui.searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
                <div className="lang-list">
                  {filteredLanguages.map((l) => (
                    <button
                      key={l.code}
                      type="button"
                      className={`lang-option ${l.code === settings.nativeLang ? "active" : ""}`}
                      onClick={() => handleNativeSelect(l.code)}
                    >
                      {l.nativeName} ({l.name})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Строка 2: или остальные предпочитаемые языки и языки клавиатуры */}
        <div className="form-section">
          <label className="section-label-sub">{ui.otherLangsLabel}</label>
          <div className="lang-chips-links">
            {ALL_LANGUAGES.slice(0, 8).map((l) => (
              <button
                key={l.code}
                type="button"
                className="lang-chip-link"
                onClick={() => handleNativeSelect(l.code)}
              >
                {l.nativeName}
              </button>
            ))}
          </div>
        </div>

        {/* Изучаемый язык */}
        <div className="form-section target-lang-section">
          <label className="section-label">{ui.targetLangLabel}</label>
          <div className="target-lang-options">
            <button
              type="button"
              className={`target-lang-card ${settings.targetLang === "ru" ? "selected" : ""}`}
              onClick={() => handleTargetSelect("ru")}
            >
              <strong>{ui.russian}</strong> (ru)
            </button>
            <button
              type="button"
              className={`target-lang-card ${settings.targetLang === "es" ? "selected" : ""}`}
              onClick={() => handleTargetSelect("es")}
            >
              <strong>{ui.spanish}</strong> (es)
            </button>
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

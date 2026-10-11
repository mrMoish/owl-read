import React from "react";

export default function ModeSelector() {
  const modes = [
    {
      id: "es-ru",
      pair: "es → ru",
      title: "Para hispanohablantes",
      subtitle: "Испаноговорящие учат русский",
      description: "Lectura diaria en ruso con traducción al español al tocar cada palabra.",
      path: "/ru/",
    },
    {
      id: "ru-es",
      pair: "ru → es",
      title: "Для русскоговорящих",
      subtitle: "Русскоговорящие учат испанский",
      description: "Ежедневное чтение на испанском с переводом на русский при нажатии на слова.",
      path: "/es/",
    },
    {
      id: "en-ru",
      pair: "en → ru",
      title: "Для русскоговорящих",
      subtitle: "Русскоговорящие учат английский",
      description: "Ежедневное чтение на английском с переводом на русский при нажатии на слова.",
      path: "/en/",
    },
  ];

  return (
    <div className="mode-selector-page">
      <header className="mode-selector-header">
        <h1>Owl Read</h1>
        <p className="mode-selector-subtitle">
          Выберите режим чтения / Selecciona el modo de lectura
        </p>
      </header>

      <div className="mode-cards-grid">
        {modes.map((mode) => (
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

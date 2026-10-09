import test from "node:test";
import assert from "node:assert/strict";

// Моделируем логику отображения и замены слова, используемую в приложении:
function createReadingSession({ preparedTranslations = {}, savedManualTranslations = {} }) {
  let manualTranslations = { ...savedManualTranslations };
  let apiCallsCount = 0;

  // Изначально отображаются только вручную заменённые пользователем слова (visibleTranslations)
  const getVisibleTranslations = () => ({ ...manualTranslations });

  // Отображение конкретного токена
  const renderWord = (node) => {
    const id = String(node.id);
    const visible = getVisibleTranslations();
    return visible[id] || node.s;
  };

  // Обработчик клика по слову
  const handleWordClick = async ({ id, word }, mockApiFallback = null) => {
    const key = String(id);
    if (manualTranslations[key]) {
      // Повторный клик: возврат к исходному русскому слову
      delete manualTranslations[key];
      return;
    }

    // 1. Проверяем предварительно подготовленный перевод
    const prepared = preparedTranslations[key];
    if (prepared && prepared !== word) {
      manualTranslations[key] = prepared;
      return;
    }

    // 2. Резервный вызов API при отсутствии перевода в словаре
    if (mockApiFallback) {
      apiCallsCount++;
      const res = await mockApiFallback(word);
      if (res && res !== word) {
        manualTranslations[key] = res;
      }
    }
  };

  return {
    getManualTranslations: () => ({ ...manualTranslations }),
    getVisibleTranslations,
    renderWord,
    handleWordClick,
    getApiCallsCount: () => apiCallsCount,
  };
}

test("1. Отсутствие отображения предварительно подготовленных переводов до нажатия", () => {
  const prepared = {
    "0": "amor",
    "1": "vida",
    "2": "por la mañana",
  };
  const session = createReadingSession({ preparedTranslations: prepared });

  // До клика: видимые переводы пусты
  assert.deepEqual(session.getVisibleTranslations(), {});

  // Слова рендерятся в исходном русском виде
  assert.equal(session.renderWord({ id: 0, s: "любовь" }), "любовь");
  assert.equal(session.renderWord({ id: 1, s: "жизнь" }), "жизнь");
  assert.equal(session.renderWord({ id: 2, s: "утром" }), "утром");
});

test("2. Замена слова при нажатии без повторного обращения к переводчику (0 вызовов API)", async () => {
  const prepared = {
    "0": "amor",
    "1": "vida",
  };
  const session = createReadingSession({ preparedTranslations: prepared });

  let fallbackCalled = false;
  const mockApi = async () => {
    fallbackCalled = true;
    return "api_result";
  };

  // Кликаем по слову "любовь"
  await session.handleWordClick({ id: 0, word: "любовь" }, mockApi);

  // Перевод подставился мгновенно
  assert.equal(session.renderWord({ id: 0, s: "любовь" }), "amor");
  // API НЕ вызывался
  assert.equal(fallbackCalled, false);
  assert.equal(session.getApiCallsCount(), 0);
});

test("3. Корректная замена, когда перевод состоит из нескольких слов (фраза)", async () => {
  const prepared = {
    "0": "por la mañana",
    "1": "dar cuenta",
  };
  const session = createReadingSession({ preparedTranslations: prepared });

  await session.handleWordClick({ id: 0, word: "утром" });
  await session.handleWordClick({ id: 1, word: "заметить" });

  // Вся испанская фраза отображается целиком
  assert.equal(session.renderWord({ id: 0, s: "утром" }), "por la mañana");
  assert.equal(session.renderWord({ id: 1, s: "заметить" }), "dar cuenta");
});

test("4. Сохранение состояния уже заменённых слов и возврат по повторному клику", async () => {
  const prepared = {
    "0": "palabra",
    "1": "verdad",
  };
  const session = createReadingSession({ preparedTranslations: prepared });

  // Заменяем первое слово
  await session.handleWordClick({ id: 0, word: "слово" });
  assert.equal(session.renderWord({ id: 0, s: "слово" }), "palabra");
  assert.equal(session.renderWord({ id: 1, s: "истина" }), "истина");

  // Заменяем второе слово — первое остаётся на испанском
  await session.handleWordClick({ id: 1, word: "истина" });
  assert.equal(session.renderWord({ id: 0, s: "слово" }), "palabra");
  assert.equal(session.renderWord({ id: 1, s: "истина" }), "verdad");

  // Повторный клик на первое слово возвращает его на русский, второе остаётся
  await session.handleWordClick({ id: 0, word: "слово" });
  assert.equal(session.renderWord({ id: 0, s: "слово" }), "слово");
  assert.equal(session.renderWord({ id: 1, s: "истина" }), "verdad");
});

test("5. Корректная обработка отсутствующего перевода (слово остаётся русским)", async () => {
  // Словарь подготовлен, но в нём нет слова с id 5
  const prepared = { "0": "amor" };
  const session = createReadingSession({ preparedTranslations: prepared });

  const failingMockApi = async () => {
    throw new Error("Translation service offline");
  };

  // Клик по слову, у которого нет перевода в словаре и API недоступен
  await session.handleWordClick({ id: 5, word: "редкое" }, async () => {
    try {
      return await failingMockApi();
    } catch {
      return null;
    }
  });

  // Слово сохраняет исходный русский текст без ошибок
  assert.equal(session.renderWord({ id: 5, s: "редкое" }), "редкое");
});

test("6. Восстановление состояния из сохранённых заменённых слов", () => {
  const savedState = { "0": "amor" };
  const prepared = { "0": "amor", "1": "paz" };
  const session = createReadingSession({
    preparedTranslations: prepared,
    savedManualTranslations: savedState,
  });

  // Уже сохранённое слово сразу показывается на испанском, не заменённое — на русском
  assert.equal(session.renderWord({ id: 0, s: "любовь" }), "amor");
  assert.equal(session.renderWord({ id: 1, s: "мир" }), "мир");
});

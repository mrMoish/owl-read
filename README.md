# Чтение на каждый день (PWA)

React + Service Worker + Web App Manifest · FastAPI · OpenRouter.

## Запуск (разработка)
```bash
# backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # впишите OPENROUTER_API_KEY
uvicorn app.main:app --reload --port 8000

# frontend (в другом терминале)
cd frontend && npm install && npm run dev      # http://localhost:5173 (/api проксируется на :8000)
```

## Продакшен / проверка PWA
```bash
cd frontend && npm run build
cd ../backend && uvicorn app.main:app --port 8000   # раздаёт и API, и frontend/dist
```
PWA устанавливается только по HTTPS (или на localhost). Service Worker регистрируется в сборке (`npm run build`), в `npm run dev` — нет.

## Переменные окружения (backend/.env)
`OPENROUTER_API_KEY` (обязательна для перевода), `OPENROUTER_MODEL` (по умолч. `openai/gpt-4o-mini`),
`APP_TIMEZONE`, `DB_PATH`. Без ключа приложение работает, текст остаётся русским.

## Тесты
`cd backend && pytest` · `cd frontend && npm test`

## Архитектура
```
backend/app/
  wol/fetcher.py        скачивание страницы WOL (.../lp-u/ГГГГ/М/Д)
  wol/parser.py         ЕДИНСТВЕННОЕ место, знающее про HTML WOL → нейтральные блоки
  textproc/analyzer.py  токенизация, pymorphy3 (леммы), предложения
  translation/openrouter.py  клиент, JSON-ответ, валидация, ретраи; перевод слова
                             и выравнивание предложения (ALIGN_SYSTEM)
  translation/alignment.py   модель соответствий: юниты «набор русских слов ↔
                             диапазон испанских слов», валидация ответа модели
  translation/service.py     кэш переводов (слово+предложение) и выравниваний
                             (предложение), деградация к простому переводу
  store.py              SQLite: daily(date), daily_es(date), translations(key), alignments(key)
  daily.py              логика «новый день → новый запрос к WOL», откат на сохранённое
  main.py               GET /api/daily, POST /api/translate, раздача frontend/dist
frontend/src/
  App.jsx               клики, состояние выравниваний, вибрация «нет перевода», FLIP
  components/RichText.jsx  группы выравнивания: испанский порядок, вставки, спутники
  lib/alignment.js      нормализация выравнивания, layout групп, классификация клика
  lib/{selection,storage}
frontend/public/  manifest.webmanifest, sw.js, offline.html, icons/
```

### Модель соответствий (alignment)
`POST /api/translate` с `ru_words` + `clicked_index` возвращает, кроме строки-перевода,
`alignment`: `ru_words` ↔ `es_words` + юниты `{"ru": [индексы], "es": [start, end], "head": i}`.
Юнит покрывает word→word, word→phrase, phrase→word, phrase→phrase и несплошные
наборы («за + наблюдал → observaba»); испанские слова вне юнитов — вставки
(«por la»), русские вне юнитов — слова без отдельного перевода (клик = вибрация).
Без `ru_words` эндпоинт работает по-старому (простая строка).

# Чтение на каждый день (PWA).

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
  textproc/analyzer.py  токенизация, pymorphy3 (леммы, имена), wordfreq (частотность), предложения
  translation/openrouter.py  клиент, JSON-ответ, валидация, ретраи
  translation/service.py     выбор слов, кэш (слово+предложение+es-AR), батчи по 40
  store.py              SQLite: daily(date) и translations(key)
  daily.py              логика «новый день → новый запрос к WOL», откат на сохранённое
  main.py               GET /api/daily, POST /api/daily/translations, раздача frontend/dist
frontend/src/  App, useDaily, components/{Scripture,Comment,RichText,SettingsFab}, lib/{selection,storage}
frontend/public/  manifest.webmanifest, sw.js, offline.html, icons/
```

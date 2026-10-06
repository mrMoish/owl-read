from __future__ import annotations
import logging
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.staticfiles import StaticFiles
from .config import Settings, get_settings
from .daily import DailyService
from .store import Store
from .translation.openrouter import OpenRouterClient
from .translation.service import TranslationService
from .wol.fetcher import WolError

log = logging.getLogger("reader")


def create_app(settings: Settings | None = None, fetch=None) -> FastAPI:
    s = settings or get_settings()
    store = Store(s.db_path)
    client = OpenRouterClient(s.openrouter_api_key, s.openrouter_model) if s.openrouter_api_key else None
    if not client:
        log.warning("OPENROUTER_API_KEY не задан: перевод отключён, текст останется на русском")
    tr = TranslationService(store, client, s.translate_max_share)
    daily = DailyService(s, store, tr, **({"fetch": fetch} if fetch else {}))
    app = FastAPI(title="Daily Reader")

    @app.get("/api/health")
    def health():
        return {"ok": True, "translation": bool(client)}

    @app.get("/api/daily")
    async def get_daily(response: Response, date: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$")):
        response.headers["Cache-Control"] = "no-store"
        try:
            content, notice = await daily.get(date)
        except WolError as e:
            raise HTTPException(503, f"Материал недоступен: {e}")
        translations, status = tr.cached(content)
        return daily.public(content, translations, status, notice)

    @app.post("/api/daily/translations")
    async def make_translations(response: Response, date: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$")):
        response.headers["Cache-Control"] = "no-store"
        try:
            content, notice = await daily.get(date)
        except WolError as e:
            raise HTTPException(503, f"Материал недоступен: {e}")
        translations, status = await tr.ensure(content)
        return {"date": content["date"], "translations": {str(k): v for k, v in translations.items()},
                "translations_status": status}

    if s.frontend_dist.exists():  # один процесс: API + собранный PWA
        app.mount("/", StaticFiles(directory=s.frontend_dist, html=True), name="web")
    return app


app = create_app()

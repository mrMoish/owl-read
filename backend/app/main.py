from __future__ import annotations
import logging
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .config import Settings, get_settings
from .daily import DailyService
from .store import Store
from .translation.openrouter import OpenRouterClient
from .translation.service import TranslationService
from .wol.fetcher import WolError, fetch_wol_page

log = logging.getLogger("reader")


def create_app(settings: Settings | None = None, fetch=None, fetch_spanish=None) -> FastAPI:
    s = settings or get_settings()
    store = Store(s.db_path)
    client = OpenRouterClient(s.openrouter_api_key, s.openrouter_model) if s.openrouter_api_key else None
    if not client:
        log.warning("OPENROUTER_API_KEY не задан: перевод отключён, текст останется на русском")
    tr = TranslationService(store, client, s.translate_max_share)
    daily = DailyService(s, store, tr, fetch=fetch or fetch_wol_page, fetch_spanish=fetch_spanish or (lambda base, day, client=None: fetch_wol_page(base, day, client=client, language="es")))
    app = FastAPI(title="Daily Reader")
    origins = [o.strip().rstrip("/") for o in __import__("os").environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
    if origins:
        app.add_middleware(CORSMiddleware, allow_origins=origins,
                           allow_methods=["GET", "POST"], allow_headers=["*"])

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
        return daily.public(content, {}, "ready", notice)

    @app.post("/api/translate")
    async def translate_word(response: Response, payload: dict):
        response.headers["Cache-Control"] = "no-store"
        word = str(payload.get("word", "")).strip()
        lemma = str(payload.get("lemma", word or "")).strip()
        sentence = str(payload.get("sentence", "")).strip()
        context = str(payload.get("context", sentence)).strip()
        date = str(payload.get("date") or "").strip()
        if not word or not sentence:
            raise HTTPException(400, "word и sentence обязательны")
        try:
            content, _ = await daily.get(date or None)
        except WolError as e:
            raise HTTPException(503, f"Материал недоступен: {e}")
        spanish_reference = ""
        try:
            spanish_content, _ = await daily.get_spanish(date or None)
            spanish_reference = _flatten_daily_text(spanish_content)
        except WolError:
            spanish_reference = ""
        translated = await tr.translate_word(
            date=date or content["date"],
            word=word,
            lemma=lemma,
            sentence=sentence,
            context=context,
            spanish_reference=spanish_reference,
        )
        return {"original": word, "translation": translated}

    if s.frontend_dist.exists():
        app.mount("/", StaticFiles(directory=s.frontend_dist, html=True), name="web")
    return app


def _flatten_daily_text(content: dict) -> str:
    blocks = [content.get("verse", {})] + list(content.get("comment", []))
    out = []
    for block in blocks:
        out.append("".join(_flatten_nodes(block.get("nodes", []))))
    return " ".join(filter(None, out))


def _flatten_nodes(nodes):
    texts = []
    for node in nodes:
        if node.get("t") == "text":
            texts.append(node.get("s", ""))
        elif "c" in node:
            texts.append("".join(_flatten_nodes(node.get("c", []))))
    return texts


app = create_app()

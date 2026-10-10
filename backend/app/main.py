from __future__ import annotations
import logging
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from .config import Settings, get_settings
from .daily import DailyService
from .store import Store
from .translation.openrouter import OpenRouterClient
from .translation.service import TranslationService
from .wol.fetcher import WolError, fetch_wol_page

log = logging.getLogger("reader")


def _resolve_lang(lang_param: str | None, en_param: str | None) -> str:
    if en_param is not None or lang_param == "en":
        return "en"
    return "ru"


def create_app(settings: Settings | None = None, fetch=None, fetch_spanish=None, fetch_english=None) -> FastAPI:
    s = settings or get_settings()
    store = Store(s.db_path)
    client = OpenRouterClient(s.openrouter_api_key, s.openrouter_model) if s.openrouter_api_key else None
    if not client:
        log.warning("OPENROUTER_API_KEY не задан: перевод отключён, текст останется на русском")
    tr = TranslationService(store, client, s.translate_max_share)
    daily = DailyService(s, store, tr, fetch=fetch or fetch_wol_page,
                         fetch_spanish=fetch_spanish or (lambda base, day, client=None: fetch_wol_page(base, day, client=client, language="es")),
                         fetch_english=fetch_english or (lambda base, day, client=None: fetch_wol_page(base, day, client=client, language="en")))
    app = FastAPI(title="Daily Reader")
    origins = [o.strip().rstrip("/") for o in __import__("os").environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
    if origins:
        app.add_middleware(CORSMiddleware, allow_origins=origins,
                           allow_methods=["GET", "POST"], allow_headers=["*"])

    @app.get("/api/health")
    def health():
        return {"ok": True, "translation": bool(client)}

    @app.get("/api/daily")
    async def get_daily(response: Response,
                        date: str | None = Query(None, pattern=r"^\d{4}-\d{1,2}-\d{1,2}$"),
                        lang: str | None = Query(None),
                        en: str | None = Query(None)):
        response.headers["Cache-Control"] = "no-store"
        active_lang = _resolve_lang(lang, en)
        try:
            if active_lang == "en":
                content, notice = await daily.get_english(date)
            else:
                content, notice = await daily.get(date)
        except WolError as e:
            raise HTTPException(503, f"Материал недоступен: {e}")
        translations, status = tr.cached(content, lang=active_lang)
        return daily.public(content, translations, status, notice)

    @app.post("/api/daily/translations")
    async def make_translations(response: Response,
                                date: str | None = Query(None, pattern=r"^\d{4}-\d{1,2}-\d{1,2}$"),
                                lang: str | None = Query(None),
                                en: str | None = Query(None)):
        response.headers["Cache-Control"] = "no-store"
        active_lang = _resolve_lang(lang, en)
        try:
            if active_lang == "en":
                content, notice = await daily.get_english(date)
            else:
                content, notice = await daily.get(date)
        except WolError as e:
            raise HTTPException(503, f"Материал недоступен: {e}")
        ref_text = ""
        try:
            if active_lang == "en":
                ref_content, _ = await daily.get(date or None)
            else:
                ref_content, _ = await daily.get_spanish(date or None)
            ref_text = _flatten_daily_text(ref_content)
        except WolError:
            ref_text = ""
        translations, status = await tr.ensure(content, spanish_reference=ref_text, lang=active_lang)
        return {"date": content["date"], "translations": {str(k): v for k, v in translations.items()},
                "translations_status": status}

    @app.post("/api/translate")
    async def translate_word(response: Response, payload: dict):
        response.headers["Cache-Control"] = "no-store"
        word = str(payload.get("word", "")).strip()
        lemma = str(payload.get("lemma", word or "")).strip()
        sentence = str(payload.get("sentence", "")).strip()
        context = str(payload.get("context", sentence)).strip()
        date = str(payload.get("date") or "").strip()
        lang = str(payload.get("lang") or "").strip()
        if not word or not sentence:
            raise HTTPException(400, "word и sentence обязательны")
        active_lang = "en" if lang == "en" or payload.get("en") is not None else "ru"
        try:
            if active_lang == "en":
                content, _ = await daily.get_english(date or None)
            else:
                content, _ = await daily.get(date or None)
        except WolError as e:
            raise HTTPException(503, f"Материал недоступен: {e}")
        ref_text = ""
        try:
            if active_lang == "en":
                ref_content, _ = await daily.get(date or None)
            else:
                ref_content, _ = await daily.get_spanish(date or None)
            ref_text = _flatten_daily_text(ref_content)
        except WolError:
            ref_text = ""
        translated = await tr.translate_word(
            date=date or content["date"],
            word=word,
            lemma=lemma,
            sentence=sentence,
            context=context,
            spanish_reference=ref_text,
            lang=active_lang,
        )
        return {"original": word, "translation": translated}

    if s.frontend_dist.exists():
        index_file = s.frontend_dist / "index.html"
        dist_resolved = s.frontend_dist.resolve()

        @app.get("/{full_path:path}")
        async def serve_spa(full_path: str):
            if full_path:
                try:
                    resolved_file = (s.frontend_dist / full_path).resolve()
                    if resolved_file.is_relative_to(dist_resolved) and resolved_file.is_file():
                        return FileResponse(resolved_file)
                except (ValueError, Exception):
                    pass
            if index_file.is_file():
                return FileResponse(index_file)
            raise HTTPException(404, "Not Found")

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
        if node.get("t") in ("text", "w"):
            texts.append(node.get("s", ""))
        elif "c" in node:
            texts.append("".join(_flatten_nodes(node.get("c", []))))
    return texts


app = create_app()

from __future__ import annotations
import logging
import time
from datetime import datetime
from zoneinfo import ZoneInfo
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from .config import Settings, get_settings
from .daily import DailyService
from .store import Store
from .translation.openrouter import OpenRouterClient
from .translation.service import TranslationService
from .epub import EpubBrochureManager, WatchtowerEPUBManager, EpubError

log = logging.getLogger("reader")



def _resolve_lang(lang_param: str | None, en_param: str | None) -> str:
    if en_param is not None or lang_param == "en":
        return "en"
    if lang_param == "es":
        return "es"
    return "ru"


def create_app(settings: Settings | None = None, epub_manager: EpubBrochureManager | None = None, watchtower_manager: WatchtowerEPUBManager | None = None) -> FastAPI:
    s = settings or get_settings()
    store = Store(s.db_path)
    client = OpenRouterClient(s.openrouter_api_key, s.openrouter_model) if s.openrouter_api_key else None
    if not client:
        log.warning("OPENROUTER_API_KEY не задан: перевод отключён, текст останется на русском")
    tr = TranslationService(store, client, s.translate_max_share)
    epub_mgr = epub_manager or EpubBrochureManager()
    wt_mgr = watchtower_manager or WatchtowerEPUBManager(storage_dir=epub_mgr.storage_dir)
    daily = DailyService(s, store, tr, epub_manager=epub_mgr, watchtower_manager=wt_mgr)
    app = FastAPI(title="Daily Reader")
    origins = [
        o.strip().rstrip("/")
        for o in __import__("os").environ.get("ALLOWED_ORIGINS", "").split(",")
        if o.strip()
    ]
    
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_origin_regex=r"https://owl-read(?:-[a-z0-9]+)*-mrmoishs-projects\.vercel\.app",
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    def health():
        return {"ok": True, "translation": bool(client)}

    @app.get("/api/brochures/sync")
    async def sync_brochure(lang: str = Query("ru")):
        start_time = time.monotonic()
        active_lang = _resolve_lang(lang, None)
        current_year = datetime.now(ZoneInfo(s.timezone)).year
        log.info("[API Sync] Brochure sync requested: input_lang=%s resolved_lang=%s year=%d",
                 lang, active_lang, current_year)
        try:
            path = await epub_mgr.fetch_brochure_epub(current_year, lang=active_lang)
            elapsed = time.monotonic() - start_time
            log.info("[API Sync Success] Brochure synced: year=%d lang=%s file=%s duration=%.3fs",
                     current_year, active_lang, path.name, elapsed)
            return {"ok": True, "year": current_year, "lang": active_lang, "file": path.name}
        except Exception as e:
            elapsed = time.monotonic() - start_time
            log.exception("[API Sync Exception] Brochure sync failed: lang=%s year=%d error=%s duration=%.3fs",
                          active_lang, current_year, e, elapsed)
            raise HTTPException(500, f"Не удалось скачать брошюру: {e}")

    @app.get("/api/daily")
    async def get_daily(response: Response,
                        date: str | None = Query(None, pattern=r"^\d{4}-\d{1,2}-\d{1,2}$"),
                        lang: str | None = Query(None),
                        en: str | None = Query(None)):
        start_time = time.monotonic()
        response.headers["Cache-Control"] = "no-store"
        active_lang = _resolve_lang(lang, en)
        log.info("[API Daily] GET /api/daily: date=%s lang=%s en=%s resolved_lang=%s",
                 date, lang, en, active_lang)

        try:
            if active_lang == "en":
                content, notice = await daily.get_english(date)
            elif active_lang == "es":
                content, notice = await daily.get_spanish(date)
            else:
                content, notice = await daily.get(date)
        except EpubError as e:
            elapsed = time.monotonic() - start_time
            log.warning("[API Daily EpubError] Material unavailable: date=%s lang=%s error=%s duration=%.3fs",
                        date, active_lang, e, elapsed)
            raise HTTPException(503, f"Материал недоступен: {e}")
        except Exception as e:
            elapsed = time.monotonic() - start_time
            log.exception("[API Daily Exception] Unexpected exception: date=%s lang=%s error=%s duration=%.3fs",
                          date, active_lang, e, elapsed)
            raise HTTPException(500, f"Внутренняя ошибка сервера: {e}")

        res = daily.public(content, {}, "ondemand", notice)
        elapsed = time.monotonic() - start_time
        log.info("[API Daily Success] GET /api/daily completed: date=%s lang=%s notice=%s duration=%.3fs",
                 res.get("date"), active_lang, notice, elapsed)
        return res

    @app.post("/api/daily/translations")
    async def make_translations(response: Response,
                                date: str | None = Query(None, pattern=r"^\d{4}-\d{1,2}-\d{1,2}$"),
                                lang: str | None = Query(None),
                                en: str | None = Query(None)):
        start_time = time.monotonic()
        response.headers["Cache-Control"] = "no-store"
        active_lang = _resolve_lang(lang, en)
        log.info("[API Daily Translations] POST /api/daily/translations: date=%s lang=%s en=%s resolved_lang=%s",
                 date, lang, en, active_lang)

        try:
            if active_lang == "en":
                content, notice = await daily.get_english(date)
            elif active_lang == "es":
                content, notice = await daily.get_spanish(date)
            else:
                content, notice = await daily.get(date)
        except EpubError as e:
            elapsed = time.monotonic() - start_time
            log.warning("[API Daily Translations EpubError] Material unavailable: date=%s lang=%s error=%s duration=%.3fs",
                        date, active_lang, e, elapsed)
            raise HTTPException(503, f"Материал недоступен: {e}")

        ref_text = ""
        try:
            if active_lang in ("en", "es"):
                ref_content, _ = await daily.get(date or None)
            else:
                ref_content, _ = await daily.get_spanish(date or None)
            ref_text = _flatten_daily_text(ref_content)
        except EpubError as e:
            log.info("[API Daily Translations] Reference text not available for lang=%s: %s", active_lang, e)
            ref_text = ""

        translations, status = await tr.ensure(content, spanish_reference=ref_text, lang=active_lang)
        elapsed = time.monotonic() - start_time
        log.info("[API Daily Translations Success] Completed: date=%s lang=%s translations_count=%d status=%s duration=%.3fs",
                 content["date"], active_lang, len(translations), status, elapsed)
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

        log.info("[API Translate] POST /api/translate: word='%s' lemma='%s' date=%s lang=%s",
                 word, lemma, date, lang)

        if not word or not sentence:
            raise HTTPException(400, "word и sentence обязательны")
        if lang == "en" or payload.get("en") is not None:
            active_lang = "en"
        elif lang == "es":
            active_lang = "es"
        else:
            active_lang = "ru"

        try:
            if active_lang == "en":
                content, _ = await daily.get_english(date or None)
            elif active_lang == "es":
                content, _ = await daily.get_spanish(date or None)
            else:
                content, _ = await daily.get(date or None)
        except EpubError as e:
            raise HTTPException(503, f"Материал недоступен: {e}")

        ref_text = ""
        try:
            if active_lang in ("en", "es"):
                ref_content, _ = await daily.get(date or None)
            else:
                ref_content, _ = await daily.get_spanish(date or None)
            ref_text = _flatten_daily_text(ref_content)
        except EpubError:
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

    @app.post("/api/tts")
    async def get_tts(response: Response, payload: dict):
        response.headers["Cache-Control"] = "no-store"
        word = str(payload.get("word", "")).strip()
        sentence = str(payload.get("sentence", "")).strip()
        lang = str(payload.get("lang") or "es").strip()
        if not word:
            raise HTTPException(400, "word обязателен")
        res = await tr.generate_tts(word=word, sentence=sentence, lang=lang)
        if not res:
            raise HTTPException(503, "TTS недоступен")
        return {"audio_b64": res.get("audio_b64", ""), "format": res.get("format", "mp3")}

    @app.post("/api/pronunciation")
    async def get_pronunciation(response: Response, payload: dict):
        response.headers["Cache-Control"] = "no-store"
        word = str(payload.get("word", "")).strip()
        sentence = str(payload.get("sentence", "")).strip()
        lang = str(payload.get("lang") or "es").strip()
        if not word:
            raise HTTPException(400, "word обязателен")
        res = await tr.generate_pronunciation(word=word, sentence=sentence, lang=lang)
        if not res:
            return {"word": word, "ipa": "", "ru_hint": ""}
        return {"word": word, "ipa": res.get("ipa", ""), "ru_hint": res.get("ru_hint", "")}

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
                for lang_prefix in ("ru-es", "es-ru", "ru-es-translit", "es-ru-translit", "en-ru", "en", "es", "ru", "s1", "s2", "s3", "s4"):
                    if full_path == lang_prefix or full_path.startswith(f"{lang_prefix}/"):
                        lang_index = s.frontend_dist / lang_prefix / "index.html"
                        if lang_index.is_file():
                            return FileResponse(lang_index)
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

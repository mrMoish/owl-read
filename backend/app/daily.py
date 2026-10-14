"""Ежедневный материал: загрузка из EPUB брошюр и журналов, кэш по дате, откат на последний сохранённый."""
from __future__ import annotations
import asyncio
import logging
import time
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo
from .textproc.analyzer import analyze_blocks, priority_order
from .epub import EpubBrochureManager, EpubError
from .magazine import WatchtowerManager

log = logging.getLogger("daily_service")


class DailyService:
    def __init__(self, settings, store, translator, epub_manager: EpubBrochureManager | None = None, wt_manager: WatchtowerManager | None = None):
        self.s, self.store, self.tr = settings, store, translator
        self.epub_mgr = epub_manager or EpubBrochureManager()
        self.wt_mgr = wt_manager or WatchtowerManager()
        self._locks: dict[str, asyncio.Lock] = {}
        log.info("[DailyService] Initialized with timezone=%s", self.s.timezone)

    def resolve_date(self, client_date: str | None) -> date:
        """Берём локальную дату клиента (если передана и валидна), иначе — дату сервера в APP_TIMEZONE."""
        server = datetime.now(ZoneInfo(self.s.timezone)).date()
        if client_date:
            try:
                parts = client_date.split("-")
                if len(parts) == 3:
                    resolved = date(int(parts[0]), int(parts[1]), int(parts[2]))
                    log.info("[DailyService Date] Client date resolved: client_date=%s -> %s (server_date=%s)",
                             client_date, resolved.isoformat(), server.isoformat())
                    return resolved
            except (ValueError, TypeError) as e:
                log.warning("[DailyService Date Warning] Invalid client_date '%s', falling back to server date %s: %s",
                            client_date, server.isoformat(), e)
        log.info("[DailyService Date] Using server date: %s", server.isoformat())
        return server

    async def _get_by_lang(self, day: date, lang: str):
        key = day.isoformat()
        log.info("[DailyService Get] Requested daily content: date=%s lang=%s", key, lang)

        start_time = time.monotonic()
        saved = self.store.get_daily(key, lang=lang)
        if saved:
            elapsed = time.monotonic() - start_time
            log.info("[DailyService Cache Hit] Found daily content in store: date=%s lang=%s duration=%.3fs",
                     key, lang, elapsed)
            return saved, None

        lock_key = f"{lang}:{key}"
        lock = self._locks.setdefault(lock_key, asyncio.Lock())
        log.info("[DailyService Lock] Acquiring lock for %s", lock_key)
        async with lock:
            saved = self.store.get_daily(key, lang=lang)
            if saved:
                log.info("[DailyService Cache Hit] Found daily content after lock acquisition: date=%s lang=%s", key, lang)
                return saved, None

            log.info("[DailyService Cache Miss] Fetching EPUB brochure and parsing entry: date=%s lang=%s", key, lang)
            # Удаляем брошюры прошлых лет при наступлении нового года
            self.epub_mgr.clean_old_brochures(day.year)

            # Удаляем полностью пройденные выпуски журналов
            self.wt_mgr.clean_completed_magazines(day, lang=lang)

            # Проверяем и скачиваем брошюру следующего года в октябре
            await self.epub_mgr.check_and_fetch_next_year_in_october(day, lang=lang)

            # Подгружаем свежие журналы «Сторожевая башня» начиная с Августа 2026 года
            await self.wt_mgr.check_and_fetch_monthly_magazines(day, lang=lang)

            try:
                fetch_start = time.monotonic()
                epub_path = await self.epub_mgr.fetch_brochure_epub(day.year, lang=lang)
                parsed = self.epub_mgr.parse_entry_from_epub(epub_path, day, lang=lang)

                # Ищем обсуждаемую статью из журнала «Сторожевая башня» для этой недели
                article_data = self.wt_mgr.find_article_for_date(day, lang=lang)

                content = self.build(parsed, key, lang=lang, article_data=article_data)
                total_duration = time.monotonic() - fetch_start
                log.info("[DailyService Build Success] Built daily content: date=%s lang=%s duration=%.3fs (has_article=%s)",
                         key, lang, total_duration, bool(article_data))
            except EpubError as e:
                log.warning("[DailyService EpubError] Failed to fetch or parse EPUB brochure: date=%s lang=%s error=%s",
                            key, lang, e)
                last = self.store.latest_daily(lang=lang)
                if last:
                    stale_notice = f"Не удалось обновить материал ({e}). Показан сохранённый выпуск за {last['date']}."
                    log.info("[DailyService Fallback] Serving latest saved daily fallback: date=%s fallback_date=%s lang=%s",
                             key, last['date'], lang)
                    return last, stale_notice
                log.error("[DailyService Fallback Error] No saved fallback daily content available for lang=%s", lang)
                raise
            except Exception as e:
                log.exception("[DailyService Exception] Unexpected exception in _get_by_lang: date=%s lang=%s error=%s", key, lang, e)
                raise

            self.store.put_daily(key, content, lang=lang)
            log.info("[DailyService Store Put] Saved new daily content to store: date=%s lang=%s", key, lang)
            return content, None

    async def get(self, client_date: str | None = None):
        """-> (content, stale_notice|None) for Russian."""
        day = self.resolve_date(client_date)
        return await self._get_by_lang(day, "ru")

    async def get_spanish(self, client_date: str | None = None):
        """-> (content, stale_notice|None) for Spanish."""
        day = self.resolve_date(client_date)
        return await self._get_by_lang(day, "es")

    async def get_english(self, client_date: str | None = None):
        """-> (content, stale_notice|None) for English."""
        day = self.resolve_date(client_date)
        return await self._get_by_lang(day, "en")

    @staticmethod
    def _to_nodes_block(text_or_block) -> dict:
        if isinstance(text_or_block, dict) and "nodes" in text_or_block:
            return text_or_block
        if isinstance(text_or_block, str):
            return {"nodes": [{"t": "text", "s": text_or_block}]}
        return {"nodes": []}

    @classmethod
    def build(cls, parsed: dict, key: str, lang: str = "ru", article_data: dict | None = None) -> dict:
        verse_raw = parsed.get("verse", "")
        comment_raw = parsed.get("comment", [])
        raw_blocks = [cls._to_nodes_block(verse_raw)] + [cls._to_nodes_block(c) for c in comment_raw]

        blocks, meta, next_id = analyze_blocks(raw_blocks, start_id=0, lang=lang)

        article_res = None
        if article_data and article_data.get("raw_blocks"):
            art_raw = [cls._to_nodes_block(b) for b in article_data["raw_blocks"]]
            art_blocks, art_meta, _ = analyze_blocks(art_raw, start_id=next_id, lang=lang)
            meta.update(art_meta)
            article_res = {
                "title": article_data.get("title", ""),
                "date_label": article_data.get("date_label", ""),
                "comment": art_blocks,
            }

        return {
            "date": key,
            "date_label": parsed["date_label"],
            "title": parsed["title"],
            "verse": blocks[0],
            "comment": blocks[1:],
            "article": article_res,
            "order": priority_order(meta),
            "meta": {str(k): v for k, v in meta.items()},
        }

    def public(self, content: dict, translations: dict, status: str, notice=None) -> dict:
        return {
            "date": content["date"],
            "date_label": content["date_label"],
            "title": content["title"],
            "verse": content["verse"],
            "comment": content["comment"],
            "article": content.get("article"),
            "order": content["order"],
            "meta": {str(k): v for k, v in content.get("meta", {}).items()},
            "translations": {str(k): v for k, v in translations.items()},
            "translations_status": status,
            "notice": notice,
        }

"""Ежедневный материал: загрузка из EPUB брошюр, кэш по дате, откат на последний сохранённый."""
from __future__ import annotations
import asyncio
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo
from .textproc.analyzer import analyze_blocks, priority_order
from .epub import EpubBrochureManager, EpubError


class DailyService:
    def __init__(self, settings, store, translator, epub_manager: EpubBrochureManager | None = None):
        self.s, self.store, self.tr = settings, store, translator
        self.epub_mgr = epub_manager or EpubBrochureManager()
        self._locks: dict[str, asyncio.Lock] = {}

    def resolve_date(self, client_date: str | None) -> date:
        """Берём локальную дату клиента (если передана и валидна), иначе — дату сервера в APP_TIMEZONE."""
        server = datetime.now(ZoneInfo(self.s.timezone)).date()
        if client_date:
            try:
                parts = client_date.split("-")
                if len(parts) == 3:
                    return date(int(parts[0]), int(parts[1]), int(parts[2]))
            except (ValueError, TypeError):
                pass
        return server

    async def _get_by_lang(self, day: date, lang: str):
        key = day.isoformat()
        saved = self.store.get_daily(key, lang=lang)
        if saved:
            return saved, None
        lock = self._locks.setdefault(f"{lang}:{key}", asyncio.Lock())
        async with lock:
            saved = self.store.get_daily(key, lang=lang)
            if saved:
                return saved, None

            # Удаляем брошюры прошлых лет при наступлении нового года
            self.epub_mgr.clean_old_brochures(day.year)

            # Проверяем и скачиваем брошюру следующего года в октябре
            await self.epub_mgr.check_and_fetch_next_year_in_october(day, lang=lang)

            try:
                epub_path = await self.epub_mgr.fetch_brochure_epub(day.year, lang=lang)
                parsed = self.epub_mgr.parse_entry_from_epub(epub_path, day, lang=lang)
                content = self.build(parsed, key, lang=lang)
            except EpubError as e:
                last = self.store.latest_daily(lang=lang)
                if last:
                    return last, f"Не удалось обновить материал ({e}). Показан сохранённый выпуск за {last['date']}."
                raise

            self.store.put_daily(key, content, lang=lang)
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
    def build(cls, parsed: dict, key: str, lang: str = "ru") -> dict:
        verse_raw = parsed.get("verse", "")
        comment_raw = parsed.get("comment", [])
        raw_blocks = [cls._to_nodes_block(verse_raw)] + [cls._to_nodes_block(c) for c in comment_raw]

        blocks, meta, _ = analyze_blocks(raw_blocks, lang=lang)
        return {"date": key, "date_label": parsed["date_label"], "title": parsed["title"],
                "verse": blocks[0], "comment": blocks[1:],
                "order": priority_order(meta), "meta": {str(k): v for k, v in meta.items()}}

    def public(self, content: dict, translations: dict, status: str, notice=None) -> dict:
        return {"date": content["date"], "date_label": content["date_label"], "title": content["title"],
                "verse": content["verse"], "comment": content["comment"], "order": content["order"],
                "meta": {str(k): v for k, v in content.get("meta", {}).items()},
                "translations": {str(k): v for k, v in translations.items()},
                "translations_status": status, "notice": notice}

"""Ежедневный материал: кэш по дате, обновление при смене дня, откат на последний сохранённый."""
from __future__ import annotations
import asyncio
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from .textproc.analyzer import analyze_blocks, priority_order
from .wol.fetcher import WolError, fetch_wol_page
from .wol.parser import parse_wol_page


class DailyService:
    def __init__(self, settings, store, translator, fetch=fetch_wol_page, fetch_spanish=None, fetch_english=None):
        self.s, self.store, self.tr, self.fetch = settings, store, translator, fetch
        self.fetch_spanish = fetch_spanish or (lambda base, day, client=None: fetch_wol_page(base, day, client=client, language="es"))
        self.fetch_english = fetch_english or (lambda base, day, client=None: fetch_wol_page(base, day, client=client, language="en"))
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

    async def _get_by_lang(self, day: date, fetch_fn, base_url: str, lang: str):
        key = day.isoformat()
        saved = self.store.get_daily(key, lang=lang)
        if saved:
            return saved, None
        lock = self._locks.setdefault(f"{lang}:{key}", asyncio.Lock())
        async with lock:
            saved = self.store.get_daily(key, lang=lang)
            if saved:
                return saved, None
            try:
                html = await fetch_fn(base_url, day)
                content = self.build(parse_wol_page(html, day), key, lang=lang)
            except WolError as e:
                last = self.store.latest_daily(lang=lang)
                if last:
                    return last, f"Не удалось обновить материал ({e}). Показан сохранённый выпуск за {last['date']}."
                raise
            self.store.put_daily(key, content, lang=lang)
            return content, None

    async def get(self, client_date: str | None = None):
        """-> (content, stale_notice|None) for Russian WOL."""
        day = self.resolve_date(client_date)
        return await self._get_by_lang(day, self.fetch, self.s.wol_base_url, "ru")

    async def get_spanish(self, client_date: str | None = None):
        """-> (content, stale_notice|None) for Spanish WOL."""
        day = self.resolve_date(client_date)
        return await self._get_by_lang(day, self.fetch_spanish, self.s.es_wol_base_url, "es")

    async def get_english(self, client_date: str | None = None):
        """-> (content, stale_notice|None) for English WOL."""
        day = self.resolve_date(client_date)
        return await self._get_by_lang(day, self.fetch_english, self.s.en_wol_base_url, "en")

    @staticmethod
    def build(parsed: dict, key: str, lang: str = "ru") -> dict:
        blocks, meta, _ = analyze_blocks([parsed["verse"], *parsed["comment"]], lang=lang)
        return {"date": key, "date_label": parsed["date_label"], "title": parsed["title"],
                "verse": blocks[0], "comment": blocks[1:],
                "order": priority_order(meta), "meta": {str(k): v for k, v in meta.items()}}

    def public(self, content: dict, translations: dict, status: str, notice=None) -> dict:
        return {"date": content["date"], "date_label": content["date_label"], "title": content["title"],
                "verse": content["verse"], "comment": content["comment"], "order": content["order"],
                "meta": {str(k): v for k, v in content.get("meta", {}).items()},
                "translations": {str(k): v for k, v in translations.items()},
                "translations_status": status, "notice": notice}

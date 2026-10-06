"""Ежедневный материал: кэш по дате, обновление при смене дня, откат на последний сохранённый."""
from __future__ import annotations
import asyncio
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from .textproc.analyzer import analyze_blocks, priority_order
from .wol.fetcher import WolError, fetch_wol_page
from .wol.parser import parse_wol_page


class DailyService:
    def __init__(self, settings, store, translator, fetch=fetch_wol_page):
        self.s, self.store, self.tr, self.fetch = settings, store, translator, fetch
        self._locks: dict[str, asyncio.Lock] = {}

    def resolve_date(self, client_date: str | None) -> date:
        """Берём локальную дату клиента (если правдоподобна), иначе — дату сервера в APP_TIMEZONE."""
        server = datetime.now(ZoneInfo(self.s.timezone)).date()
        if client_date:
            try:
                d = date.fromisoformat(client_date)
                if abs((d - datetime.now(timezone.utc).date()).days) <= 1:
                    return d
            except ValueError:
                pass
        return server

    async def get(self, client_date: str | None = None):
        """-> (content, stale_notice|None)"""
        day = self.resolve_date(client_date)
        key = day.isoformat()
        saved = self.store.get_daily(key)
        if saved:  # тот же день: без обращения к WOL
            return saved, None
        lock = self._locks.setdefault(key, asyncio.Lock())
        async with lock:
            saved = self.store.get_daily(key)
            if saved:
                return saved, None
            try:
                html = await self.fetch(self.s.wol_base_url, day)
                content = self.build(parse_wol_page(html, day), key)
            except WolError as e:
                last = self.store.latest_daily()
                if last:
                    return last, f"Не удалось обновить материал ({e}). Показан сохранённый выпуск за {last['date']}."
                raise
            self.store.put_daily(key, content)
            return content, None

    @staticmethod
    def build(parsed: dict, key: str) -> dict:
        blocks, meta, _ = analyze_blocks([parsed["verse"], *parsed["comment"]])
        return {"date": key, "date_label": parsed["date_label"], "title": parsed["title"],
                "verse": blocks[0], "comment": blocks[1:],
                "order": priority_order(meta), "meta": {str(k): v for k, v in meta.items()}}

    def public(self, content: dict, translations: dict, status: str, notice=None) -> dict:
        return {"date": content["date"], "date_label": content["date_label"], "title": content["title"],
                "verse": content["verse"], "comment": content["comment"], "order": content["order"],
                "translations": {str(k): v for k, v in translations.items()},
                "translations_status": status, "notice": notice}

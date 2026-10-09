"""Скачивание страницы WOL. Ничего не знает о разметке."""
from __future__ import annotations
import re
from datetime import date
import httpx


def clean_wol_base_url(base_url: str) -> str:
    """Удаляет случайно добавленную дату на конце, например /2026/10/8."""
    return re.sub(r"/\d{4}/\d{1,2}/\d{1,2}/?$", "", base_url.strip().rstrip("/"))


class WolError(Exception):
    """WOL недоступен или вернул неожиданный ответ."""


HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; DailyReader/1.0)", "Accept-Language": "ru"}


async def fetch_wol_page(base_url: str, day: date, client: httpx.AsyncClient | None = None, language: str = "ru") -> str:
    """Страница конкретной даты: .../lp-u/2026/10/6 (формат из навигации самого WOL)."""
    clean_base = clean_wol_base_url(base_url)
    url = f"{clean_base}/{day.year}/{day.month}/{day.day}"
    own = client is None
    headers = {**HEADERS, "Accept-Language": language}
    client = client or httpx.AsyncClient(timeout=15, follow_redirects=True, headers=headers)
    try:
        r = await client.get(url)
        r.raise_for_status()
        return r.text
    except httpx.HTTPError as e:
        raise WolError(f"WOL недоступен: {e}") from e
    finally:
        if own:
            await client.aclose()

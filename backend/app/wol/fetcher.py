"""Скачивание страницы WOL. Ничего не знает о разметке."""
from __future__ import annotations
from datetime import date
import httpx


class WolError(Exception):
    """WOL недоступен или вернул неожиданный ответ."""


HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; DailyReader/1.0)", "Accept-Language": "ru"}


async def fetch_wol_page(base_url: str, day: date, client: httpx.AsyncClient | None = None) -> str:
    # Страница конкретной даты: .../lp-u/2026/10/6 (формат из навигации самого WOL)
    url = f"{base_url}/{day.year}/{day.month}/{day.day}"
    own = client is None
    client = client or httpx.AsyncClient(timeout=15, follow_redirects=True, headers=HEADERS)
    try:
        r = await client.get(url)
        r.raise_for_status()
        return r.text
    except httpx.HTTPError as e:
        raise WolError(f"WOL недоступен: {e}") from e
    finally:
        if own:
            await client.aclose()

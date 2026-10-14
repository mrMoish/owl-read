"""Менеджер журналов «Сторожевая башня (выпуск для изучения)»."""
from __future__ import annotations
import io
import os
import re
import time
import zipfile
import logging
from pathlib import Path
from datetime import date, datetime, timezone
import httpx
from bs4 import BeautifulSoup
from .epub import EpubError

log = logging.getLogger("watchtower_manager")

LANG_MAP = {
    "ru": "U",
    "es": "S",
    "en": "E",
}

RU_MONTHS = {
    "января": 1, "февраля": 2, "марта": 3, "апреля": 4, "мая": 5, "июня": 6,
    "июля": 7, "августа": 8, "сентября": 9, "октября": 10, "ноября": 11, "декабря": 12
}

ES_MONTHS = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12
}

EN_MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12
}


def parse_week_dates(text: str, lang: str = "ru") -> tuple[date, date] | None:
    """Извлекает диапазон дат (start_date, end_date) недели изучения из заголовка статьи."""
    if not text:
        return None
    text_clean = re.sub(r"\s+", " ", text.strip().lower().replace("\xa0", " "))

    if lang == "ru":
        # Шаблон 1: "5—11 ОКТЯБРЯ 2026 ГОДА" (один месяц)
        m1 = re.search(r"(\d{1,2})[\s—–-]+(\d{1,2})\s+([а-я]+)\s+(\d{4})", text_clean)
        if m1 and m1.group(3) in RU_MONTHS:
            d1, d2, m, y = int(m1.group(1)), int(m1.group(2)), RU_MONTHS[m1.group(3)], int(m1.group(4))
            return date(y, m, d1), date(y, m, d2)
        # Шаблон 2: "26 ОКТЯБРЯ — 1 НОЯБРЯ 2026 ГОДА" (смена месяца)
        m2 = re.search(r"(\d{1,2})\s+([а-я]+)[\s—–-]+(\d{1,2})\s+([а-я]+)\s+(\d{4})", text_clean)
        if m2 and m2.group(2) in RU_MONTHS and m2.group(4) in RU_MONTHS:
            d1, m1_val, d2, m2_val, y = int(m2.group(1)), RU_MONTHS[m2.group(2)], int(m2.group(3)), RU_MONTHS[m2.group(4)], int(m2.group(5))
            y1 = y - 1 if m1_val > m2_val else y
            return date(y1, m1_val, d1), date(y, m2_val, d2)

    elif lang == "es":
        # Шаблон 1: "5-11 DE OCTUBRE DE 2026"
        m1 = re.search(r"(\d{1,2})[\s—–-]+(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})", text_clean)
        if m1 and m1.group(3) in ES_MONTHS:
            d1, d2, m, y = int(m1.group(1)), int(m1.group(2)), ES_MONTHS[m1.group(3)], int(m1.group(4))
            return date(y, m, d1), date(y, m, d2)
        # Шаблон 2: "26 DE OCTUBRE-1 DE NOVIEMBRE DE 2026"
        m2 = re.search(r"(\d{1,2})\s+de\s+([a-z]+)[\s—–-]+(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})", text_clean)
        if m2 and m2.group(2) in ES_MONTHS and m2.group(4) in ES_MONTHS:
            d1, m1_val, d2, m2_val, y = int(m2.group(1)), ES_MONTHS[m2.group(2)], int(m2.group(3)), ES_MONTHS[m2.group(4)], int(m2.group(5))
            y1 = y - 1 if m1_val > m2_val else y
            return date(y1, m1_val, d1), date(y, m2_val, d2)

    elif lang == "en":
        # Шаблон 1: "OCTOBER 5-11, 2026"
        m1 = re.search(r"([a-z]+)\s+(\d{1,2})[\s—–-]+(\d{1,2}),?\s+(\d{4})", text_clean)
        if m1 and m1.group(1) in EN_MONTHS:
            m, d1, d2, y = EN_MONTHS[m1.group(1)], int(m1.group(2)), int(m1.group(3)), int(m1.group(4))
            return date(y, m, d1), date(y, m, d2)
        # Шаблон 2: "OCTOBER 26–NOVEMBER 1, 2026"
        m2 = re.search(r"([a-z]+)\s+(\d{1,2})[\s—–-]+([a-z]+)\s+(\d{1,2}),?\s+(\d{4})", text_clean)
        if m2 and m2.group(1) in EN_MONTHS and m2.group(3) in EN_MONTHS:
            m1_val, d1, m2_val, d2, y = EN_MONTHS[m2.group(1)], int(m2.group(2)), EN_MONTHS[m2.group(3)], int(m2.group(4)), int(m2.group(5))
            y1 = y - 1 if m1_val > m2_val else y
            return date(y1, m1_val, d1), date(y, m2_val, d2)

    return None


class WatchtowerManager:
    def __init__(self, storage_dir: Path | str | None = None):
        if storage_dir is None:
            storage_dir = Path("/tmp/owl_brochures")
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self._last_fetch_attempt: dict[str, datetime] = {}
        log.info("[WatchtowerManager] Initialized storage_dir=%s", self.storage_dir)

    def _get_epub_path(self, issue: str, lang: str) -> Path:
        return self.storage_dir / f"w_{issue}_{lang}.epub"

    async def fetch_magazine_epub(self, issue: str, lang: str = "ru", client: httpx.AsyncClient | None = None) -> Path:
        """Скачивает журнал 'Сторожевая башня' за указанный месяц (issue='YYYYMM', например '202608')."""
        dest_path = self._get_epub_path(issue, lang)
        if dest_path.exists() and dest_path.stat().st_size > 0:
            return dest_path

        lang_code = LANG_MAP.get(lang, "U")
        api_url = f"https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS?output=json&pub=w&issue={issue}&fileformat=EPUB&alllangs=0&langwritten={lang_code}"

        close_client = False
        if client is None:
            client = httpx.AsyncClient(timeout=30.0, follow_redirects=True)
            close_client = True

        try:
            res = await client.get(api_url)
            if res.status_code != 200:
                raise EpubError(f"HTTP {res.status_code} при запросе ссылки на журнал w_{issue} ({lang})")

            data = res.json()
            file_url = None
            try:
                files = data["files"][lang_code]["EPUB"]
                if files:
                    file_url = files[0]["file"]["url"]
            except (KeyError, IndexError, TypeError):
                pass

            if not file_url:
                raise EpubError(f"EPUB файл журнала не найден для w_{issue} ({lang})")

            dl_res = await client.get(file_url)
            if dl_res.status_code != 200:
                raise EpubError(f"HTTP {dl_res.status_code} при скачивании файла журнала")

            tmp_path = dest_path.with_suffix(".tmp")
            tmp_path.write_bytes(dl_res.content)
            tmp_path.replace(dest_path)
            log.info("[Watchtower Fetch] Successfully saved magazine w_%s_%s -> %s (%d bytes)",
                     issue, lang, dest_path, dest_path.stat().st_size)
            return dest_path
        finally:
            if close_client:
                await client.aclose()

    async def check_and_fetch_monthly_magazines(self, current_date: date, lang: str = "ru", client: httpx.AsyncClient | None = None):
        """Скачивает журналы начиная с Августа 2026 года (202608) по текущий/следующий месяц."""
        start_year, start_month = 2026, 8
        cur_year, cur_month = current_date.year, current_date.month

        # Формируем список месяцев для проверки (от Августа 2026 до ближайших месяцев)
        months_to_check = []
        y, m = start_year, start_month
        end_target_year, end_target_month = max(cur_year, start_year), cur_month + 1
        if end_target_month > 12:
            end_target_year += 1
            end_target_month = 1

        while (y < end_target_year) or (y == end_target_year and m <= end_target_month):
            issue_str = f"{y:04d}{m:02d}"
            months_to_check.append(issue_str)
            m += 1
            if m > 12:
                m = 1
                y += 1

        now = datetime.now(timezone.utc)
        for issue in months_to_check:
            dest = self._get_epub_path(issue, lang)
            if dest.exists() and dest.stat().st_size > 0:
                continue

            key = f"{issue}:{lang}"
            last_attempt = self._last_fetch_attempt.get(key)
            if last_attempt and (now - last_attempt).total_seconds() < 86400:
                continue

            self._last_fetch_attempt[key] = now
            try:
                await self.fetch_magazine_epub(issue, lang, client=client)
                log.info("[Watchtower Monthly] Downloaded issue %s (%s)", issue, lang)
            except Exception as e:
                log.info("[Watchtower Monthly] Issue %s (%s) not yet available or failed: %s", issue, lang, e)

    def parse_article_from_epub(self, epub_path: Path, day: date, lang: str = "ru") -> dict | None:
        """Находит и извлекает статью для изучения за указанную дату из EPUB журнала."""
        if not epub_path.exists():
            return None

        try:
            with zipfile.ZipFile(epub_path, "r") as z:
                for name in sorted(z.namelist()):
                    if name.endswith(".xhtml") or name.endswith(".html"):
                        content = z.read(name).decode("utf-8", errors="replace")
                        soup = BeautifulSoup(content, "html.parser")
                        header = soup.find(["header", "h1", "h2", "p"])
                        if not header:
                            continue

                        dates = parse_week_dates(header.get_text(), lang)
                        # Игнорируем обложку/содержание, где диапазон охватывает весь месяц (>7 дней)
                        if dates and (dates[1] - dates[0]).days <= 7 and dates[0] <= day <= dates[1]:
                            date_label = header.get_text().strip()
                            title = ""
                            h1_elem = soup.find("h1")
                            if h1_elem:
                                title = h1_elem.get_text().strip()

                            raw_blocks = []
                            for tag in soup.find_all(["h1", "h2", "h3", "p"]):
                                t = tag.get_text().strip()
                                if t and t != date_label:
                                    raw_blocks.append({"nodes": [{"t": "text", "s": t}]})

                            return {
                                "title": title or date_label,
                                "date_label": date_label,
                                "raw_blocks": raw_blocks,
                                "start_date": dates[0].isoformat(),
                                "end_date": dates[1].isoformat(),
                                "issue": epub_path.name.split("_")[1] if "_" in epub_path.name else "",
                            }
        except Exception as e:
            log.warning("[Watchtower Parse Error] Failed to parse %s: %s", epub_path, e)
        return None

    def find_article_for_date(self, day: date, lang: str = "ru") -> dict | None:
        """Ищет статью для даты среди всех скачанных журналов."""
        for epub_path in sorted(self.storage_dir.glob(f"w_*_{lang}.epub")):
            article = self.parse_article_from_epub(epub_path, day, lang)
            if article:
                return article
        return None

    def clean_completed_magazines(self, current_date: date, lang: str = "ru"):
        """Удаляет полностью пройденные выпуски журналов (когда текущая дата превышает последнюю дату изучения журнала)."""
        for epub_path in self.storage_dir.glob(f"w_*_{lang}.epub"):
            try:
                max_end_date: date | None = None
                with zipfile.ZipFile(epub_path, "r") as z:
                    for name in z.namelist():
                        if name.endswith(".xhtml") or name.endswith(".html"):
                            content = z.read(name).decode("utf-8", errors="replace")
                            soup = BeautifulSoup(content, "html.parser")
                            header = soup.find(["header", "h1", "h2", "p"])
                            if header:
                                dates = parse_week_dates(header.get_text(), lang)
                                if dates and (dates[1] - dates[0]).days <= 7:
                                    if max_end_date is None or dates[1] > max_end_date:
                                        max_end_date = dates[1]

                if max_end_date and current_date > max_end_date:
                    epub_path.unlink(missing_ok=True)
                    log.info("[Watchtower Cleanup] Deleted completed magazine: %s (last study date %s < %s)",
                             epub_path.name, max_end_date.isoformat(), current_date.isoformat())
            except Exception as e:
                log.warning("[Watchtower Cleanup Error] Failed to process %s: %s", epub_path, e)

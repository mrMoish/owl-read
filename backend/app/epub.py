"""Менеджер брошюр EPUB «Исследуем Писание каждый день»."""
from __future__ import annotations
import io
import os
import re
import time
import zipfile
import logging
import httpx
from pathlib import Path
from datetime import date, datetime, timezone
from bs4 import BeautifulSoup

log = logging.getLogger("epub_manager")

# Mapping our system lang to JW langwritten parameter
# ru -> U, es -> S, en -> E
LANG_MAP = {
    "ru": "U",
    "es": "S",
    "en": "E",
}

MONTH_NAMES = {
    "ru": ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
    "es": ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
    "en": ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"],
}


class EpubError(Exception):
    pass


class EpubBrochureManager:
    def __init__(self, storage_dir: Path | str | None = None):
        if storage_dir is None:
            storage_dir = Path("/tmp/owl_brochures")
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self._last_october_check: dict[str, datetime] = {}
        log.info("[EPUB Manager] Initialized storage_dir=%s", self.storage_dir)

    def _get_epub_path(self, year: int, lang: str) -> Path:
        yy = str(year)[-2:]
        return self.storage_dir / f"es{yy}_{lang}.epub"

    async def fetch_brochure_epub(self, year: int, lang: str = "ru", client: httpx.AsyncClient | None = None) -> Path:
        dest_path = self._get_epub_path(year, lang)
        if dest_path.exists() and dest_path.stat().st_size > 0:
            log.info("[EPUB Fetch] Cached EPUB file found: year=%d lang=%s path=%s size=%d bytes",
                     year, lang, dest_path, dest_path.stat().st_size)
            return dest_path

        lang_code = LANG_MAP.get(lang, "U")
        yy = str(year)[-2:]
        pub_code = f"es{yy}"
        api_url = f"https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS?output=json&pub={pub_code}&fileformat=EPUB&alllangs=0&langwritten={lang_code}"

        log.info("[EPUB Fetch] Requesting JW media API: year=%d lang=%s lang_code=%s pub_code=%s url=%s",
                 year, lang, lang_code, pub_code, api_url)

        close_client = False
        if client is None:
            client = httpx.AsyncClient(timeout=30.0, follow_redirects=True)
            close_client = True

        start_time = time.monotonic()
        try:
            res = await client.get(api_url)
            elapsed = time.monotonic() - start_time
            log.info("[EPUB Fetch] Media API response: status=%d duration=%.3fs", res.status_code, elapsed)
            if res.status_code != 200:
                err_msg = f"HTTP {res.status_code} при запросе ссылок на брошюру {pub_code} ({lang})"
                log.error("[EPUB Fetch Error] %s", err_msg)
                raise EpubError(err_msg)

            data = res.json()
            file_url = None
            try:
                files = data["files"][lang_code]["EPUB"]
                if files:
                    file_url = files[0]["file"]["url"]
            except (KeyError, IndexError, TypeError) as e:
                log.warning("[EPUB Fetch Warning] Could not parse file URL from API JSON response: %s", e)

            if not file_url:
                err_msg = f"EPUB файл брошюры не найден для {pub_code} ({lang})"
                log.error("[EPUB Fetch Error] %s", err_msg)
                raise EpubError(err_msg)

            log.info("[EPUB Fetch] Downloading EPUB binary from URL: %s", file_url)
            dl_start = time.monotonic()
            dl_res = await client.get(file_url)
            dl_elapsed = time.monotonic() - dl_start
            log.info("[EPUB Fetch] Download completed: status=%d duration=%.3fs content_length=%d",
                     dl_res.status_code, dl_elapsed, len(dl_res.content))

            if dl_res.status_code != 200:
                err_msg = f"HTTP {dl_res.status_code} при скачивании брошюры"
                log.error("[EPUB Fetch Error] %s", err_msg)
                raise EpubError(err_msg)

            # Пишем во временный файл и атомарно переименовываем
            tmp_path = dest_path.with_suffix(".tmp")
            tmp_path.write_bytes(dl_res.content)
            tmp_path.replace(dest_path)
            log.info("[EPUB Fetch Success] Saved EPUB brochure %s (%s) -> %s (size=%d bytes)",
                     pub_code, lang, dest_path, dest_path.stat().st_size)
            return dest_path
        except Exception as e:
            if not isinstance(e, EpubError):
                log.exception("[EPUB Fetch Exception] Unexpected error during fetch_brochure_epub: %s", e)
            raise
        finally:
            if close_client:
                await client.aclose()

    def clean_old_brochures(self, current_year: int):
        """Удаляем брошюры прошлых лет (year < current_year)."""
        log.info("[EPUB Cleanup] Checking old brochures for current_year=%d in storage_dir=%s",
                 current_year, self.storage_dir)
        for file in self.storage_dir.glob("es*.epub"):
            match = re.match(r"es(\d{2})_(\w+)\.epub", file.name)
            if match:
                yy = int(match.group(1))
                year = 2000 + yy
                if year < current_year:
                    try:
                        file.unlink(missing_ok=True)
                        log.info("[EPUB Cleanup] Removed outdated brochure file: %s (year=%d < %d)",
                                 file.name, year, current_year)
                    except Exception as e:
                        log.warning("[EPUB Cleanup Warning] Failed to delete old brochure %s: %s", file.name, e)

    async def check_and_fetch_next_year_in_october(self, current_date: date, lang: str = "ru", client: httpx.AsyncClient | None = None):
        """В октябре каждую неделю попытка скачать брошюру для следующего года."""
        if current_date.month < 10:
            return

        next_year = current_date.year + 1
        dest = self._get_epub_path(next_year, lang)
        if dest.exists() and dest.stat().st_size > 0:
            return

        now = datetime.now(timezone.utc)
        key = f"{next_year}:{lang}"
        last_check = self._last_october_check.get(key)
        if last_check and (now - last_check).total_seconds() < 7 * 86400:
            return

        self._last_october_check[key] = now
        log.info("[EPUB October Check] Attempting to pre-download next year brochure: next_year=%d lang=%s", next_year, lang)
        try:
            await self.fetch_brochure_epub(next_year, lang, client=client)
        except Exception as e:
            log.info("[EPUB October Check] Pre-download for next year %d (%s) not yet available: %s", next_year, lang, e)

    def parse_entry_from_epub(self, epub_path: Path, day: date, lang: str = "ru") -> dict:
        """Извлекает и распарсивает материал за указанную дату из EPUB."""
        log.info("[EPUB Parse] Parsing entry from EPUB: path=%s date=%s lang=%s", epub_path, day.isoformat(), lang)
        if not epub_path.exists():
            err_msg = f"Файл брошюры не существует: {epub_path}"
            log.error("[EPUB Parse Error] %s", err_msg)
            raise EpubError(err_msg)

        start_time = time.monotonic()
        try:
            with zipfile.ZipFile(epub_path, "r") as z:
                files_list = z.namelist()
                log.info("[EPUB Parse] EPUB zip archive opened successfully: total_files=%d", len(files_list))

                day_num = day.day
                month_idx = day.month - 1
                month_names_list = MONTH_NAMES.get(lang, MONTH_NAMES["ru"])
                month_name = month_names_list[month_idx]

                pattern = rf"\b{day_num}\b(?:\s+de)?\s+{re.escape(month_name)}|{re.escape(month_name)}\s+\b{day_num}\b"
                log.info("[EPUB Parse] Searching XHTML split files for date pattern: day=%d month_idx=%d month_name=%s regex=%s",
                         day_num, month_idx, month_name, pattern)

                target_soup = None
                matched_file_name = None

                for name in files_list:
                    if name.endswith(".xhtml") or name.endswith(".html"):
                        content = z.read(name).decode("utf-8", errors="replace")
                        content_lower = content.lower()

                        if month_name in content_lower:
                            soup = BeautifulSoup(content, "html.parser")
                            text = soup.get_text().lower()

                            if re.search(pattern, text):
                                target_soup = soup
                                matched_file_name = name
                                log.info("[EPUB Parse] Found matching XHTML file: %s", matched_file_name)
                                break

                if not target_soup:
                    err_msg = f"Материал за {day.isoformat()} не найден в брошюре (lang={lang})"
                    log.error("[EPUB Parse Error] %s", err_msg)
                    raise EpubError(err_msg)

                # Парсинг структуры заголовок / стих / комментарий
                title = f"{day_num} {month_name.capitalize()}"
                date_label = ""
                header = target_soup.find("header") or target_soup.find(["h1", "h2", "h3"])
                if header:
                    date_label = header.get_text().strip()

                verse_text = ""
                verse_elem = target_soup.find("p", class_=re.compile(r"themeScrp|scrp"))
                if not verse_elem:
                    for p in target_soup.find_all("p"):
                        if p.find("em") or p.find("a"):
                            verse_elem = p
                            break

                if verse_elem:
                    verse_text = verse_elem.get_text().strip()

                comment_paragraphs = []
                body_div = target_soup.find("div", class_=re.compile(r"bodyTxt|pGroup|section"))
                if body_div:
                    for p in body_div.find_all("p"):
                        if p != verse_elem:
                            t = p.get_text().strip()
                            if t:
                                comment_paragraphs.append(t)

                if not comment_paragraphs:
                    for p in target_soup.find_all("p"):
                        if p != verse_elem:
                            t = p.get_text().strip()
                            if t and not (date_label and t in date_label):
                                comment_paragraphs.append(t)

                elapsed = time.monotonic() - start_time
                log.info("[EPUB Parse Success] Successfully parsed entry: file=%s date=%s date_label=%s verse_len=%d paragraphs=%d duration=%.3fs",
                         matched_file_name, day.isoformat(), date_label or title, len(verse_text), len(comment_paragraphs), elapsed)

                return {
                    "date": day.isoformat(),
                    "date_label": date_label or title,
                    "title": title,
                    "verse": verse_text,
                    "comment": comment_paragraphs,
                }

        except zipfile.BadZipFile as e:
            err_msg = f"Поврежденный файл EPUB: {epub_path}"
            log.exception("[EPUB Parse Exception] BadZipFile error reading %s: %s", epub_path, e)
            raise EpubError(err_msg)
        except Exception as e:
            if not isinstance(e, EpubError):
                log.exception("[EPUB Parse Exception] Unexpected error during parse_entry_from_epub: %s", e)
            raise

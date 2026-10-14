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

RU_MONTHS_MAP = {name: i + 1 for i, name in enumerate(MONTH_NAMES["ru"])}
SPANISH_MONTHS_MAP = {name: i + 1 for i, name in enumerate(MONTH_NAMES["es"])}
ENGLISH_MONTHS_MAP = {name: i + 1 for i, name in enumerate(MONTH_NAMES["en"])}


def parse_watchtower_date_range(text: str, default_year: int = 2026, lang: str = "ru") -> tuple[date, date] | None:
    text_clean = text.lower().replace("—", "-").replace("–", "-").replace("\xa0", " ").strip()
    if lang == "ru":
        m1 = re.search(r"(\d+)\s+([а-я]+)\s*-\s*(\d+)\s+([а-я]+)(?:\s+(\d{4}))?", text_clean)
        if m1:
            mo1 = RU_MONTHS_MAP.get(m1.group(2))
            d1 = int(m1.group(1))
            mo2 = RU_MONTHS_MAP.get(m1.group(4))
            d2 = int(m1.group(3))
            yr = int(m1.group(5)) if m1.group(5) else default_year
            if mo1 and mo2:
                s_yr = yr - 1 if mo2 < mo1 and mo1 == 12 else yr
                return date(s_yr, mo1, d1), date(yr, mo2, d2)

        m2 = re.search(r"(\d+)\s*-\s*(\d+)\s+([а-я]+)(?:\s+(\d{4}))?", text_clean)
        if m2:
            d1 = int(m2.group(1))
            d2 = int(m2.group(2))
            mo1 = RU_MONTHS_MAP.get(m2.group(3))
            yr = int(m2.group(4)) if m2.group(4) else default_year
            if mo1:
                return date(yr, mo1, d1), date(yr, mo1, d2)

    elif lang == "es":
        m1 = re.search(r"(\d+)\s+de\s+([a-z]+)\s*(?:-|a)\s*(\d+)\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?", text_clean)
        if m1:
            mo1 = SPANISH_MONTHS_MAP.get(m1.group(2))
            d1 = int(m1.group(1))
            mo2 = SPANISH_MONTHS_MAP.get(m1.group(4))
            d2 = int(m1.group(3))
            yr = int(m1.group(5)) if m1.group(5) else default_year
            if mo1 and mo2:
                s_yr = yr - 1 if mo2 < mo1 and mo1 == 12 else yr
                return date(s_yr, mo1, d1), date(yr, mo2, d2)

        m2 = re.search(r"(\d+)\s*-\s*(\d+)\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?", text_clean)
        if m2:
            d1 = int(m2.group(1))
            d2 = int(m2.group(2))
            mo1 = SPANISH_MONTHS_MAP.get(m2.group(3))
            yr = int(m2.group(4)) if m2.group(4) else default_year
            if mo1:
                return date(yr, mo1, d1), date(yr, mo1, d2)

    elif lang == "en":
        m1 = re.search(r"([a-z]+)\s+(\d+)\s*-\s*([a-z]+)\s+(\d+)(?:,\s*(\d{4}))?", text_clean)
        if m1:
            mo1 = ENGLISH_MONTHS_MAP.get(m1.group(1))
            d1 = int(m1.group(2))
            mo2 = ENGLISH_MONTHS_MAP.get(m1.group(3))
            d2 = int(m1.group(4))
            yr = int(m1.group(5)) if m1.group(5) else default_year
            if mo1 and mo2:
                s_yr = yr - 1 if mo2 < mo1 and mo1 == 12 else yr
                return date(s_yr, mo1, d1), date(yr, mo2, d2)

        m2 = re.search(r"([a-z]+)\s+(\d+)\s*-\s*(\d+)(?:,\s*(\d{4}))?", text_clean)
        if m2:
            mo1 = ENGLISH_MONTHS_MAP.get(m2.group(1))
            d1 = int(m2.group(2))
            d2 = int(m2.group(3))
            yr = int(m2.group(4)) if m2.group(4) else default_year
            if mo1:
                return date(yr, mo1, d1), date(yr, mo1, d2)

    return None


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

                # Ищем заголовок конкретно для запрашиваемого дня, чтобы изолировать блок дня в мультидневных файлах
                title = f"{day_num} {month_name.capitalize()}"
                date_label = ""
                day_container = None

                for candidate_h in target_soup.find_all(["header", "h1", "h2", "h3", "h4", "p"]):
                    cand_text = candidate_h.get_text().strip().lower()
                    if re.search(pattern, cand_text):
                        date_label = candidate_h.get_text().strip()
                        day_container = candidate_h.find_parent(["article", "section", "div"]) or candidate_h.parent
                        break

                search_context = day_container or target_soup

                if not date_label:
                    header = search_context.find("header") or search_context.find(["h1", "h2", "h3"])
                    if header:
                        date_label = header.get_text().strip()

                verse_text = ""
                verse_elem = search_context.find("p", class_=re.compile(r"themeScrp|scrp"))
                if not verse_elem:
                    for p in search_context.find_all("p"):
                        if p.find("em") or p.find("a"):
                            verse_elem = p
                            break

                if verse_elem:
                    verse_text = verse_elem.get_text().strip()

                comment_paragraphs = []
                body_div = search_context.find("div", class_=re.compile(r"bodyTxt|pGroup|section"))
                if body_div:
                    for p in body_div.find_all("p"):
                        if p != verse_elem:
                            t = p.get_text().strip()
                            if t:
                                comment_paragraphs.append(t)

                if not comment_paragraphs:
                    for p in search_context.find_all("p"):
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


class WatchtowerEPUBManager:
    def __init__(self, storage_dir: Path | str | None = None):
        if storage_dir is None:
            storage_dir = Path("/tmp/owl_brochures")
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        log.info("[Watchtower Manager] Initialized storage_dir=%s", self.storage_dir)

    def _get_epub_path(self, issue_code: str, lang: str) -> Path:
        return self.storage_dir / f"w_{lang}_{issue_code}.epub"

    async def fetch_watchtower_epub(self, issue_code: str, lang: str = "ru", client: httpx.AsyncClient | None = None) -> Path:
        dest_path = self._get_epub_path(issue_code, lang)
        if dest_path.exists() and dest_path.stat().st_size > 0:
            log.info("[Watchtower Fetch] Cached EPUB file found: issue=%s lang=%s path=%s", issue_code, lang, dest_path)
            return dest_path

        lang_code = LANG_MAP.get(lang, "U")
        api_url = f"https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS?output=json&pub=w&issue={issue_code}&fileformat=EPUB&alllangs=0&langwritten={lang_code}"

        close_client = False
        if client is None:
            client = httpx.AsyncClient(timeout=30.0, follow_redirects=True)
            close_client = True

        try:
            res = await client.get(api_url)
            if res.status_code != 200:
                raise EpubError(f"HTTP {res.status_code} при запросе ссылок на журнал w ({issue_code}, {lang})")

            data = res.json()
            file_url = None
            try:
                files = data["files"][lang_code]["EPUB"]
                if files:
                    file_url = files[0]["file"]["url"]
            except (KeyError, IndexError, TypeError):
                pass

            if not file_url:
                raise EpubError(f"EPUB файл журнала не найден для w ({issue_code}, {lang})")

            dl_res = await client.get(file_url)
            if dl_res.status_code != 200:
                raise EpubError(f"HTTP {dl_res.status_code} при скачивании журнала")

            tmp_path = dest_path.with_suffix(".tmp")
            tmp_path.write_bytes(dl_res.content)
            tmp_path.replace(dest_path)
            log.info("[Watchtower Fetch Success] Saved EPUB magazine w_%s_%s -> %s", lang, issue_code, dest_path)
            return dest_path
        except Exception as e:
            if not isinstance(e, EpubError):
                log.exception("[Watchtower Fetch Exception] Unexpected error during fetch_watchtower_epub: %s", e)
            raise
        finally:
            if close_client:
                await client.aclose()

    def parse_article_from_epub(self, epub_path: Path, day: date, lang: str = "ru") -> dict | None:
        if not epub_path.exists():
            return None
        try:
            with zipfile.ZipFile(epub_path, "r") as z:
                for name in z.namelist():
                    if name.endswith(".xhtml") and "extracted" not in name:
                        content = z.read(name).decode("utf-8", errors="replace")
                        soup = BeautifulSoup(content, "html.parser")

                        p_context = soup.find("p", class_=re.compile(r"contextTtl"))
                        hdr = p_context or soup.find("header") or soup.find(["h1", "h2"])
                        hdr_text = hdr.get_text().strip() if hdr else ""
                        dr = parse_watchtower_date_range(hdr_text, default_year=day.year, lang=lang)

                        if dr and (dr[1] - dr[0]).days <= 10 and dr[0] <= day <= dr[1]:
                            title = ""
                            for h1 in soup.find_all("h1"):
                                t = h1.get_text().strip()
                                if t:
                                    title = t
                                    break

                            p_theme = soup.find("p", class_=re.compile(r"themeScrp"))
                            theme_scrp = p_theme.get_text().strip() if p_theme else ""

                            paragraphs = []
                            if theme_scrp:
                                paragraphs.append(theme_scrp)

                            for elem in soup.find_all(["h2", "h3", "p"]):
                                cl = " ".join(elem.get("class", []))
                                t = elem.get_text().strip()
                                if not t:
                                    continue
                                if "contextTtl" in cl or "pubRefs" in cl or "extScrpCiteTxt" in cl:
                                    continue
                                if p_theme and elem == p_theme:
                                    continue
                                paragraphs.append(t)

                            return {
                                "title": title or hdr_text,
                                "date_range_label": hdr_text,
                                "start_date": dr[0].isoformat(),
                                "end_date": dr[1].isoformat(),
                                "paragraphs": paragraphs,
                            }
        except Exception as e:
            log.warning("[Watchtower Parse Exception] Error reading %s: %s", epub_path, e)
        return None

    async def get_article_for_date(self, day: date, lang: str = "ru", client: httpx.AsyncClient | None = None) -> dict | None:
        if day < date(2026, 10, 5):
            return None

        y, m = day.year, day.month
        est_m = m - 2
        est_y = y
        if est_m <= 0:
            est_m += 12
            est_y -= 1

        candidate_yms = [
            (est_y, est_m),
            (est_y, est_m - 1 if est_m > 1 else 12),
            (est_y, est_m + 1 if est_m < 12 else 1),
            (est_y, est_m + 2 if est_m < 11 else est_m + 2 - 12),
        ]

        for cy, cm in candidate_yms:
            if cy < 2026 or (cy == 2026 and cm < 8):
                continue
            issue_code = f"{cy}{cm:02d}"
            try:
                epub_path = await self.fetch_watchtower_epub(issue_code, lang=lang, client=client)
                article = self.parse_article_from_epub(epub_path, day, lang=lang)
                if article:
                    return article
            except Exception as e:
                log.info("[Watchtower] Issue %s (%s) not available or error: %s", issue_code, lang, e)
                continue

        return None

    def clean_expired_magazines(self, current_date: date, lang: str = "ru"):
        """при прохождение всего журнала удалять его"""
        for file in self.storage_dir.glob(f"w_{lang}_*.epub"):
            try:
                max_end = None
                with zipfile.ZipFile(file, "r") as z:
                    for name in z.namelist():
                        if name.endswith(".xhtml") and "extracted" not in name:
                            content = z.read(name).decode("utf-8", errors="replace")
                            soup = BeautifulSoup(content, "html.parser")
                            p_context = soup.find("p", class_=re.compile(r"contextTtl"))
                            hdr = p_context or soup.find("header") or soup.find(["h1", "h2"])
                            hdr_text = hdr.get_text().strip() if hdr else ""
                            dr = parse_watchtower_date_range(hdr_text, default_year=current_date.year, lang=lang)
                            if dr:
                                if max_end is None or dr[1] > max_end:
                                    max_end = dr[1]
                if max_end and current_date > max_end:
                    file.unlink(missing_ok=True)
                    log.info("[Watchtower Cleanup] Deleted expired magazine %s (max_end=%s < current_date=%s)",
                             file.name, max_end.isoformat(), current_date.isoformat())
            except Exception as e:
                log.warning("[Watchtower Cleanup Warning] Could not clean file %s: %s", file.name, e)

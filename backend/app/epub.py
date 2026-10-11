"""Менеджер брошюр EPUB «Исследуем Писание каждый день»."""
from __future__ import annotations
import io
import os
import re
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

    def _get_epub_path(self, year: int, lang: str) -> Path:
        yy = str(year)[-2:]
        return self.storage_dir / f"es{yy}_{lang}.epub"

    async def fetch_brochure_epub(self, year: int, lang: str = "ru", client: httpx.AsyncClient | None = None) -> Path:
        dest_path = self._get_epub_path(year, lang)
        if dest_path.exists() and dest_path.stat().st_size > 0:
            return dest_path

        lang_code = LANG_MAP.get(lang, "U")
        yy = str(year)[-2:]
        pub_code = f"es{yy}"
        api_url = f"https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS?output=json&pub={pub_code}&fileformat=EPUB&alllangs=0&langwritten={lang_code}"

        close_client = False
        if client is None:
            client = httpx.AsyncClient(timeout=30.0, follow_redirects=True)
            close_client = True

        try:
            res = await client.get(api_url)
            if res.status_code != 200:
                raise EpubError(f"HTTP {res.status_code} при запросе ссылок на брошюру {pub_code} ({lang})")
            data = res.json()
            file_url = None
            try:
                files = data["files"][lang_code]["EPUB"]
                if files:
                    file_url = files[0]["file"]["url"]
            except (KeyError, IndexError, TypeError):
                pass

            if not file_url:
                raise EpubError(f"EPUB файл брошюры не найден для {pub_code} ({lang})")

            dl_res = await client.get(file_url)
            if dl_res.status_code != 200:
                raise EpubError(f"HTTP {dl_res.status_code} при скачивании брошюры")

            # Пишем во временный файл и атомарно переименовываем
            tmp_path = dest_path.with_suffix(".tmp")
            tmp_path.write_bytes(dl_res.content)
            tmp_path.replace(dest_path)
            log.info(f"Скачана брошюра {pub_code} ({lang}) -> {dest_path}")
            return dest_path
        finally:
            if close_client:
                await client.aclose()

    def clean_old_brochures(self, current_year: int):
        """Удаляем брошюры прошлых лет (year < current_year)."""
        for file in self.storage_dir.glob("es*.epub"):
            match = re.match(r"es(\d{2})_(\w+)\.epub", file.name)
            if match:
                yy = int(match.group(1))
                # Переводим 2-значный год в 4-значный (20xx)
                year = 2000 + yy
                if year < current_year:
                    try:
                        file.unlink(missing_ok=True)
                        log.info(f"Удалена старая брошюра: {file.name}")
                    except Exception as e:
                        log.warning(f"Ошибка при удалении {file.name}: {e}")

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
        try:
            await self.fetch_brochure_epub(next_year, lang, client=client)
        except Exception as e:
            log.info(f"Попытка скачивания брошюры на {next_year} год ({lang}) пока неуспешна: {e}")

    def parse_entry_from_epub(self, epub_path: Path, day: date, lang: str = "ru") -> dict:
        """Извлекает и распарсивает материал за указанную дату из EPUB."""
        if not epub_path.exists():
            raise EpubError(f"Файл брошюры не существует: {epub_path}")

        try:
            with zipfile.ZipFile(epub_path, "r") as z:
                # Поиск XHTML файла для нужного дня
                day_num = day.day
                month_idx = day.month - 1
                month_name = MONTH_NAMES.get(lang, MONTH_NAMES["ru"])[month_idx]

                target_xhtml = None
                target_soup = None

                for name in z.namelist():
                    if name.endswith(".xhtml") or name.endswith(".html"):
                        content = z.read(name).decode("utf-8", errors="replace")
                        if month_name in content.lower():
                            soup = BeautifulSoup(content, "html.parser")
                            text = soup.get_text().lower()
                            # Проверяем наличие номера дня и месяца
                            if f"{day_num} {month_name}" in text or f"{month_name} {day_num}" in text or f"{day_num} {month_name}" in text:
                                target_xhtml = name
                                target_soup = soup
                                break

                if not target_soup:
                    raise EpubError(f"Материал за {day.isoformat()} не найден в брошюре")

                # Парсинг структуры заголовок / стих / комментарий
                title = f"{day_num} {month_name.capitalize()}"
                date_label = ""
                header = target_soup.find("header") or target_soup.find(["h1", "h2", "h3"])
                if header:
                    date_label = header.get_text().strip()

                verse_text = ""
                verse_elem = target_soup.find("p", class_=re.compile(r"themeScrp|scrp"))
                if not verse_elem:
                    # Резервный поиск емфазиса / абзаца со ссылкой
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

                return {
                    "date": day.isoformat(),
                    "date_label": date_label or title,
                    "title": title,
                    "verse": verse_text,
                    "comment": comment_paragraphs,
                }

        except zipfile.BadZipFile:
            raise EpubError(f"Поврежденный файл EPUB: {epub_path}")

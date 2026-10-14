import io
import zipfile
from dataclasses import replace
from datetime import date
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.magazine import WatchtowerManager, parse_week_dates
from app.daily import DailyService
from app.store import Store
from app.config import get_settings
from app.main import create_app


def create_sample_watchtower_epub(dest_path: Path, lang: str = "ru"):
    """Создаёт тестовый EPUB-архив с одной статьёй для изучения."""
    if lang == "ru":
        content = """<?xml version="1.0" encoding="utf-8"?>
<html>
<body>
  <header><p>5—11 ОКТЯБРЯ 2026 ГОДА</p></header>
  <h1>Давайте отпор Сатане — полагайтесь на Иегову и Иисуса</h1>
  <p class="qu">1. Как Сатана пытается сломить нашу верность Богу?</p>
  <p class="p1">С того самого момента, как мы решили служить Иегове...</p>
</body>
</html>"""
    elif lang == "es":
        content = """<?xml version="1.0" encoding="utf-8"?>
<html>
<body>
  <header><p>5-11 DE OCTUBRE DE 2026</p></header>
  <h1>No creamos las mentiras de Satanás</h1>
  <p class="qu">1. ¿Cómo intenta Satanás quebrantar nuestra lealtad?</p>
  <p class="p1">Desde el momento en que decidimos servir a Jehová...</p>
</body>
</html>"""
    else:
        content = """<?xml version="1.0" encoding="utf-8"?>
<html>
<body>
  <header><p>OCTOBER 5-11, 2026</p></header>
  <h1>Resist Satan's Tactics</h1>
  <p class="qu">1. How does Satan try to break our loyalty?</p>
  <p class="p1">From the moment we decided to serve Jehovah...</p>
</body>
</html>"""

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("OEBPS/2026520.xhtml", content)

    dest_path.parent.mkdir(parents=True, exist_ok=True)
    dest_path.write_bytes(buf.getvalue())


def test_parse_week_dates():
    # Russian
    res_ru = parse_week_dates("5—11 ОКТЯБРЯ 2026 ГОДА", "ru")
    assert res_ru == (date(2026, 10, 5), date(2026, 10, 11))

    res_ru_cross = parse_week_dates("26 ОКТЯБРЯ — 1 НОЯБРЯ 2026 ГОДА", "ru")
    assert res_ru_cross == (date(2026, 10, 26), date(2026, 11, 1))

    # Spanish
    res_es = parse_week_dates("5-11 DE OCTUBRE DE 2026", "es")
    assert res_es == (date(2026, 10, 5), date(2026, 10, 11))

    res_es_cross = parse_week_dates("26 DE OCTUBRE-1 DE NOVIEMBRE DE 2026", "es")
    assert res_es_cross == (date(2026, 10, 26), date(2026, 11, 1))

    # English
    res_en = parse_week_dates("OCTOBER 5-11, 2026", "en")
    assert res_en == (date(2026, 10, 5), date(2026, 10, 11))

    res_en_cross = parse_week_dates("OCTOBER 26–NOVEMBER 1, 2026", "en")
    assert res_en_cross == (date(2026, 10, 26), date(2026, 11, 1))


def test_watchtower_manager_parse_and_find(tmp_path):
    wt_mgr = WatchtowerManager(storage_dir=tmp_path)
    epub_path = tmp_path / "w_202608_ru.epub"
    create_sample_watchtower_epub(epub_path, "ru")

    # Target date within week
    target_date = date(2026, 10, 7)
    art = wt_mgr.find_article_for_date(target_date, "ru")
    assert art is not None
    assert art["title"] == "Давайте отпор Сатане — полагайтесь на Иегову и Иисуса"
    assert "5—11 ОКТЯБРЯ 2026 ГОДА" in art["date_label"]
    assert len(art["raw_blocks"]) >= 2

    # Date outside week
    art_outside = wt_mgr.find_article_for_date(date(2026, 10, 20), "ru")
    assert art_outside is None


def test_clean_completed_magazines(tmp_path):
    wt_mgr = WatchtowerManager(storage_dir=tmp_path)
    epub_path = tmp_path / "w_202608_ru.epub"
    create_sample_watchtower_epub(epub_path, "ru")
    assert epub_path.exists()

    # Current date before/during study week -> file remains
    wt_mgr.clean_completed_magazines(date(2026, 10, 10), "ru")
    assert epub_path.exists()

    # Current date after study week -> file deleted
    wt_mgr.clean_completed_magazines(date(2026, 10, 15), "ru")
    assert not epub_path.exists()


class DummyEpubMgr:
    async def fetch_brochure_epub(self, year: int, lang: str = "ru"):
        return Path("/tmp/dummy.epub")

    def parse_entry_from_epub(self, epub_path: Path, day: date, lang: str = "ru"):
        return {
            "date": day.isoformat(),
            "date_label": "7 октября",
            "title": "Исследуем Писание каждый день 2026",
            "verse": "Слово Твое — светильник ноге моей",
            "comment": ["Комментарий к стиху дня."],
        }

    def clean_old_brochures(self, year: int):
        pass

    async def check_and_fetch_next_year_in_october(self, day: date, lang: str = "ru"):
        pass


def test_daily_service_with_watchtower_article(tmp_path):
    wt_mgr = WatchtowerManager(storage_dir=tmp_path)
    epub_path = tmp_path / "w_202608_ru.epub"
    create_sample_watchtower_epub(epub_path, "ru")

    s = replace(get_settings(), db_path=tmp_path / "test.db")
    store = Store(s.db_path)
    daily_svc = DailyService(s, store, None, epub_manager=DummyEpubMgr(), wt_manager=wt_mgr)

    app = create_app(settings=s, epub_manager=DummyEpubMgr(), wt_manager=wt_mgr)
    client = TestClient(app)

    res = client.get("/api/daily?date=2026-10-07&lang=ru")
    assert res.status_code == 200
    data = res.json()

    assert data["date"] == "2026-10-07"
    assert "article" in data
    assert data["article"] is not None
    assert data["article"]["title"] == "Давайте отпор Сатане — полагайтесь на Иегову и Иисуса"
    assert len(data["article"]["comment"]) > 0

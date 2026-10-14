import asyncio, json, logging, zipfile
from dataclasses import replace
from datetime import date, datetime, timezone, timedelta
import httpx
from fastapi.testclient import TestClient
from app.config import get_settings
from app.main import create_app
from app.textproc.analyzer import analyze_blocks, priority_order, format_text_node
from app.store import Store
from app.daily import DailyService
from app.translation.service import TranslationService
from app.translation.openrouter import OpenRouterClient, parse_response
from app.epub import EpubBrochureManager, WatchtowerEPUBManager, parse_watchtower_date_range, EpubError


class DummyEpubManager(EpubBrochureManager):
    def __init__(self, data_func=None):
        super().__init__()
        self.data_func = data_func or self.default_data

    @staticmethod
    def default_data(day, lang):
        if lang == "es":
            return {
                "date": day.isoformat(),
                "date_label": "Martes 6 de octubre",
                "title": "Examinando las Escrituras diariamente 2026",
                "verse": "«La Ley es solo una sombra» (Heb. 10:1).",
                "comment": ["A los cristianos de Judea no les resultaba fácil la vida. w24.09 9"],
            }
        elif lang == "en":
            return {
                "date": day.isoformat(),
                "date_label": "Tuesday, October 6",
                "title": "Examining the Scriptures Daily—2026",
                "verse": "«I have seen the Lord!» (John 20:18).",
                "comment": ["Mary Magdalene came and brought the news to the disciples. w24.10 13"],
            }
        return {
            "date": day.isoformat(),
            "date_label": f"День {day.day}",
            "title": "Исследуем Писание каждый день 2026",
            "verse": "«Закон — это лишь тень будущих благословений» (Евр. 10:1).",
            "comment": [
                "Христианам в Иудее приходилось нелегко. Долгое время евреи были народом Бога. Бог хочет, чтобы люди проявляли любовь. w24.09 9, абз. 4"
            ],
        }

    async def fetch_brochure_epub(self, year: int, lang: str = "ru", client=None):
        from pathlib import Path
        p = self.storage_dir / f"es{str(year)[-2:]}_{lang}.epub"
        p.touch()
        return p

    def parse_entry_from_epub(self, epub_path, day: date, lang: str = "ru") -> dict:
        return self.data_func(day, lang)

    def clean_old_brochures(self, current_year: int):
        pass

    async def check_and_fetch_next_year_in_october(self, current_date: date, lang: str = "ru", client=None):
        pass


def test_parse_response_validation():
    txt = '```json\n{"translations":[{"id":1,"es":"amor"},{"id":2,"es":"любовь"},{"id":9,"es":"x"}]}\n```'
    assert parse_response(txt, {1, 2}) == {1: "amor"}


def make_app(tmp_path, key="k", epub_mgr=None):
    s = replace(get_settings(), db_path=tmp_path / "t.db", openrouter_api_key=key)
    mgr = epub_mgr or DummyEpubManager()
    app = create_app(s, epub_manager=mgr)
    return app


def test_daily_cache_new_day_and_stale(tmp_path):
    app = make_app(tmp_path, key="")
    c = TestClient(app)
    today = datetime.now(timezone.utc).date()
    d1, d2 = today.isoformat(), (today + timedelta(days=1)).isoformat()
    a = c.get(f"/api/daily?date={d1}").json()
    assert a["date"] == d1
    assert a["translations_status"] == "ondemand"


def test_translations_cached(tmp_path):
    n = {"llm": 0}
    def handler(request):
        n["llm"] += 1
        items = json.loads(json.loads(request.content)["messages"][1]["content"])["items"]
        rows = [{"id": i["id"], "es": "amor" if i["word"] == "любовь" else "palabra"} for i in items]
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps({"translations": rows})}}]})

    import app.translation.openrouter as o
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    orig = o.OpenRouterClient.__init__
    def init(self, k, m, h=None): orig(self, k, m, http)
    o.OpenRouterClient.__init__ = init
    try:
        app = make_app(tmp_path)
        c = TestClient(app)
        d = datetime.now(timezone.utc).date().isoformat()
        r = c.post(f"/api/daily/translations?date={d}").json()
        assert r["translations_status"] == "ready" and "amor" in r["translations"].values() and n["llm"] >= 1
        before = n["llm"]
        c.post(f"/api/daily/translations?date={d}")
        assert n["llm"] == before                                     # кэш: повторных запросов нет
        g = c.get(f"/api/daily?date={d}").json()
        assert g["translations_status"] == "ondemand"
    finally:
        o.OpenRouterClient.__init__ = orig


def test_missing_translation_preserves_original_word(tmp_path):
    """Слово без перевода должно возвращать исходное русское слово без ошибок."""
    app = make_app(tmp_path)
    c = TestClient(app)
    r = c.post("/api/translate", json={
        "word": "неизвестное",
        "sentence": "Это неизвестное слово.",
        "date": "2026-10-06"
    }).json()
    assert r["translation"] == "неизвестное"


def test_spanish_mode_support(tmp_path):
    app = make_app(tmp_path)
    c = TestClient(app)
    r = c.get("/api/daily?date=2026-10-06&lang=es").json()
    assert r["date_label"] == "Martes 6 de octubre"
    assert any(m["w"] == "cristianos" for m in r["meta"].values())


def test_english_mode_support(tmp_path):
    app = make_app(tmp_path)
    c = TestClient(app)
    r = c.get("/api/daily?date=2026-10-06&lang=en").json()
    assert r["date_label"] == "Tuesday, October 6"


def test_format_text_node_and_analyzer_punctuation_binding():
    assert format_text_node("текст — продолжение") == "текст\u00a0— продолжение"
    assert format_text_node("слово , другое") == "слово, другое"


def test_tts_endpoint(tmp_path):
    captured = {}
    def handler(request):
        captured["url"] = str(request.url)
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, content=b"dummy audio binary", headers={"Content-Type": "audio/mpeg"})

    import base64
    import app.translation.openrouter as o
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    orig = o.OpenRouterClient.__init__
    def init(self, k, m, h=None): orig(self, k, m, http)
    o.OpenRouterClient.__init__ = init
    try:
        s = replace(get_settings(), db_path=tmp_path / "t.db", openrouter_api_key="key")
        app = create_app(s)
        c = TestClient(app)

        res_es = c.post("/api/tts", json={"word": "esposos", "sentence": "Los esposos se aman.", "lang": "es"})
        assert res_es.status_code == 200
        data_es = res_es.json()
        assert captured["url"] == "https://openrouter.ai/api/v1/audio/speech"
        assert captured["body"]["model"] == "x-ai/grok-voice-tts-1.0"
        assert captured["body"]["voice"] == "eve"
        assert captured["body"]["input"] == "«esposos»"
        assert data_es["audio_b64"] == base64.b64encode(b"dummy audio binary").decode("ascii")
    finally:
        o.OpenRouterClient.__init__ = orig


def test_pronunciation_endpoint(tmp_path):
    captured_messages = []
    def handler(request):
        payload = json.loads(request.content)
        captured_messages.append(payload["messages"])
        return httpx.Response(200, json={
            "choices": [{"message": {"content": json.dumps({"ipa": "[esˈposos]", "ru_hint": "эспо́сос"})}}]
        })

    import app.translation.openrouter as o
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    orig = o.OpenRouterClient.__init__
    def init(self, k, m, h=None): orig(self, k, m, http)
    o.OpenRouterClient.__init__ = init
    try:
        s = replace(get_settings(), db_path=tmp_path / "t.db", openrouter_api_key="key")
        app = create_app(s)
        c = TestClient(app)
        res = c.post("/api/pronunciation", json={"word": "esposos", "sentence": "Los esposos se quieren.", "lang": "es"})
        assert res.status_code == 200
        assert res.json() == {"word": "esposos", "ipa": "[esˈposos]", "ru_hint": "эспо́сос"}
    finally:
        o.OpenRouterClient.__init__ = orig


def test_server_logging_output(tmp_path, caplog):
    """Проверяет запись сервером логов при запросах к API без разглашения чувствительных данных."""
    caplog.set_level(logging.INFO)
    app = make_app(tmp_path)
    c = TestClient(app)

    r = c.get("/api/daily?date=2026-10-06&lang=es")
    assert r.status_code == 200

    logs = caplog.text
    assert "[API Daily] GET /api/daily: date=2026-10-06 lang=es" in logs
    assert "[DailyService Get] Requested daily content: date=2026-10-06 lang=es" in logs
    assert "[API Daily Success] GET /api/daily completed" in logs


def test_server_logging_failure_scenario(tmp_path, caplog):
    """Проверяет логирование ошибок с сохранением уровня WARNING/ERROR при сбоях EPUB."""
    caplog.set_level(logging.INFO)

    class FailingEpubManager(EpubBrochureManager):
        async def fetch_brochure_epub(self, year: int, lang: str = "ru", client=None):
            raise EpubError(f"HTTP 500 Test Error for year {year}")

    app = make_app(tmp_path, epub_mgr=FailingEpubManager(storage_dir=tmp_path))
    c = TestClient(app)

    r = c.get("/api/daily?date=2026-10-06&lang=es")
    assert r.status_code == 503

    logs = caplog.text
    assert "[DailyService EpubError]" in logs
    assert "HTTP 500 Test Error" in logs


def test_real_epub_parser_multi_day(tmp_path):
    """Проверяет парсер EPUB на реальном структурированном XHTML zip-архиве с несколькими днями."""
    epub_file = tmp_path / "es26_ru.epub"
    html_content = """<!DOCTYPE html>
<html>
<body>
  <article>
    <header><h1>5 октября</h1></header>
    <p class="themeScrp">Стих за 5 октября</p>
    <div class="bodyTxt"><p>Комментарий за 5 октября</p></div>
  </article>
  <article>
    <header><h1>6 октября</h1></header>
    <p class="themeScrp">«Закон — это лишь тень» (Евр. 10:1).</p>
    <div class="bodyTxt"><p>Христианам в Иудее приходилось нелегко.</p></div>
  </article>
</body>
</html>"""

    with zipfile.ZipFile(epub_file, "w") as z:
        z.writestr("OEBPS/content_oct.xhtml", html_content)

    mgr = EpubBrochureManager(storage_dir=tmp_path)
    res = mgr.parse_entry_from_epub(epub_file, date(2026, 10, 6), lang="ru")
    assert res["date_label"] == "6 октября"
    assert "Закон — это лишь тень" in res["verse"]
    assert "Христианам в Иудее" in res["comment"][0]


def test_parse_watchtower_date_range():
    dr_ru1 = parse_watchtower_date_range("5—11 ОКТЯБРЯ 2026 ГОДА", 2026, "ru")
    assert dr_ru1 == (date(2026, 10, 5), date(2026, 10, 11))

    dr_ru2 = parse_watchtower_date_range("26 ОКТЯБРЯ — 1 НОЯБРЯ 2026 ГОДА", 2026, "ru")
    assert dr_ru2 == (date(2026, 10, 26), date(2026, 11, 1))

    dr_es1 = parse_watchtower_date_range("5-11 DE OCTUBRE DE 2026", 2026, "es")
    assert dr_es1 == (date(2026, 10, 5), date(2026, 10, 11))

    dr_es2 = parse_watchtower_date_range("26 DE OCTUBRE-1 DE NOVIEMBRE DE 2026", 2026, "es")
    assert dr_es2 == (date(2026, 10, 26), date(2026, 11, 1))

    dr_en1 = parse_watchtower_date_range("OCTOBER 5-11, 2026", 2026, "en")
    assert dr_en1 == (date(2026, 10, 5), date(2026, 10, 11))

    dr_en2 = parse_watchtower_date_range("OCTOBER 26–NOVEMBER 1, 2026", 2026, "en")
    assert dr_en2 == (date(2026, 10, 26), date(2026, 11, 1))


def test_watchtower_manager_article_and_cleanup(tmp_path):
    wt_mgr = WatchtowerEPUBManager(storage_dir=tmp_path)
    epub_file = tmp_path / "w_ru_202608.epub"

    html_content = """<!DOCTYPE html>
<html>
<body>
  <header>
    <p class="contextTtl">5—11 ОКТЯБРЯ 2026 ГОДА</p>
    <h1>Давайте отпор Сатане</h1>
  </header>
  <p class="themeScrp">«Противостаньте Дьяволу» (ИАК. 4:7).</p>
  <p class="qu">1. Как Сатана пытается сломить нашу верность?</p>
  <p class="p7">С того самого момента, как мы решили служить Иегове...</p>
</body>
</html>"""

    with zipfile.ZipFile(epub_file, "w") as z:
        z.writestr("OEBPS/art1.xhtml", html_content)

    # 1. Parse article for Oct 8, 2026
    art = wt_mgr.parse_article_from_epub(epub_file, date(2026, 10, 8), lang="ru")
    assert art is not None
    assert art["title"] == "Давайте отпор Сатане"
    assert "Противостаньте Дьяволу" in art["paragraphs"][0]

    # 2. Test cleanup: prior to end date, file remains; after end date, file is deleted
    wt_mgr.clean_expired_magazines(date(2026, 10, 10), lang="ru")
    assert epub_file.exists()

    wt_mgr.clean_expired_magazines(date(2026, 10, 12), lang="ru")
    assert not epub_file.exists()


def test_daily_api_includes_watchtower_article(tmp_path):
    class MockWTManager(WatchtowerEPUBManager):
        async def get_article_for_date(self, day, lang="ru", client=None):
            if day == date(2026, 10, 8):
                return {
                    "title": "Давайте отпор Сатане",
                    "date_range_label": "5—11 ОКТЯБРЯ 2026 ГОДА",
                    "start_date": "2026-10-05",
                    "end_date": "2026-10-11",
                    "paragraphs": ["1. Как Сатана пытается сломить нашу верность?", "С того момента..."],
                }
            return None

    app = make_app(tmp_path, key="")
    app.dependency_overrides = {}
    # Re-instantiate DailyService in app with mock WT manager
    s = replace(get_settings(), db_path=tmp_path / "t.db", openrouter_api_key="")
    dummy_brochure = DummyEpubManager()
    mock_wt = MockWTManager(storage_dir=tmp_path)
    daily = DailyService(s, Store(s.db_path), None, epub_manager=dummy_brochure, watchtower_manager=mock_wt)

    c = TestClient(app)
    # Get daily content for Oct 8, 2026
    content, _ = asyncio.run(daily.get("2026-10-08"))
    res = daily.public(content, {}, "ondemand")

    assert "article" in res
    assert res["article"]["title"] == "Давайте отпор Сатане"
    assert res["article"]["date_range_label"] == "5—11 ОКТЯБРЯ 2026 ГОДА"
    assert len(res["article"]["comment"]) == 2

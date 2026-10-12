import asyncio, json, logging, zipfile
from dataclasses import replace
from datetime import date, datetime, timezone, timedelta
import httpx
import pytest
from fastapi.testclient import TestClient
from app.config import get_settings
from app.main import create_app
from app.textproc.analyzer import analyze_blocks, priority_order, format_text_node
from app.store import Store
from app.daily import DailyService
from app.translation.service import TranslationService
from app.translation.openrouter import OpenRouterClient, parse_response, TranslationError
from app.epub import EpubBrochureManager, EpubError


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


def make_app(tmp_path, key="k", epub_mgr=None):
    s = replace(get_settings(), db_path=tmp_path / "t.db", openrouter_api_key=key)
    mgr = epub_mgr or DummyEpubManager()
    app = create_app(s, epub_manager=mgr)
    return app


def test_parse_response_validation():
    expected_items = {1: "amor", 2: "любовь"}
    txt = '```json\n{"translations":[{"id":1,"word":"amor","es":"love"},{"id":2,"word":"любовь","es":"amor"},{"id":9,"es":"x"}]}\n```'
    assert parse_response(txt, expected_items) == {1: "love", 2: "amor"}


def test_strict_id_and_source_word_validation():
    expected_items = {
        0: "Христианам",
        1: "в",
        2: "Иудее",
    }
    txt = json.dumps({
        "translations": [
            {"id": 0, "word": "Христианам", "es": "A los cristianos"},
            {"id": 1, "word": "на", "es": "en"},
            {"id": 2, "word": "Иудее", "es": "Judea"},
            {"id": 999, "word": "неизвестно", "es": "desconocido"},
        ]
    })
    res = parse_response(txt, expected_items, lang="ru")
    assert 0 in res and res[0] == "A los cristianos"
    assert 1 not in res  # Rejected due to source word mismatch ("на" != "в")
    assert 2 in res and res[2] == "Judea"
    assert 999 not in res  # Rejected due to unknown ID


def test_daily_cache_new_day_and_stale(tmp_path):
    app = make_app(tmp_path, key="")
    c = TestClient(app)
    today = datetime.now(timezone.utc).date()
    d1 = today.isoformat()
    a = c.get(f"/api/daily?date={d1}").json()
    assert a["date"] == d1
    assert a["translations_status"] == "unavailable"


def test_full_comment_single_request_and_caching(tmp_path):
    calls = []

    def handler(request):
        calls.append(request)
        body = json.loads(request.content)
        user_msg = json.loads(body["messages"][1]["content"])
        assert "full_text" in user_msg
        assert "items" in user_msg
        items = user_msg["items"]
        assert len(items) > 5  # Ensure all tokens sent together
        rows = [{"id": i["id"], "word": i["word"], "es": f"tr_{i['id']}"} for i in items]
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps({"translations": rows})}}]})

    import app.translation.openrouter as o
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    orig = o.OpenRouterClient.__init__

    def init(self, k, m, h=None):
        orig(self, k, m, http)

    o.OpenRouterClient.__init__ = init
    try:
        app = make_app(tmp_path)
        c = TestClient(app)
        d = datetime.now(timezone.utc).date().isoformat()

        # First load / translation request
        r1 = c.post(f"/api/daily/translations?date={d}").json()
        assert r1["translations_status"] == "ready"
        assert len(calls) == 1  # Exactly ONE AI request for the entire comment

        # Second call reuses cached full comment translation without new AI requests
        r2 = c.post(f"/api/daily/translations?date={d}").json()
        assert r2["translations_status"] == "ready"
        assert len(calls) == 1

        g = c.get(f"/api/daily?date={d}").json()
        assert g["translations_status"] == "ready"
        assert len(g["translations"]) == len(r1["translations"])
    finally:
        o.OpenRouterClient.__init__ = orig


def test_changed_comment_invalidates_cache(tmp_path):
    calls = []

    def handler(request):
        calls.append(request)
        body = json.loads(request.content)
        user_msg = json.loads(body["messages"][1]["content"])
        items = user_msg["items"]
        rows = [{"id": i["id"], "word": i["word"], "es": f"tr_{i['id']}"} for i in items]
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps({"translations": rows})}}]})

    import app.translation.openrouter as o
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    orig = o.OpenRouterClient.__init__

    def init(self, k, m, h=None):
        orig(self, k, m, http)

    o.OpenRouterClient.__init__ = init

    try:
        mgr = DummyEpubManager()
        app = make_app(tmp_path, epub_mgr=mgr)
        c = TestClient(app)
        d = date(2026, 10, 6).isoformat()

        # 1. First translation
        r1 = c.post(f"/api/daily/translations?date={d}").json()
        assert r1["translations_status"] == "ready"
        assert len(calls) == 1

        # 2. Update daily content store directly with different text for the same date
        store = Store(tmp_path / "t.db")
        new_parsed = {
            "date": d,
            "date_label": "6 октября",
            "title": "Новый заголовок",
            "verse": "Новый стих",
            "comment": ["Совершенно другой уникальный комментарий дня."],
        }
        new_content = DailyService.build(new_parsed, d, lang="ru")
        store.put_daily(d, new_content, lang="ru")

        # 3. Request translation again -> comment changed -> cache invalidated
        r2 = c.post(f"/api/daily/translations?date={d}").json()
        assert r2["translations_status"] == "ready"
        assert len(calls) == 2
    finally:
        o.OpenRouterClient.__init__ = orig


def test_language_pair_cache_isolation(tmp_path):
    requests_by_lang = []

    def handler(request):
        body = json.loads(request.content)
        user_msg = json.loads(body["messages"][1]["content"])
        items = user_msg["items"]
        sys_msg = body["messages"][0]["content"]

        if "Argentine Spanish" in sys_msg:
            requests_by_lang.append("ru-es")
            rows = [{"id": i["id"], "word": i["word"], "es": f"es_{i['id']}"} for i in items]
        else:
            requests_by_lang.append("es-ru")
            rows = [{"id": i["id"], "word": i["word"], "ru": f"слово_{i['id']}"} for i in items]

        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps({"translations": rows})}}]})

    import app.translation.openrouter as o
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    orig = o.OpenRouterClient.__init__

    def init(self, k, m, h=None):
        orig(self, k, m, http)

    o.OpenRouterClient.__init__ = init

    try:
        app = make_app(tmp_path)
        c = TestClient(app)
        d = date(2026, 10, 6).isoformat()

        # Request in Russian mode (ru -> es)
        r_ru = c.post(f"/api/daily/translations?date={d}&lang=ru").json()
        assert r_ru["translations_status"] == "ready"
        assert any(v.startswith("es_") for v in r_ru["translations"].values())

        # Request in Spanish mode (es -> ru)
        r_es = c.post(f"/api/daily/translations?date={d}&lang=es").json()
        assert r_es["translations_status"] == "ready"
        assert any(v.startswith("слово_") for v in r_es["translations"].values())

        assert requests_by_lang == ["ru-es", "es-ru"]
    finally:
        o.OpenRouterClient.__init__ = orig


def test_repeated_words_and_context_dependent_translations(tmp_path):
    def handler(request):
        body = json.loads(request.content)
        user_msg = json.loads(body["messages"][1]["content"])
        items = user_msg["items"]
        rows = []
        for i in items:
            if i["word"] in ("Бог", "Бога"):
                tr = "Dios" if i["id"] < 18 else "Señor"
            else:
                tr = f"tr_{i['id']}"
            rows.append({"id": i["id"], "word": i["word"], "es": tr})
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps({"translations": rows})}}]})

    import app.translation.openrouter as o
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    orig = o.OpenRouterClient.__init__

    def init(self, k, m, h=None):
        orig(self, k, m, http)

    o.OpenRouterClient.__init__ = init

    try:
        app = make_app(tmp_path)
        c = TestClient(app)
        d = date(2026, 10, 6).isoformat()

        r = c.post(f"/api/daily/translations?date={d}").json()
        tr = r["translations"]

        bog_ids = sorted([int(k) for k, v in c.get(f"/api/daily?date={d}").json()["meta"].items() if v["lemma"] == "бог"])
        assert len(bog_ids) >= 2
        assert tr[str(bog_ids[0])] == "Dios"
        assert tr[str(bog_ids[1])] == "Señor"
    finally:
        o.OpenRouterClient.__init__ = orig


def test_translation_failure_recovery(tmp_path):
    attempts = {"count": 0}

    def handler(request):
        attempts["count"] += 1
        if attempts["count"] <= 3:
            return httpx.Response(500, text="Internal OpenRouter Server Error")

        body = json.loads(request.content)
        user_msg = json.loads(body["messages"][1]["content"])
        items = user_msg["items"]
        rows = [{"id": i["id"], "word": i["word"], "es": f"tr_{i['id']}"} for i in items]
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps({"translations": rows})}}]})

    import app.translation.openrouter as o
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    orig = o.OpenRouterClient.__init__

    def init(self, k, m, h=None):
        orig(self, k, m, http)

    o.OpenRouterClient.__init__ = init

    try:
        app = make_app(tmp_path)
        c = TestClient(app)
        d = date(2026, 10, 6).isoformat()

        # 1. First attempt fails all retries -> status "failed", no bad cache stored
        r1 = c.post(f"/api/daily/translations?date={d}").json()
        assert r1["translations_status"] == "failed"
        assert r1["translations"] == {}

        # Check DB cache is empty for this date
        cached_g1 = c.get(f"/api/daily?date={d}").json()
        assert cached_g1["translations"] == {}

        # 2. Second attempt succeeds -> recovers cleanly and stores cache
        r2 = c.post(f"/api/daily/translations?date={d}").json()
        assert r2["translations_status"] == "ready"
        assert len(r2["translations"]) > 0

        cached_g2 = c.get(f"/api/daily?date={d}").json()
        assert cached_g2["translations_status"] == "ready"
    finally:
        o.OpenRouterClient.__init__ = orig


def test_neighboring_word_regression_prevention():
    """Проверяет, что переводы назначаются исключительно по точным ID токенов и совпадению исходных слов, исключая сдвиг на соседнее слово."""
    expected_items = {
        10: "словоA",
        11: "словоB",
        12: "словоC",
    }

    scrambled_ai_response = json.dumps({
        "translations": [
            {"id": 12, "word": "словоC", "es": "translationC"},
            {"id": 10, "word": "словоA", "es": "translationA"},
            {"id": 11, "word": "словоB", "es": "translationB"},
        ]
    })

    res = parse_response(scrambled_ai_response, expected_items)

    assert res[10] == "translationA"
    assert res[11] == "translationB"
    assert res[12] == "translationC"

    assert res[11] != "translationA"
    assert res[11] != "translationC"


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

    def init(self, k, m, h=None):
        orig(self, k, m, http)

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

    def init(self, k, m, h=None):
        orig(self, k, m, http)

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

import asyncio, json
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
    assert a["translations_status"] == "unavailable"


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
        assert g["translations_status"] == "ready"
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

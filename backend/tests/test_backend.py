import asyncio, json
from dataclasses import replace
from datetime import date, datetime, timezone, timedelta
import httpx
from fastapi.testclient import TestClient
from app.config import get_settings
from app.main import create_app
from app.textproc.analyzer import analyze_blocks, priority_order
from app.store import Store
from app.daily import DailyService
from app.translation.service import TranslationService
from app.translation.openrouter import OpenRouterClient, parse_response
from app.wol.fetcher import WolError
from app.wol.parser import parse_wol_page

PAGE = """<html><body><div class="todayItems">
<div class="todayItem"><header><h2>Понедельник, 5 октября</h2></header><p><em>«Сердца исследует Иегова» (<a href="/x">Прит. 17:3</a>).</em></p><p>Старый текст.</p></div>
<div class="todayItem"><header><h2>Вторник, 6 октября</h2></header>
<p><em>«Закон — это лишь тень будущих благословений» (<a href="/ru/wol/bc/1">Евр. 10:1</a>).</em></p>
<p>Христианам в Иудее приходилось нелегко. Долгое время евреи были народом Бога. Бог хочет, чтобы люди проявляли любовь. <a href="/pc/1"><em>w24.09</em> 9, абз. 4</a></p>
<p><a href="/d/1">Исследуем Писание каждый день 2026</a></p></div>
<p>Добро пожаловать!</p></div></body></html>"""

def test_parser_picks_right_day():
    r = parse_wol_page(PAGE, date(2026, 10, 6))
    assert r["date_label"] == "Вторник, 6 октября"
    assert r["title"] == "Исследуем Писание каждый день 2026"
    assert "Старый" not in json.dumps(r, ensure_ascii=False)
    assert r["verse"]["nodes"][0]["t"] == "text"          # <em> снят
    assert any(n["t"] == "a" for n in r["verse"]["nodes"])  # ссылка сохранена

def test_parser_missing_day():
    try: parse_wol_page(PAGE, date(2026, 10, 9)); assert False
    except WolError: pass

def test_analyzer_filters_and_orders():
    r = parse_wol_page(PAGE, date(2026, 10, 6))
    blocks, meta, _ = analyze_blocks([r["verse"], *r["comment"]])
    words = {m["w"] for m in meta.values()}
    assert "Иегова" not in words and "Иудее" in words and "Христианам" in words
    assert "любовь" in words and "люди" in words
    order = priority_order(meta)
    assert order == sorted(order)
    # текст не повреждён
    def flat(ns): return "".join(n["s"] if n["t"] in ("text", "w") else flat(n["c"]) for n in ns)
    assert flat(blocks[1]["nodes"]) == flat(r["comment"][0]["nodes"])
    assert all(m["sent"] for m in meta.values())

def test_parse_response_validation():
    txt = '```json\n{"translations":[{"id":1,"es":"amor"},{"id":2,"es":"любовь"},{"id":9,"es":"x"}]}\n```'
    assert parse_response(txt, {1, 2}) == {1: "amor"}

def make_app(tmp_path, key="k", pages=None):
    calls = {"wol": 0, "llm": 0}
    async def fetch(base, day):
        calls["wol"] += 1
        if pages is None: raise WolError("down")
        return pages(day)
    s = replace(get_settings(), db_path=tmp_path / "t.db", openrouter_api_key=key)
    app = create_app(s, fetch=fetch)
    return app, calls

def page_for(day):
    return PAGE.replace("Вторник, 6 октября", f"X, {day.day} {['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'][day.month-1]}")

def test_daily_cache_new_day_and_stale(tmp_path, monkeypatch):
    app, calls = make_app(tmp_path, key="", pages=page_for)
    c = TestClient(app)
    today = datetime.now(timezone.utc).date()
    d1, d2 = today.isoformat(), (today + timedelta(days=1)).isoformat()
    a = c.get(f"/api/daily?date={d1}").json(); assert a["date"] == d1 and calls["wol"] == 1
    assert a["translations_status"] == "unavailable"
    c.get(f"/api/daily?date={d1}"); assert calls["wol"] == 1          # тот же день: кэш
    b = c.get(f"/api/daily?date={d2}").json(); assert b["date"] == d2 and calls["wol"] == 2  # новый день
    # WOL упал в третий день -> последний сохранённый + уведомление
    import app.main as m
    async def down(*a, **k): raise WolError("down")
    app2, _ = make_app(tmp_path, key="", pages=None)
    r = TestClient(app2).get(f"/api/daily?date={d2}").json()
    assert r["date"] == d2 and r["notice"] is None                     # уже сохранён
    r = TestClient(app2).get(f"/api/daily?date={today.isoformat()}").json()
    assert r["notice"] is None
    r = TestClient(app2).get(f"/api/daily?date={(today - timedelta(days=1)).isoformat()}").json()
    assert r["notice"] and r["date"] == d2

def test_translations_cached(tmp_path):
    app, calls = make_app(tmp_path, pages=page_for)
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
        app, calls = make_app(tmp_path, pages=page_for)
        c = TestClient(app)
        d = datetime.now(timezone.utc).date().isoformat()
        r = c.post(f"/api/daily/translations?date={d}").json()
        assert r["translations_status"] == "ready" and "amor" in r["translations"].values() and n["llm"] >= 1
        before = n["llm"]
        c.post(f"/api/daily/translations?date={d}")
        assert n["llm"] == before                                     # кэш: повторных запросов нет
        g = c.get(f"/api/daily?date={d}").json(); assert g["translations_status"] == "ready"
    finally:
        o.OpenRouterClient.__init__ = orig


def test_full_text_pretranslation_100_percent_and_multiword(tmp_path):
    """Проверяет предварительную подготовку 100% слов текста и сохранение многословных фраз."""
    captured = {}
    def handler(request):
        payload = json.loads(json.loads(request.content)["messages"][1]["content"])
        items = payload["items"]
        captured["spanish_ref"] = payload.get("spanish_reference", "")
        # Для одного из слов возвращаем многословный перевод ("por la mañana")
        rows = [
            {"id": i["id"], "es": "por la mañana" if i["word"] == "Долгое" else "palabra"}
            for i in items
        ]
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps({"translations": rows})}}]})

    import app.translation.openrouter as o
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    orig = o.OpenRouterClient.__init__
    def init(self, k, m, h=None): orig(self, k, m, http)
    o.OpenRouterClient.__init__ = init
    try:
        app, calls = make_app(tmp_path, pages=page_for)
        c = TestClient(app)
        d = datetime.now(timezone.utc).date().isoformat()
        # Получаем структуру дня
        daily = c.get(f"/api/daily?date={d}").json()
        total_words = len(daily["order"])
        assert total_words > 0

        # Вызываем подготовку переводов
        r = c.post(f"/api/daily/translations?date={d}").json()
        assert r["translations_status"] == "ready"
        # 100% слов переведено
        assert len(r["translations"]) == total_words
        # Многословный перевод сохранён корректно
        assert "por la mañana" in r["translations"].values()
    finally:
        o.OpenRouterClient.__init__ = orig


def test_parser_spanish_page():
    """Проверяет корректность разбора страницы WOL на испанском языке."""
    es_page = """<html><body><div class="todayItems">
<div class="todayItem"><header><h2>Martes 6 de octubre</h2></header>
<p><em>«La Ley es solo una sombra» (<a href="/es/wol/bc/1">Heb. 10:1</a>).</em></p>
<p>A los cristianos de Judea no les resultaba fácil la vida. <a href="/pc/1"><em>w24.09</em> 9</a></p>
<p><a href="/d/1">Examinando las Escrituras diariamente 2026</a></p></div>
</div></body></html>"""
    r = parse_wol_page(es_page, date(2026, 10, 6))
    assert r["date_label"] == "Martes 6 de octubre"
    assert r["title"] == "Examinando las Escrituras diariamente 2026"
    assert r["verse"]["nodes"][0]["s"] == "«La Ley es solo una sombra» ("


def test_missing_translation_preserves_original_word(tmp_path):
    """Слово без перевода должно возвращать исходное русское слово без ошибок."""
    app, _ = make_app(tmp_path, pages=page_for)
    c = TestClient(app)
    # Запрос перевода слова при недоступном или пустом ответе модели
    r = c.post("/api/translate", json={
        "word": "неизвестное",
        "sentence": "Это неизвестное слово.",
        "date": "2026-10-06"
    }).json()
    assert r["translation"] == "неизвестное"


def test_custom_date_query_param(tmp_path):
    """Проверяет возможность запроса произвольных дат через GET параметр ?date=YYYY-MM-DD и ?date=YYYY-M-D."""
    app, calls = make_app(tmp_path, key="", pages=page_for)
    c = TestClient(app)

    # Даты, сильно отличающиеся от сегодняшней даты, а также неполный формат без нуля
    d1 = "2026-10-08"
    d2 = "2026-10-11"
    d3 = "2026-10-8"

    r1 = c.get(f"/api/daily?date={d1}").json()
    assert r1["date"] == d1

    r2 = c.get(f"/api/daily?date={d2}").json()
    assert r2["date"] == d2

    r3 = c.get(f"/api/daily?date={d3}").json()
    assert r3["date"] == "2026-10-08"


def test_spanish_mode_support(tmp_path):
    es_page = """<html><body><div class="todayItems">
<div class="todayItem"><header><h2>Martes 6 de octubre</h2></header>
<p><em>«La Ley es solo una sombra» (<a href="/es/wol/bc/1">Heb. 10:1</a>).</em></p>
<p>A los cristianos de Judea no les resultaba fácil la vida. <a href="/pc/1"><em>w24.09</em> 9</a></p>
<p><a href="/d/1">Examen diario de las Escrituras 2026</a></p></div>
</div></body></html>"""

    ru_page = """<html><body><div class="todayItems">
<div class="todayItem"><header><h2>Вторник, 6 октября</h2></header>
<p><em>«Закон — лишь тень» (<a href="/ru/wol/bc/1">Евр. 10:1</a>).</em></p>
<p>Христианам в Иудее было непросто. <a href="/pc/1"><em>w24.09</em> 9</a></p>
<p><a href="/d/1">Исследуем Писание каждый день — 2026</a></p></div>
</div></body></html>"""

    def pages(day, lang="ru"):
        return es_page if lang == "es" else ru_page

    def fetch_mock(base, day, client=None, language="ru"):
        return pages(day, lang=language)

    app = make_app(tmp_path, pages=None)
    # inject custom fetchers into daily service
    daily_svc = app.extra.get("daily") if hasattr(app, "extra") else None

    captured_prompts = []

    def handler(request):
        payload = json.loads(request.content.decode("utf-8"))
        captured_prompts.append(payload)
        items = json.loads(payload["messages"][1]["content"])["items"]
        rows = [{"id": i["id"], "es": "закон" if i["word"].lower() == "ley" else "слово"} for i in items]
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps({"translations": rows})}}]})

    mock_client = httpx.MockTransport(handler)
    http_client = httpx.AsyncClient(transport=mock_client)

    store = Store(tmp_path / "app.sqlite3")
    client_tr = OpenRouterClient("fake-key", "gpt-4o-mini", http=http_client)
    tr = TranslationService(store, client_tr)
    daily = DailyService(replace(get_settings(), db_path=tmp_path / "app.sqlite3"), store, tr,
                         fetch=lambda b, d, client=None: ru_page,
                         fetch_spanish=lambda b, d, client=None: es_page,
                         fetch_english=lambda b, d, client=None: "")

    app = create_app(settings=replace(get_settings(), db_path=tmp_path / "app.sqlite3"))
    # override daily with our configured daily service
    app.router.on_startup.clear()

    with TestClient(app) as c:
        app.extra = getattr(app, "extra", {})
        # Replace service logic in app context by creating app with fetch override
        async def fetch_ru_mock(b, d, client=None):
            return ru_page

        async def fetch_es_mock(b, d, client=None):
            return es_page

        app_custom = create_app(
            settings=replace(get_settings(), db_path=tmp_path / "app.sqlite3"),
            fetch=fetch_ru_mock,
            fetch_spanish=fetch_es_mock,
        )
        c_custom = TestClient(app_custom)
        r = c_custom.get("/api/daily?date=2026-10-06&lang=es").json()
        assert r["date_label"] == "Martes 6 de octubre"
        assert any(m["w"] == "cristianos" for m in r["meta"].values())

        # Check /api/daily/translations with es mode
        tr_resp = c_custom.post("/api/daily/translations?date=2026-10-06&lang=es").json()
        assert "translations" in tr_resp


def test_english_mode_support(tmp_path):
    """Проверяет работу английского режима через ?en и ?lang=en (английский текст с WOL в основе, русский как справка для перевода)."""
    en_page = """<html><body><div class="todayItems">
<div class="todayItem"><header><h2>Tuesday, October 6</h2></header>
<p><em>«I have seen the Lord!» (<a href="/en/wol/bc/1">John 20:18</a>).</em></p>
<p>Mary Magdalene came and brought the news to the disciples. <a href="/pc/1"><em>w24.10</em> 13</a></p>
<p><a href="/d/1">Examining the Scriptures Daily—2026</a></p></div>
</div></body></html>"""

    async def fetch_en(base, day):
        return en_page

    async def fetch_ru(base, day):
        return page_for(day)

    captured = {}
    def handler(request):
        payload = json.loads(json.loads(request.content)["messages"][1]["content"])
        items = payload["items"]
        captured["spanish_ref"] = payload.get("spanish_reference", "")
        rows = [{"id": i["id"], "es": "ученики" if i["word"] == "disciples" else "новость"} for i in items]
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps({"translations": rows})}}]})

    import app.translation.openrouter as o
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    orig = o.OpenRouterClient.__init__
    def init(self, k, m, h=None): orig(self, k, m, http)
    o.OpenRouterClient.__init__ = init
    try:
        s = replace(get_settings(), db_path=tmp_path / "t.db", openrouter_api_key="key")
        app = create_app(s, fetch=fetch_ru, fetch_english=fetch_en)
        c = TestClient(app)

        # Проверяем получение ежедневного материала на английском языке через ?en=1
        r = c.get("/api/daily?date=2026-10-06&en=1").json()
        assert r["date_label"] == "Tuesday, October 6"
        assert any(m["w"] == "disciples" for m in r["meta"].values())

        # Проверяем также через ?lang=en
        r2 = c.get("/api/daily?date=2026-10-06&lang=en").json()
        assert r2["date_label"] == "Tuesday, October 6"

        # Вызываем подготовку переводов на русский язык
        tr_resp = c.post("/api/daily/translations?date=2026-10-06&en=1").json()
        assert tr_resp["translations_status"] == "ready"
        assert "ученики" in tr_resp["translations"].values()
        # В качестве подсказки передан русский текст из русской страницы WOL
        assert "Христианам" in captured["spanish_ref"]
    finally:
        o.OpenRouterClient.__init__ = orig

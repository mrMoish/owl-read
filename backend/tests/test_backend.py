import asyncio, json
from dataclasses import replace
from datetime import date, datetime, timezone, timedelta
import httpx
from fastapi.testclient import TestClient
from app.config import get_settings
from app.main import create_app
from app.textproc.analyzer import analyze_blocks, priority_order
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
    # любое обычное русское слово интерактивно, включая имена и топонимы
    assert "Христианам" in words and "Иудее" in words
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
    assert a["translations_status"] == "ready"
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

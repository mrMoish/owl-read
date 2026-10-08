"""Тесты модели соответствий (alignment) и ручного перевода через /api/translate."""
import json
from datetime import datetime, timezone
import httpx
from fastapi.testclient import TestClient

from app.translation.alignment import clean_es_token, derive_translation, normalize_alignment, unit_for_index
from app.translation.openrouter import parse_align_response
from tests.test_backend import make_app, page_for

# «за ней наблюдал Иисус» -> «Jesús la observaba»
MERGE_WORDS = ["за", "ней", "наблюдал", "Иисус"]
MERGE_ES = ["Jesús", "la", "observaba"]
MERGE_UNITS = [
    {"ru": [0, 2], "es": [2, 2], "head": 2},  # за + наблюдал -> observaba
    {"ru": [1], "es": [1, 1], "head": 1},     # ней -> la
    {"ru": [3], "es": [0, 0], "head": 3},     # Иисус -> Jesús
]


def align_payload(words, es, units, translation=None):
    return {"translation": translation, "ru_words": list(words), "es_words": es, "units": units}


def test_normalize_accepts_all_shapes():
    # word -> word
    a = normalize_alignment(["рано"], align_payload(["рано"], ["temprano"], [{"ru": [0], "es": [0, 0], "head": 0}]))
    assert a and a["es_words"] == ["temprano"]
    # word -> phrase
    a = normalize_alignment(["перед"], align_payload(["перед"], ["antes", "del"], [{"ru": [0], "es": [0, 1], "head": 0}]))
    assert a and unit_for_index(a, 0)["es"] == [0, 1]
    # phrase -> word
    a = normalize_alignment(["очень", "быстро"], align_payload(["очень", "быстро"], ["rapidísimo"], [{"ru": [0, 1], "es": [0, 0], "head": 1}]))
    assert a and a["units"][0]["head"] == 1
    # phrase -> phrase
    a = normalize_alignment(["очень", "быстро"], align_payload(["очень", "быстро"], ["muy", "rápido"], [{"ru": [0, 1], "es": [0, 1], "head": 1}]))
    assert a and len(a["units"]) == 1


def test_normalize_merges_non_adjacent_ru_into_one_unit():
    a = normalize_alignment(MERGE_WORDS, align_payload(MERGE_WORDS, MERGE_ES, MERGE_UNITS))
    assert a is not None
    # «за» (индекс 0) принадлежит юниту «наблюдал» (голова, индекс 2)
    assert unit_for_index(a, 0) == {"ru": [0, 2], "es": [2, 2], "head": 2}
    # «ней» — свой юнит
    assert unit_for_index(a, 1)["es"] == [1, 1]
    # у юнитов нет ложного самостоятельного перевода «за»
    assert derive_translation(a, 2) == "observaba"
    assert derive_translation(a, 1) == "la"
    assert derive_translation(a, 0) is None  # «за» не имеет своего перевода


def test_normalize_rejects_garbage():
    ok = align_payload(MERGE_WORDS, MERGE_ES, MERGE_UNITS)
    # эхо ru_words не совпало
    bad = dict(ok, ru_words=["за", "ней", "видел", "Иисус"])
    assert normalize_alignment(MERGE_WORDS, bad) is None
    # кириллица в испанских токенах
    assert normalize_alignment(MERGE_WORDS, dict(ok, es_words=["наблюдал"])) is None
    # пересечение es-диапазонов
    overlap = align_payload(["а", "б"], ["x", "y"], [{"ru": [0], "es": [0, 1], "head": 0}, {"ru": [1], "es": [1, 1], "head": 1}])
    assert normalize_alignment(["а", "б"], overlap) is None
    # индекс вне диапазона
    assert normalize_alignment(["а"], align_payload(["а"], ["x"], [{"ru": [0], "es": [0, 5], "head": 0}])) is None
    # пустые units
    assert normalize_alignment(["а"], align_payload(["а"], ["x"], [])) is None
    # пунктуация с краёв токенов снимается
    a = normalize_alignment(["мир"], align_payload(["мир"], ["«paz»,", "hoy."], [{"ru": [0], "es": [0, 0], "head": 0}]))
    assert a["es_words"] == ["paz", "hoy"]


def test_parse_align_response_basic():
    raw = '```json\n{"translation":"observaba","ru_words":["за"],"es_words":["observa"],' \
          '"units":[{"ru":[0],"es":[0,0],"head":0}]}\n```'
    data = parse_align_response(raw)
    assert data["translation"] == "observaba" and data["units"][0]["ru"] == [0]


def test_clean_es_token():
    assert clean_es_token("observaba,") == "observaba"
    assert clean_es_token("¿por?") == "por"
    assert clean_es_token("...") == ""


def _mock_llm(handler):
    """Подменяет http-транспорт OpenRouterClient на мок; возвращает счётчик вызовов."""
    n = {"llm": 0}

    def counted(request):
        n["llm"] += 1
        return handler(request)

    import app.translation.openrouter as o
    http = httpx.AsyncClient(transport=httpx.MockTransport(counted))
    orig = o.OpenRouterClient.__init__

    def init(self, k, m, h=None):
        orig(self, k, m, http)

    o.OpenRouterClient.__init__ = init
    return orig, n


SENT = "за ней наблюдал Иисус"


def _alignment_handler(request):
    body = json.loads(request.content)
    payload = json.loads(body["messages"][1]["content"])
    if body["messages"][0]["content"].startswith("You build a word alignment"):
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(
            align_payload(payload["ru_words"], MERGE_ES, MERGE_UNITS, "observaba"), ensure_ascii=False)}}]})
    # одиночный перевод (деградация)
    return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps({"translation": "miraba"})}}]})


def test_translate_endpoint_alignment_flow(tmp_path):
    orig, n = _mock_llm(_alignment_handler)
    try:
        app, _ = make_app(tmp_path, pages=page_for)
        c = TestClient(app)
        d = datetime.now(timezone.utc).date().isoformat()
        # клик по «наблюдал»: перевод + выравнивание всего предложения
        r = c.post("/api/translate", json={
            "word": "наблюдал", "sentence": SENT, "date": d,
            "ru_words": MERGE_WORDS, "clicked_index": 2,
        }).json()
        assert r["translation"] == "observaba"
        al = r["alignment"]
        assert al["es_words"] == MERGE_ES
        assert {"ru": [0, 2], "es": [2, 2], "head": 2} in al["units"]
        # клик по «за»: своего перевода нет, но выравнивание уже в кэше — LLM не зовём
        before = n["llm"]
        r2 = c.post("/api/translate", json={
            "word": "за", "sentence": SENT, "date": d,
            "ru_words": MERGE_WORDS, "clicked_index": 0,
        }).json()
        assert r2["translation"] is None and r2["alignment"]
        assert n["llm"] == before
        # клик по «ней»: la из кэша выравнивания
        r3 = c.post("/api/translate", json={
            "word": "ней", "sentence": SENT, "date": d,
            "ru_words": MERGE_WORDS, "clicked_index": 1,
        }).json()
        assert r3["translation"] == "la" and n["llm"] == before
    finally:
        import app.translation.openrouter as o
        o.OpenRouterClient.__init__ = orig


def test_translate_endpoint_degrades_to_plain(tmp_path):
    """Модель вернула бракованные units со строкой перевода -> деградация к строке."""
    def handler(request):
        body = json.loads(request.content)
        payload = json.loads(body["messages"][1]["content"])
        if body["messages"][0]["content"].startswith("You build a word alignment"):
            bad = align_payload(payload["ru_words"], MERGE_ES, [
                {"ru": [0], "es": [0, 2], "head": 0}, {"ru": [1], "es": [1, 1], "head": 1}], None)
            return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(bad, ensure_ascii=False)}}]})
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps({"translation": "cuidaba"})}}]})

    orig, n = _mock_llm(handler)
    try:
        app, _ = make_app(tmp_path, pages=page_for)
        c = TestClient(app)
        d = datetime.now(timezone.utc).date().isoformat()
        r = c.post("/api/translate", json={
            "word": "наблюдал", "sentence": SENT, "date": d,
            "ru_words": MERGE_WORDS, "clicked_index": 2,
        }).json()
        assert "alignment" not in r and r["translation"] == "cuidaba"
    finally:
        import app.translation.openrouter as o
        o.OpenRouterClient.__init__ = orig


def test_translate_endpoint_legacy_payload(tmp_path):
    """Старый клиент без ru_words/clicked_index получает строку, как раньше."""
    def handler(request):
        body = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps({"translation": "miraba"})}}]})

    orig, _ = _mock_llm(handler)
    try:
        app, _ = make_app(tmp_path, pages=page_for)
        c = TestClient(app)
        d = datetime.now(timezone.utc).date().isoformat()
        r = c.post("/api/translate", json={"word": "наблюдал", "sentence": SENT, "date": d}).json()
        assert r == {"original": "наблюдал", "translation": "miraba"}
    finally:
        import app.translation.openrouter as o
        o.OpenRouterClient.__init__ = orig


def test_service_translation_none_for_unclicked_satellite(tmp_path):
    """Спутник («за») не получает самостоятельный перевод даже из кэша выравнивания."""
    a = normalize_alignment(MERGE_WORDS, align_payload(MERGE_WORDS, MERGE_ES, MERGE_UNITS))
    assert derive_translation(a, 0) is None
    assert derive_translation(a, 3) == "Jesús"
    # токен вне юнитов — тоже None (сценарий 4)
    b = normalize_alignment(
        ["за", "ней", "наблюдал"],
        align_payload(["за", "ней", "наблюдал"], ["observaba"], [{"ru": [0, 2], "es": [0, 0], "head": 2}]))
    assert derive_translation(b, 1) is None

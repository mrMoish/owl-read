"""Модель соответствий «диапазон русских слов ↔ диапазон испанских слов».

Юнит (unit) связывает набор индексов русских токенов с непрерывным диапазоном
испанских токенов:
  {"ru": [i1, i2, ...], "es": [start, end], "head": <индекс содержательного слова>}
Набор русских индексов может быть несплошным: «за + наблюдал → observaba»
(между ними стоит «ней», имеющая свой перевод). Поддерживает word→word,
word→phrase, phrase→word, phrase→phrase.
Русские токены вне юнитов — «нет отдельного перевода в контексте».
Испанские токены вне юнитов — добавленные служебные слова (вставки).
"""
from __future__ import annotations
import re

CYR = re.compile(r"[А-Яа-яЁё]")
_TOKEN_EDGE = re.compile(r"^[^\w]+|[^\w]+$", re.UNICODE)


def clean_es_token(token: str) -> str:
    """Убирает пунктуацию с краёв токена («observaba,» -> «observaba»)."""
    return _TOKEN_EDGE.sub("", token.strip())


def normalize_alignment(expected_ru: list[str], data: dict) -> dict | None:
    """Проверяет ответ модели и возвращает нормализованный alignment или None.

    expected_ru — список русских слов предложения в порядке следования,
    с которым фронтенд запросил перевод. Модель обязана вернуть его же.
    """
    if not isinstance(data, dict) or not isinstance(expected_ru, list) or not expected_ru:
        return None
    echoed = data.get("ru_words")
    if not isinstance(echoed, list) or len(echoed) != len(expected_ru):
        return None
    if [str(w).strip() for w in echoed] != [str(w).strip() for w in expected_ru]:
        return None

    raw_es = data.get("es_words")
    if not isinstance(raw_es, list):
        return None
    es: list[str] = []
    for w in raw_es:
        if not isinstance(w, str):
            return None
        w = clean_es_token(w)
        if not w or len(w) > 40 or CYR.search(w):
            return None
        es.append(w)
    if not 1 <= len(es) <= 120:
        return None

    raw_units = data.get("units")
    if not isinstance(raw_units, list):
        return None
    ru_taken: set[int] = set()
    es_taken: set[int] = set()
    units: list[dict] = []
    for u in raw_units:
        if not isinstance(u, dict):
            return None
        r, e = u.get("ru"), u.get("es")
        if not (isinstance(r, list) and r and isinstance(e, list) and len(e) == 2):
            return None
        try:
            ru_idx = sorted({int(i) for i in r})
            es_s, es_e = int(e[0]), int(e[1])
            head = int(u.get("head", ru_idx[-1]))
        except (TypeError, ValueError):
            return None
        if any(not (0 <= i < len(expected_ru)) for i in ru_idx) or len(set(ru_idx)) != len(r):
            return None
        if not (0 <= es_s <= es_e < len(es)):
            return None
        if ru_taken & set(ru_idx) or set(range(es_s, es_e + 1)) & es_taken:
            return None
        if head not in ru_idx:
            head = ru_idx[-1]
        ru_taken.update(ru_idx)
        es_taken.update(range(es_s, es_e + 1))
        units.append({"ru": ru_idx, "es": [es_s, es_e], "head": head})
    if not units:
        return None
    units.sort(key=lambda u: u["es"][0])
    return {"ru_words": [str(w).strip() for w in expected_ru], "es_words": es, "units": units}


def unit_for_index(alignment: dict, ru_index: int) -> dict | None:
    """Юнит, покрывающий русский токен с этим индексом, или None."""
    for u in alignment["units"]:
        if ru_index in u["ru"]:
            return u
    return None


def unit_translation(alignment: dict, unit: dict) -> str:
    """Испанские слова юнита одной строкой («observaba»)."""
    return " ".join(alignment["es_words"][unit["es"][0]:unit["es"][1] + 1])


def derive_translation(alignment: dict, clicked_index: int) -> str | None:
    """Перевод для нажатого токена: слова его юнита, если токен — голова;
    спутникам и токенам без юнита отдельного перевода нет (None)."""
    unit = unit_for_index(alignment, clicked_index)
    if unit is None or unit["head"] != clicked_index:
        return None
    return unit_translation(alignment, unit)

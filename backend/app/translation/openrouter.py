"""Клиент OpenRouter. Ключ — только из env на backend."""
from __future__ import annotations
import asyncio
import json
import logging
import re
import httpx

log = logging.getLogger("uvicorn.error")
URL = "https://openrouter.ai/api/v1/chat/completions"
CYR = re.compile(r"[А-Яа-яЁё]")
SYSTEM = (
    "You translate single Russian words, as used in a given sentence, into Argentine Spanish (es-AR) "
    "for a language-learning reader. For each item return the Spanish word or short phrase (max 3 words) "
    "that can REPLACE the Russian word in place, matching its grammatical form (tense, person, number, "
    "gender, case function) so the sentence stays correct. Choose the sense that fits the sentence "
    "(e.g. «мир» = paz or mundo). Use natural, neutral Argentine Spanish: no heavy slang, no Spain-only "
    "forms (no 'vosotros'). Keep the first letter capitalised if the source word is. "
    "Use the provided Russian sentence and the Spanish WOL reference context to choose the most natural term "
    "used in official JW Spanish material when relevant. "
    'Answer with JSON only: {"translations":[{"id":<int>,"es":"<text>"}]}'
)
SINGLE_SYSTEM = (
    "Translate the exact clicked Russian word only, not the surrounding words. "
    "Use the Russian sentence and Spanish WOL reference context to disambiguate the meaning. "
    "If the clicked word is a single word token, return a single-word Spanish translation if possible. "
    "Do not translate a full phrase or a full name when the user clicked only one word. "
    "Do not echo neighboring words; do not output a phrase if the source is one word. "
    "Keep the answer natural Argentine Spanish (es-AR), neutral, not slang-heavy. "
    "If the clicked word is a proper name or a person name, return the name form only, not the full phrase. "
    "Use the exact clicked word's grammatical form and sentence meaning. "
    "Return JSON only: {\"translation\": \"<text>\", \"confidence\": 0.0-1.0}. "
    "If the translation is uncertain, return the original word rather than a broader phrase."
)


ALIGN_SYSTEM = (
    "You build a word alignment between a Russian sentence and its Argentine Spanish (es-AR) "
    "counterpart for a reading app. You receive: the Russian sentence; ru_words, the ordered list "
    "of its clickable tokens; clicked_index of the token the user tapped; and a Spanish reference "
    "text of the same article. "
    "Step 1: find this sentence's Spanish counterpart inside the Spanish reference and reuse its "
    "exact wording. If the reference has no such sentence, translate the Russian sentence yourself "
    "into natural, neutral es-AR (no slang, no 'vosotros'). "
    "Step 2: split that Spanish sentence into es_words: word tokens without punctuation, accents "
    "kept, capitalized only if a proper name or sentence-initial word. "
    "Step 3: return units mapping the ru_words indices that express each Spanish span. A unit's "
    '"ru" is the list of ru_words indices (usually one index, or several consecutive ones for a '
    "phrase); \"es\" is the [start, end] range of es_words that expresses them. Shapes word→word, "
    "word→phrase, phrase→word, phrase→phrase are all allowed; a ru index or es index must not "
    "appear in two units. "
    "A unit's ru indices may also be NON-consecutive when Russian words separated by another word "
    "melt into one Spanish word: in «за ней наблюдал» → «la observaba» the unit for «observaba» "
    "has ru [0, 2] («за» + «наблюдал»), while «ней» → «la» is its own unit. "
    "Spanish words that exist only in Spanish (added function words such as articles and "
    "prepositions with no Russian counterpart, e.g. «por la» in «temprano por la mañana») must not "
    "belong to any unit. "
    "Cover every Russian token that has a counterpart in the Spanish sentence; leave a token "
    "uncovered only when it vanishes completely and belongs to no other unit. "
    "head is the ru_words index a user would tap to reveal the unit; for multi-token units it is "
    "the content word (verb, noun), never a bare function word. "
    "translation is the Spanish wording of the clicked token's unit, or null if the clicked token "
    "has no unit of its own. "
    'Answer with JSON only: {"translation": <string|null>, "ru_words": [<echo of ru_words>], '
    '"es_words": ["..."], "units": [{"ru": [<indices>], "es": [start, end], "head": <int>}]}. '
    "All indices are 0-based; es range ends are inclusive."
)


class TranslationError(Exception):
    pass


def parse_response(text: str, allowed_ids: set[int]) -> dict[int, str]:
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    try:
        data = json.loads(text)
        rows = data["translations"] if isinstance(data, dict) else data
    except (ValueError, KeyError, TypeError) as e:
        raise TranslationError(f"Некорректный JSON от модели: {e}") from e
    out: dict[int, str] = {}
    for r in rows if isinstance(rows, list) else []:
        try:
            i, es = int(r["id"]), str(r["es"]).strip()
        except (KeyError, TypeError, ValueError):
            continue
        if i in allowed_ids and es and len(es) <= 60 and not CYR.search(es):
            out[i] = es
    return out


def parse_single_response(text: str) -> str:
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    try:
        data = json.loads(text)
        tr = data.get("translation") if isinstance(data, dict) else None
        if not isinstance(tr, str):
            raise TranslationError("translation field missing")
        tr = tr.strip()
        if not tr or len(tr) > 60 or CYR.search(tr):
            raise TranslationError("translation invalid")
        return tr
    except (ValueError, TypeError, KeyError) as e:
        raise TranslationError(f"Некорректный JSON от модели: {e}") from e


def parse_align_response(text: str) -> dict:
    """Сырой ответ модели: {"translation", "ru_words", "es_words", "units"}.
    Диапазоны проверяет дальше normalize_alignment (ей нужен expected_ru)."""
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    try:
        data = json.loads(text)
        if not isinstance(data, dict):
            raise TranslationError("JSON не объект")
        tr = data.get("translation")
        if tr is not None and not (isinstance(tr, str) and tr.strip() and len(tr) <= 80):
            tr = None
        ru = data.get("ru_words")
        es = data.get("es_words")
        units = data.get("units")
        if not isinstance(ru, list) or not all(isinstance(w, str) for w in ru):
            raise TranslationError("ru_words invalid")
        if not isinstance(es, list) or not all(isinstance(w, str) for w in es) or not es:
            raise TranslationError("es_words invalid")
        if not isinstance(units, list):
            raise TranslationError("units invalid")
        return {"translation": tr.strip() if isinstance(tr, str) else None,
                "ru_words": ru, "es_words": es, "units": units}
    except (ValueError, TypeError, KeyError) as e:
        raise TranslationError(f"Некорректный JSON от модели: {e}") from e


class OpenRouterClient:
    def __init__(self, api_key: str, model: str, http: httpx.AsyncClient | None = None):
        self.api_key, self.model, self._http = api_key, model, http

    async def _chat(self, system: str, user_payload: dict) -> str:
        """Один запрос к модели с ретраями; возвращает сырой текст ответа."""
        body = {
            "model": self.model, "temperature": 0.1,
            "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": system},
                         {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)}],
        }
        headers = {"Authorization": f"Bearer {self.api_key}", "X-Title": "Daily Reader"}
        own = self._http is None
        http = self._http or httpx.AsyncClient(timeout=60)
        last: Exception | None = None
        try:
            for attempt in range(3):
                try:
                    r = await http.post(URL, json=body, headers=headers)
                    if r.status_code == 400 and "response_format" in body:
                        body.pop("response_format")
                        log.warning("400 от OpenRouter, повторяю без response_format")
                        continue
                    if r.status_code in (401, 402, 403):
                        raise TranslationError(f"OpenRouter {r.status_code}: {r.text[:200]}")
                    if r.status_code in (429, 500, 502, 503, 504):
                        raise TranslationError(f"OpenRouter {r.status_code}")
                    r.raise_for_status()
                    return r.json()["choices"][0]["message"]["content"]
                except (httpx.HTTPError, TranslationError, KeyError, IndexError, ValueError) as e:
                    last = e
                    log.warning("OpenRouter попытка %s не удалась: %s", attempt + 1, e)
                    if isinstance(e, TranslationError) and "OpenRouter 40" in str(e):
                        break
                    await asyncio.sleep(0.8 * (attempt + 1))
        finally:
            if own:
                await http.aclose()
        raise TranslationError(f"OpenRouter недоступен: {last}")

    async def translate_aligned(self, *, ru_words: list[str], clicked_index: int,
                                sentence: str, context: str, spanish_reference: str | None = None) -> dict:
        """Выравнивание предложения: ru_words ↔ es_words + юниты. Сырой ответ,
        валидацию диапазонов делает normalize_alignment."""
        content = await self._chat(ALIGN_SYSTEM, {
            "sentence": sentence,
            "ru_words": ru_words,
            "clicked_index": clicked_index,
            "clicked_word": ru_words[clicked_index],
            "context": context,
            "spanish_reference": spanish_reference or "",
        })
        return parse_align_response(content)

    async def translate_word(self, *, word: str, lemma: str, sentence: str, context: str, spanish_reference: str | None = None) -> str:
        """Перевод одного слова в контексте. Возвращает испанское слово или пустую строку при ошибке."""
        payload = {
            "word": word,
            "lemma": lemma,
            "sentence": sentence,
            "context": context,
            "spanish_reference": spanish_reference or "",
        }
        body = {
            "model": self.model,
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": SINGLE_SYSTEM},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
        }
        headers = {"Authorization": f"Bearer {self.api_key}", "X-Title": "Daily Reader"}
        own = self._http is None
        http = self._http or httpx.AsyncClient(timeout=60)
        last: Exception | None = None
        try:
            for attempt in range(3):
                try:
                    r = await http.post(URL, json=body, headers=headers)
                    if r.status_code == 400 and "response_format" in body:
                        body.pop("response_format")
                        log.warning("400 от OpenRouter, повторяю без response_format")
                        continue
                    if r.status_code in (401, 402, 403):
                        raise TranslationError(f"OpenRouter {r.status_code}: {r.text[:200]}")
                    if r.status_code in (429, 500, 502, 503, 504):
                        raise TranslationError(f"OpenRouter {r.status_code}")
                    r.raise_for_status()
                    content = r.json()["choices"][0]["message"]["content"]
                    return parse_single_response(content)
                except (httpx.HTTPError, TranslationError, KeyError, IndexError, ValueError) as e:
                    last = e
                    log.warning("OpenRouter single-word попытка %s не удалась: %s", attempt + 1, e)
                    if isinstance(e, TranslationError) and "OpenRouter 40" in str(e):
                        break
                    await asyncio.sleep(0.8 * (attempt + 1))
        finally:
            if own:
                await http.aclose()
        raise TranslationError(f"OpenRouter недоступен: {last}")

    async def translate_batch(self, items: list[dict]) -> dict[int, str]:
        """items: [{id, word, lemma, sentence}] -> {id: es}. Слова без перевода просто отсутствуют."""
        body = {
            "model": self.model, "temperature": 0.1,
            "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": SYSTEM},
                         {"role": "user", "content": json.dumps({"items": items}, ensure_ascii=False)}],
        }
        headers = {"Authorization": f"Bearer {self.api_key}", "X-Title": "Daily Reader"}
        own = self._http is None
        http = self._http or httpx.AsyncClient(timeout=60)
        last: Exception | None = None
        try:
            for attempt in range(3):
                try:
                    r = await http.post(URL, json=body, headers=headers)
                    if r.status_code == 400 and "response_format" in body:
                        body.pop("response_format")
                        log.warning("400 от OpenRouter, повторяю без response_format")
                        continue
                    if r.status_code in (401, 402, 403):
                        raise TranslationError(f"OpenRouter {r.status_code}: {r.text[:200]}")
                    if r.status_code in (429, 500, 502, 503, 504):
                        raise TranslationError(f"OpenRouter {r.status_code}")
                    r.raise_for_status()
                    content = r.json()["choices"][0]["message"]["content"]
                    return parse_response(content, {i["id"] for i in items})
                except (httpx.HTTPError, TranslationError, KeyError, IndexError, ValueError) as e:
                    last = e
                    log.warning("OpenRouter попытка %s не удалась: %s", attempt + 1, e)
                    if isinstance(e, TranslationError) and "OpenRouter 40" in str(e):
                        break
                    await asyncio.sleep(0.8 * (attempt + 1))
        finally:
            if own:
                await http.aclose()
        raise TranslationError(f"OpenRouter недоступен: {last}")

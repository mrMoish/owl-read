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
SYSTEM_RU_ES = (
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
SYSTEM_EN_RU = (
    "You translate single English words, as used in a given sentence, into Russian (ru) "
    "for a Russian native speaker who is learning English. For each item return the Russian word or short phrase (max 3 words) "
    "that can REPLACE or translate the English word in place, matching its grammatical form (tense, case, number, "
    "gender, form) so the meaning in context is clear and natural. "
    "Keep the first letter capitalised if the source word is. "
    'Answer with JSON only: {"translations":[{"id":<int>,"es":"<text>"}]}'
)
SINGLE_SYSTEM_RU_ES = (
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
SINGLE_SYSTEM_EN_RU = (
    "Translate the exact clicked English word only into Russian, not the surrounding words. "
    "Use the English sentence to disambiguate the meaning. "
    "Return a natural Russian translation for the clicked word matching its sentence context. "
    "Keep the first letter capitalised if the source word is. "
    "Return JSON only: {\"translation\": \"<text>\", \"confidence\": 0.0-1.0}. "
    "If the translation is uncertain, return the original word rather than a broader phrase."
)


class TranslationError(Exception):
    pass


def parse_response(text: str, allowed_ids: set[int], lang: str = "ru") -> dict[int, str]:
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
        if i in allowed_ids and es and len(es) <= 60:
            if lang != "en" and CYR.search(es):
                continue
            out[i] = es
    return out


def parse_single_response(text: str, lang: str = "ru") -> str:
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    try:
        data = json.loads(text)
        tr = data.get("translation") if isinstance(data, dict) else None
        if not isinstance(tr, str):
            raise TranslationError("translation field missing")
        tr = tr.strip()
        if not tr or len(tr) > 60:
            raise TranslationError("translation invalid")
        if lang != "en" and CYR.search(tr):
            raise TranslationError("translation invalid")
        return tr
    except (ValueError, TypeError, KeyError) as e:
        raise TranslationError(f"Некорректный JSON от модели: {e}") from e


class OpenRouterClient:
    def __init__(self, api_key: str, model: str, http: httpx.AsyncClient | None = None):
        self.api_key, self.model, self._http = api_key, model, http

    async def translate_word(self, *, word: str, lemma: str, sentence: str, context: str, spanish_reference: str | None = None, lang: str = "ru") -> str:
        """Перевод одного слова в контексте."""
        payload = {
            "word": word,
            "lemma": lemma,
            "sentence": sentence,
            "context": context,
            "spanish_reference": spanish_reference or "",
        }
        system_prompt = SINGLE_SYSTEM_EN_RU if lang == "en" else SINGLE_SYSTEM_RU_ES
        body = {
            "model": self.model,
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system_prompt},
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
                    return parse_single_response(content, lang=lang)
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

    async def translate_batch(self, items: list[dict], spanish_reference: str = "", lang: str = "ru") -> dict[int, str]:
        """items: [{id, word, lemma, sentence}] -> {id: translated_text}."""
        user_content: dict = {"items": items}
        if spanish_reference:
            user_content["spanish_reference"] = spanish_reference
        system_prompt = SYSTEM_EN_RU if lang == "en" else SYSTEM_RU_ES
        body = {
            "model": self.model, "temperature": 0.1,
            "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": system_prompt},
                         {"role": "user", "content": json.dumps(user_content, ensure_ascii=False)}],
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
                    return parse_response(content, {i["id"] for i in items}, lang=lang)
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

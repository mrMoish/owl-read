"""Клиент OpenRouter. Ключ — только из env на backend."""
from __future__ import annotations
import asyncio
import json
import re
import httpx
import logging
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
    'Answer with JSON only: {"translations":[{"id":<int>,"es":"<text>"}]}'
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


class OpenRouterClient:
    def __init__(self, api_key: str, model: str, http: httpx.AsyncClient | None = None):
        self.api_key, self.model, self._http = api_key, model, http

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
                    if r.status_code in (429, 500, 502, 503, 504):
                        raise TranslationError(f"OpenRouter {r.status_code}")
                    r.raise_for_status()
                    content = r.json()["choices"][0]["message"]["content"]
                    return parse_response(content, {i["id"] for i in items})
                except (httpx.HTTPError, TranslationError, KeyError, IndexError, ValueError) as e:
                    last = e
                    body = getattr(getattr(e, "response", None), "text", "")[:300]
                    log.warning("OpenRouter попытка %s не удалась: %s %s", attempt + 1, e, body)
                    await asyncio.sleep(0.8 * (attempt + 1))
        finally:
            if own:
                await http.aclose()
        raise TranslationError(f"OpenRouter недоступен: {last}")

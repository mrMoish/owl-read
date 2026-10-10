"""Выбор слов, кэш (слово + предложение + язык), батчи в OpenRouter."""
from __future__ import annotations
import asyncio
import hashlib
import logging
from .openrouter import OpenRouterClient, TranslationError

log = logging.getLogger("uvicorn.error")
LANG = "es-AR"
CHUNK = 40


def cache_key(*parts, lang: str = "ru"):
    """Составной cache key: current date + word + sentence + language."""
    if len(parts) == 2:
        word, sentence = parts
        date = ""
    else:
        date, word, sentence = parts
    lang_tag = "ru-EN" if lang == "en" else LANG
    text = f"v2|{date}|{lang_tag}|{word.lower()}|{sentence}"
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


class TranslationService:
    def __init__(self, store, client: OpenRouterClient | None, max_share: float = 0.5):
        self.store, self.client, self.max_share = store, client, max_share

    def _needed(self, content: dict) -> list[int]:
        order = content.get("order", [])
        return list(order) if order else [int(k) for k in content.get("meta", {}).keys()]

    def _lookup(self, content: dict, lang: str = "ru"):
        ids = self._needed(content)
        keys = {i: cache_key(content["date"], content["meta"][str(i)]["w"], content["meta"][str(i)]["sent"], lang=lang) for i in ids}
        hit = self.store.get_translations(list(keys.values()))
        return ids, keys, {i: hit[k] for i, k in keys.items() if k in hit}

    def cached(self, content: dict, lang: str = "ru"):
        ids, _, tr = self._lookup(content, lang=lang)
        if len(tr) == len(ids):
            return tr, "ready"
        return tr, ("pending" if self.client else "unavailable")

    async def ensure(self, content: dict, spanish_reference: str = "", lang: str = "ru"):
        ids, keys, tr = self._lookup(content, lang=lang)
        missing = [i for i in ids if i not in tr]
        if not missing:
            return tr, "ready"
        if not self.client:
            return tr, "unavailable"
        sem = asyncio.Semaphore(3)

        async def run(part):
            items = [{"id": i, "word": content["meta"][str(i)]["w"],
                      "lemma": content["meta"][str(i)]["lemma"],
                      "sentence": content["meta"][str(i)]["sent"]} for i in part]
            async with sem:
                return await self.client.translate_batch(items, spanish_reference=spanish_reference, lang=lang)

        parts = [missing[i:i + CHUNK] for i in range(0, len(missing), CHUNK)]
        results = await asyncio.gather(*(run(p) for p in parts), return_exceptions=True)
        new = {}
        for r in results:
            if isinstance(r, TranslationError):
                log.warning("Батч перевода не удался: %s", r)
            elif isinstance(r, dict):
                new.update(r)
            elif isinstance(r, Exception):
                log.warning("Исключение при переводе батча: %s", r)
        if new:
            self.store.put_translations({keys[i]: es for i, es in new.items() if i in keys})
            tr.update(new)
        return tr, ("ready" if len(tr) == len(ids) else "partial")

    async def translate_word(self, *, date: str, word: str, lemma: str, sentence: str, context: str, spanish_reference: str | None = None, lang: str = "ru"):
        if not word or not sentence:
            return word
        key = cache_key(date, word, sentence, lang=lang)
        previous = self.store.get_translations([key])
        if key in previous:
            return previous[key]
        if not self.client:
            return word
        try:
            tr = await self.client.translate_word(
                word=word,
                lemma=lemma,
                sentence=sentence,
                context=context,
                spanish_reference=spanish_reference,
                lang=lang,
            )
        except TranslationError as e:
            log.warning("translate_word failed: %s", e)
            return word
        if not tr or tr == word or tr == lemma:
            return word
        self.store.put_translations({key: tr})
        return tr

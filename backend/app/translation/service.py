"""Выбор слов, кэш (слово + предложение + язык), батчи в OpenRouter."""
from __future__ import annotations
import asyncio
import hashlib
import logging
import math
from .openrouter import OpenRouterClient, TranslationError

log = logging.getLogger("uvicorn.error")
LANG = "es-AR"
CHUNK = 40


def cache_key(word: str, sentence: str) -> str:
    return hashlib.sha1(f"v1|{LANG}|{word.lower()}|{sentence}".encode()).hexdigest()


class TranslationService:
    def __init__(self, store, client: OpenRouterClient | None, max_share: float = 0.5):
        self.store, self.client, self.max_share = store, client, max_share

    def _needed(self, content: dict) -> list[int]:
        order = content["order"]
        return order[: math.ceil(len(order) * self.max_share)]

    def _lookup(self, content: dict):
        ids = self._needed(content)
        keys = {i: cache_key(content["meta"][str(i)]["w"], content["meta"][str(i)]["sent"]) for i in ids}
        hit = self.store.get_translations(list(keys.values()))
        return ids, keys, {i: hit[k] for i, k in keys.items() if k in hit}

    def cached(self, content: dict):
        ids, _, tr = self._lookup(content)
        if len(tr) == len(ids):
            return tr, "ready"
        return tr, ("pending" if self.client else "unavailable")

    async def ensure(self, content: dict):
        ids, keys, tr = self._lookup(content)
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
                return await self.client.translate_batch(items)

        parts = [missing[i:i + CHUNK] for i in range(0, len(missing), CHUNK)]
        results = await asyncio.gather(*(run(p) for p in parts), return_exceptions=True)
        new = {}
        for r in results:
            if isinstance(r, TranslationError):
                log.warning("Батч перевода не удался: %s", r)
            if isinstance(r, dict):
                new.update(r)
            elif not isinstance(r, TranslationError):
                raise r
        if new:
            self.store.put_translations({keys[i]: es for i, es in new.items()})
            tr.update(new)
        return tr, ("ready" if len(tr) == len(ids) else "partial")

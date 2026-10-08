"""Выбор слов, кэш (слово + предложение + язык), батчи в OpenRouter."""
from __future__ import annotations
import hashlib
import logging
from .openrouter import OpenRouterClient, TranslationError

log = logging.getLogger("uvicorn.error")
LANG = "es-AR"
CHUNK = 40


def cache_key(*parts):
    """Составной cache key: current date + word + sentence + language.
    Поддерживает старый вызов cache_key(word, sentence) для совместимости."""
    if len(parts) == 2:
        word, sentence = parts
        date = ""
    else:
        date, word, sentence = parts
    text = f"v2|{date}|{LANG}|{word.lower()}|{sentence}"
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


class TranslationService:
    def __init__(self, store, client: OpenRouterClient | None, max_share: float = 0.5):
        self.store, self.client, self.max_share = store, client, max_share

    def _needed(self, content: dict) -> list[int]:
        # Legacy auto-translation path is disabled; this method is kept for compatibility.
        return []

    def _lookup(self, content: dict):
        ids = self._needed(content)
        keys = {i: cache_key(content["date"], content["meta"][str(i)]["w"], content["meta"][str(i)]["sent"]) for i in ids}
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
        return tr, "ready"

    async def translate_word(self, *, date: str, word: str, lemma: str, sentence: str, context: str, spanish_reference: str | None = None):
        if not word or not sentence:
            return word
        key = cache_key(date, word, sentence)
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
            )
        except TranslationError as e:
            log.warning("translate_word failed: %s", e)
            return word
        if not tr or tr == word or tr == lemma:
            return word
        self.store.put_translations({key: tr})
        return tr

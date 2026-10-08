"""Выбор слов, кэш (слово + предложение + язык), батчи в OpenRouter."""
from __future__ import annotations
import hashlib
import logging
from .alignment import derive_translation, normalize_alignment
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


def alignment_cache_key(date: str, sentence: str) -> str:
    """Кэш выравнивания — на предложение, а не на слово."""
    return hashlib.sha1(f"align|v1|{date}|{LANG}|{sentence}".encode("utf-8")).hexdigest()


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

    async def translate_word(self, *, date: str, word: str, lemma: str, sentence: str, context: str,
                             spanish_reference: str | None = None,
                             ru_words: list[str] | None = None, clicked_index: int | None = None) -> dict:
        """-> {"translation": str|None, "alignment": dict|None}.
        translation=None значит: у нажатого слова нет отдельного перевода в контексте.
        alignment отсутствует, если модель не дала пригодного выравнивания —
        тогда caller деградирует к простому переводу-строке."""
        if not word or not sentence:
            return {"translation": word, "alignment": None}
        use_align = (isinstance(ru_words, list) and 0 < len(ru_words) <= 120
                     and clicked_index is not None and 0 <= clicked_index < len(ru_words))
        if use_align:
            akey = alignment_cache_key(date, sentence)
            cached_align = self.store.get_alignment(akey)
            if cached_align:
                return {"translation": derive_translation(cached_align, clicked_index),
                        "alignment": cached_align}
        if not self.client:
            return {"translation": word, "alignment": None}
        if use_align:
            try:
                raw = await self.client.translate_aligned(
                    ru_words=ru_words, clicked_index=clicked_index,
                    sentence=sentence, context=context, spanish_reference=spanish_reference)
            except TranslationError as e:
                log.warning("translate_aligned failed: %s", e)
                return {"translation": await self._plain_translation(date, word, lemma, sentence, context, spanish_reference), "alignment": None}
            alignment = normalize_alignment(ru_words, raw)
            if alignment:
                self.store.put_alignment(akey, alignment)
                return {"translation": derive_translation(alignment, clicked_index), "alignment": alignment}
            # выравнивание не прошло проверку — деградируем к строке, если модель её дала
            tr = raw.get("translation") if isinstance(raw, dict) else None
            if tr and tr != word and tr != lemma:
                self.store.put_translations({cache_key(date, word, sentence): tr})
                return {"translation": tr, "alignment": None}
            return {"translation": await self._plain_translation(date, word, lemma, sentence, context, spanish_reference), "alignment": None}
        return {"translation": await self._plain_translation(date, word, lemma, sentence, context, spanish_reference), "alignment": None}

    async def _plain_translation(self, date: str, word: str, lemma: str, sentence: str,
                                 context: str, spanish_reference: str | None) -> str:
        """Прежний путь: перевод одним словом/фразой без выравнивания."""
        key = cache_key(date, word, sentence)
        previous = self.store.get_translations([key])
        if key in previous:
            return previous[key]
        try:
            tr = await self.client.translate_word(
                word=word, lemma=lemma, sentence=sentence, context=context,
                spanish_reference=spanish_reference)
        except TranslationError as e:
            log.warning("translate_word failed: %s", e)
            return word
        if not tr or tr == word or tr == lemma:
            return word
        self.store.put_translations({key: tr})
        return tr

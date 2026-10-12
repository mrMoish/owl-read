"""Перевод полного комментария дня и кэширование единым блоком."""
from __future__ import annotations
import hashlib
import json
import logging
from .openrouter import OpenRouterClient, TranslationError

log = logging.getLogger("uvicorn.error")
SCHEMA_VERSION = "v3"


def compute_content_hash(content: dict) -> str:
    """Вычисляет хэш исходного комментария и его мета-токенов."""
    meta = content.get("meta", {})
    raw_parts = [f"{i}:{meta[i].get('w', '')}" for i in sorted(meta.keys(), key=lambda x: int(x))]
    text = "|".join(raw_parts)
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


def comment_cache_key(date: str, lang: str, content_hash: str, schema_ver: str = SCHEMA_VERSION) -> str:
    """Составной cache key для полного комментария: дата + язык + хэш материала + версия схемы."""
    lang_tag = "ru-EN" if lang == "en" else ("es-RU" if lang == "es" else "ru-ES")
    raw = f"full_comment|{schema_ver}|{lang_tag}|{date}|{content_hash}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def _flatten_nodes(nodes) -> list[str]:
    texts = []
    for n in nodes:
        if n.get("t") in ("text", "w"):
            texts.append(n.get("s", ""))
        elif "c" in n:
            texts.extend(_flatten_nodes(n.get("c", [])))
    return texts


def extract_full_text(content: dict) -> str:
    blocks = [content.get("verse", {})] + list(content.get("comment", []))
    lines = []
    for blk in blocks:
        nodes = blk.get("nodes", [])
        lines.append("".join(_flatten_nodes(nodes)))
    return " ".join(filter(None, lines))


class TranslationService:
    def __init__(self, store, client: OpenRouterClient | None, max_share: float = 0.5):
        self.store, self.client, self.max_share = store, client, max_share

    def _get_cache_key(self, content: dict, lang: str = "ru") -> str:
        date = content.get("date", "")
        c_hash = compute_content_hash(content)
        return comment_cache_key(date, lang, c_hash)

    def cached(self, content: dict, lang: str = "ru") -> tuple[dict[int, str], str]:
        key = self._get_cache_key(content, lang)
        cached_tr = self.store.get_comment_translation(key)
        if cached_tr is not None:
            return cached_tr, "ready"
        return {}, ("pending" if self.client else "unavailable")

    async def ensure(self, content: dict, spanish_reference: str = "", lang: str = "ru") -> tuple[dict[int, str], str]:
        key = self._get_cache_key(content, lang)
        cached_tr = self.store.get_comment_translation(key)
        if cached_tr is not None:
            return cached_tr, "ready"

        if not self.client:
            return {}, "unavailable"

        meta = content.get("meta", {})
        ids = sorted([int(k) for k in meta.keys()])
        if not ids:
            return {}, "ready"

        items = [
            {
                "id": i,
                "word": meta[str(i)]["w"],
                "lemma": meta[str(i)].get("lemma", meta[str(i)]["w"]),
                "sentence": meta[str(i)].get("sent", ""),
            }
            for i in ids
        ]

        full_text = extract_full_text(content)

        try:
            new_tr = await self.client.translate_full_comment(
                full_text=full_text,
                items=items,
                spanish_reference=spanish_reference,
                lang=lang,
            )
        except Exception as e:
            log.warning("Full comment translation failed: %s", e)
            return {}, "failed"

        if not isinstance(new_tr, dict):
            return {}, "failed"

        self.store.put_comment_translation(key, new_tr)
        return new_tr, "ready"

    async def generate_tts(self, *, word: str, sentence: str = "", lang: str = "es"):
        if not word or not self.client:
            return None
        try:
            return await self.client.generate_tts(word=word, sentence=sentence, lang=lang)
        except TranslationError as e:
            log.warning("generate_tts failed: %s", e)
            return None

    async def generate_pronunciation(self, *, word: str, sentence: str = "", lang: str = "es"):
        if not word or not self.client:
            return None
        try:
            return await self.client.generate_pronunciation(word=word, sentence=sentence, lang=lang)
        except TranslationError as e:
            log.warning("generate_pronunciation failed: %s", e)
            return None

"""Клиент OpenRouter. Ключ — только из env на backend."""
from __future__ import annotations
import asyncio
import json
import logging
import re
import httpx

log = logging.getLogger("uvicorn.error")
URL = "https://openrouter.ai/api/v1/chat/completions"
TTS_URL = "https://openrouter.ai/api/v1/audio/speech"
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
    "You translate single English words, as used in a given English sentence, into Russian "
    "for a language-learning reader. For each item return the Russian word or short phrase (max 3 words) "
    "that can translate the English word in place, matching its grammatical form and meaning in context. "
    "Keep the first letter capitalised if the source word is. "
    "Use the provided English sentence and the Russian WOL reference context to choose the most natural term "
    "used in official JW Russian material when relevant. "
    'Answer with JSON only: {"translations":[{"id":<int>,"es":"<text>"}]}'
)
SYSTEM_ES_RU = (
    "You translate single Spanish words, as used in a given Spanish sentence, into Russian "
    "for a language-learning reader. For each item return the Russian word or short phrase (max 3 words) "
    "that can translate the Spanish word in place, matching its grammatical form and meaning in context. "
    "Keep the first letter capitalised if the source word is. "
    "Use the provided Spanish sentence and the Russian WOL reference context to choose the most natural term "
    "used in official JW Russian material when relevant. "
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
SINGLE_SYSTEM_ES_RU = (
    "Translate the exact clicked Spanish word into Russian only, not the surrounding words. "
    "Use the Spanish sentence and Russian WOL reference context to disambiguate the meaning. "
    "If the clicked word is a single word token, return a single-word Russian translation if possible. "
    "Do not translate a full phrase or a full name when the user clicked only one word. "
    "Keep the answer natural Russian. Keep the first letter capitalised if the source word is. "
    "Return JSON only: {\"translation\": \"<text>\", \"confidence\": 0.0-1.0}. "
    "If the translation is uncertain, return the original word rather than a broader phrase."
)
SINGLE_SYSTEM_EN_RU = (
    "Translate the exact clicked English word into Russian only, not the surrounding words. "
    "Use the English sentence and Russian WOL reference context to disambiguate the meaning. "
    "If the clicked word is a single word token, return a single-word Russian translation if possible. "
    "Do not translate a full phrase or a full name when the user clicked only one word. "
    "Keep the answer natural Russian. Keep the first letter capitalised if the source word is. "
    "Return JSON only: {\"translation\": \"<text>\", \"confidence\": 0.0-1.0}. "
    "If the translation is uncertain, return the original word rather than a broader phrase."
)

SYSTEM_PRONUNCIATION = (
    "You are a linguistic expert and phonetician. "
    "For the given target word in its sentence context, generate: "
    "1) ipa: standard IPA phonetic transcription inside brackets [ ... ] "
    "2) ru_hint: natural Russian pronunciation hint with stress mark (\u0301) on the stressed vowel. "
    "Return JSON only: {\"ipa\": \"[...]\", \"ru_hint\": \"...\"}"
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
            i = int(r["id"])
            val = str(r.get("es") if r.get("es") is not None else (r.get("ru") if r.get("ru") is not None else r.get("translation", ""))).strip()
        except (KeyError, TypeError, ValueError):
            continue
        if i in allowed_ids and val and len(val) <= 60:
            if lang in ("en", "es"):
                out[i] = val
            elif not CYR.search(val):
                out[i] = val
    return out


def parse_single_response(text: str, lang: str = "ru") -> str:
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    try:
        data = json.loads(text)
        tr = data.get("translation") if isinstance(data, dict) else None
        if tr is None and isinstance(data, dict):
            tr = data.get("ru") or data.get("es")
        if not isinstance(tr, str):
            raise TranslationError("translation field missing")
        tr = tr.strip()
        if not tr or len(tr) > 60:
            raise TranslationError("translation invalid")
        if lang not in ("en", "es") and CYR.search(tr):
            raise TranslationError("translation invalid")
        return tr
    except (ValueError, TypeError, KeyError) as e:
        raise TranslationError(f"Некорректный JSON от модели: {e}") from e


def parse_pronunciation_response(text: str) -> dict[str, str]:
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    try:
        data = json.loads(text)
        ipa = str(data.get("ipa", "")).strip()
        ru_hint = str(data.get("ru_hint") or data.get("ruHint") or "").strip()
        return {"ipa": ipa, "ru_hint": ru_hint}
    except (ValueError, TypeError, KeyError) as e:
        raise TranslationError(f"Invalid JSON from pronunciation model: {e}") from e


class OpenRouterClient:
    def __init__(self, api_key: str, model: str, http: httpx.AsyncClient | None = None):
        self.api_key, self.model, self._http = api_key, model, http

    async def generate_tts(self, *, word: str, lang: str = "es") -> dict[str, str]:
        import base64
        body = {
            "model": "x-ai/grok-voice-tts-1.0",
            "input": word,
            "voice": "eve",
            "response_format": "mp3",
        }
        headers = {"Authorization": f"Bearer {self.api_key}", "X-Title": "Daily Reader"}
        own = self._http is None
        http = self._http or httpx.AsyncClient(timeout=30)
        try:
            r = await http.post(TTS_URL, json=body, headers=headers)
            if not r.is_success:
                err_text = r.text[:500].replace("\n", " ")
                log.warning(
                    "OpenRouter TTS failure (model=%s, voice=%s, status=%s): %s",
                    body["model"],
                    body["voice"],
                    r.status_code,
                    err_text,
                )
            r.raise_for_status()
            audio_bytes = r.content
            if not audio_bytes:
                raise TranslationError("No audio content returned from TTS model")
            audio_b64 = base64.b64encode(audio_bytes).decode("ascii")
            return {"audio_b64": audio_b64, "format": "mp3"}
        except Exception as e:
            log.warning("generate_tts failed: %s", e)
            raise TranslationError(f"TTS generation failed: {e}") from e
        finally:
            if own:
                await http.aclose()

    async def generate_pronunciation(self, *, word: str, sentence: str, lang: str = "es") -> dict[str, str]:
        payload = {"word": word, "sentence": sentence, "language": lang}
        body = {
            "model": self.model,
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": SYSTEM_PRONUNCIATION},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
        }
        headers = {"Authorization": f"Bearer {self.api_key}", "X-Title": "Daily Reader"}
        own = self._http is None
        http = self._http or httpx.AsyncClient(timeout=30)
        try:
            r = await http.post(URL, json=body, headers=headers)
            if r.status_code == 400 and "response_format" in body:
                body.pop("response_format")
                r = await http.post(URL, json=body, headers=headers)
            r.raise_for_status()
            content = r.json()["choices"][0]["message"]["content"]
            return parse_pronunciation_response(content)
        except Exception as e:
            log.warning("generate_pronunciation failed: %s", e)
            raise TranslationError(f"Pronunciation generation failed: {e}") from e
        finally:
            if own:
                await http.aclose()

    async def translate_word(self, *, word: str, lemma: str, sentence: str, context: str, spanish_reference: str | None = None, lang: str = "ru") -> str:
        """Перевод одного слова в контексте."""
        payload = {
            "word": word,
            "lemma": lemma,
            "sentence": sentence,
            "context": context,
            "spanish_reference": spanish_reference or "",
        }
        system_prompt = SINGLE_SYSTEM_EN_RU if lang == "en" else (SINGLE_SYSTEM_ES_RU if lang == "es" else SINGLE_SYSTEM_RU_ES)
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
        system_prompt = SYSTEM_EN_RU if lang == "en" else (SYSTEM_ES_RU if lang == "es" else SYSTEM_RU_ES)
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

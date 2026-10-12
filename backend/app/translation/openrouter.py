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

SYSTEM_RU_ES_COMMENT = (
    "You translate Russian words or short phrases from the provided full daily comment/text into Argentine Spanish (es-AR) "
    "for an interactive language-learning reader. You are given the complete original text and a list of translatable items with unique integer IDs.\n"
    "For each item in 'items', return the Spanish word or short phrase (up to 4 words) that can REPLACE the Russian item in place, "
    "matching its exact grammatical role, tense, person, number, and context in the text.\n"
    "Key guidelines:\n"
    "- Complete translations: If a word naturally translates as a multi-word phrase, return the full phrase. Do not truncate to a single incomplete word.\n"
    "- Contextual grammar: Match the exact syntactic function in sentence and text context.\n"
    "- Capitalization: Keep the first letter capitalized if the source item is capitalized.\n"
    "- Style: Use natural Argentine Spanish (es-AR), neutral, no 'vosotros'. Use the provided text and Spanish WOL context.\n"
    "- ID and Word Validation: Each item in your response MUST explicitly include 'id' (int), 'word' (original source word), and 'es' (translated text).\n"
    'Answer with JSON only: {"translations":[{"id":<int>,"word":"<source_word>","es":"<text>"}]}'
)

SYSTEM_ES_RU_COMMENT = (
    "You translate Spanish words or short phrases from the provided full daily comment/text into Russian "
    "for an interactive language-learning reader. You are given the complete original text and a list of translatable items with unique integer IDs.\n"
    "For each item in 'items', return the Russian word or short phrase (up to 4 words) that can REPLACE the Spanish item in place, "
    "matching its exact grammatical role and meaning in context.\n"
    "Key guidelines:\n"
    "- Complete translations: Provide full, natural Russian phrases where appropriate (e.g. 'maltraten' -> 'плохо обращаются', 'desagrada' -> 'не нравится'). Do not truncate into an incomplete single word.\n"
    "- Contextual grammar: Match the exact syntactic function in context (e.g. in 'de manera dura y desconsiderada', translate 'desconsiderada' as 'неуважительно').\n"
    "- Capitalization: Keep the first letter capitalized if the source item is capitalized.\n"
    "- JW Reference: Use the Spanish sentence and Russian WOL reference context to choose natural terminology.\n"
    "- ID and Word Validation: Each item in your response MUST explicitly include 'id' (int), 'word' (original source word), and 'ru' (translated text).\n"
    'Answer with JSON only: {"translations":[{"id":<int>,"word":"<source_word>","ru":"<text>"}]}'
)

SYSTEM_EN_RU_COMMENT = (
    "You translate English words or short phrases from the provided full daily comment/text into Russian "
    "for an interactive language-learning reader. You are given the complete original text and a list of translatable items with unique integer IDs.\n"
    "For each item in 'items', return the Russian word or short phrase (up to 4 words) that can REPLACE the English item in place, "
    "matching its exact grammatical role and meaning in context.\n"
    "Key guidelines:\n"
    "- Complete translations: If a verb or word naturally translates as a multi-word phrase, provide the full phrase. Do not truncate to a single incomplete word.\n"
    "- Contextual grammar: Match the exact syntactic function in sentence and text context.\n"
    "- Capitalization: Keep the first letter capitalized if the source item is capitalized.\n"
    "- JW Reference: Use the English text and Russian WOL reference context to choose natural terminology.\n"
    "- ID and Word Validation: Each item in your response MUST explicitly include 'id' (int), 'word' (original source word), and 'ru' (translated text).\n"
    'Answer with JSON only: {"translations":[{"id":<int>,"word":"<source_word>","ru":"<text>"}]}'
)

SYSTEM_PRONUNCIATION = (
    "You are a linguistic expert and phonetician. "
    "For the given target word in its sentence context, generate: "
    "1) ipa: standard IPA phonetic transcription inside brackets [ ... ] "
    "2) ru_hint: natural Russian pronunciation hint with stress mark (\u0301) on the stressed vowel. "
    "Return JSON only: {\"ipa\": \"[...]\", \"ru_hint\": \"...\"}"
)
SYSTEM_PRONUNCIATION_ES = (
    "You are a linguistic expert and phonetician specializing in standard Spanish. "
    "For the given target word in its sentence context, generate: "
    "1) ipa: standard IPA phonetic transcription inside brackets [ ... ] "
    "2) ru_hint: natural Russian pronunciation hint with stress mark (\u0301) on the stressed vowel. "
    "Return JSON only: {\"ipa\": \"[...]\", \"ru_hint\": \"...\"}"
)


class TranslationError(Exception):
    pass


def parse_response(
    text: str,
    allowed_ids: set[int] | dict[int, str],
    lang: str = "ru"
) -> dict[int, str]:
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    try:
        data = json.loads(text)
        rows = data["translations"] if isinstance(data, dict) else data
    except (ValueError, KeyError, TypeError) as e:
        raise TranslationError(f"Некорректный JSON от модели: {e}") from e

    expected_dict = allowed_ids if isinstance(allowed_ids, dict) else {i: "" for i in allowed_ids}
    valid_ids = set(expected_dict.keys())

    out: dict[int, str] = {}
    for r in rows if isinstance(rows, list) else []:
        try:
            i = int(r["id"])
        except (KeyError, TypeError, ValueError):
            continue

        if i not in valid_ids:
            continue

        expected_word = expected_dict.get(i, "").strip()
        returned_word = str(r.get("word") or r.get("source") or "").strip()
        if expected_word and returned_word and expected_word.lower() != returned_word.lower():
            log.warning("Mismatched token word for id %s: expected '%s', got '%s'", i, expected_word, returned_word)
            continue

        val = str(
            r.get("es") if r.get("es") is not None
            else (r.get("ru") if r.get("ru") is not None
            else r.get("translation", ""))
        ).strip()

        if val and len(val) <= 60:
            if lang in ("en", "es"):
                out[i] = val
            elif not CYR.search(val):
                out[i] = val

    return out


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

    async def generate_tts(self, *, word: str, sentence: str = "", lang: str = "es") -> dict[str, str]:
        import base64
        input_text = f"«{word}»" if lang == "es" else (f'"{word}"' if lang == "en" else word)
        body = {
            "model": "x-ai/grok-voice-tts-1.0",
            "input": input_text,
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
        system_prompt = SYSTEM_PRONUNCIATION_ES if lang == "es" else SYSTEM_PRONUNCIATION
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

    async def translate_full_comment(
        self,
        *,
        full_text: str,
        items: list[dict],
        spanish_reference: str = "",
        lang: str = "ru",
    ) -> dict[int, str]:
        user_content: dict = {
            "full_text": full_text,
            "items": items,
        }
        if spanish_reference:
            user_content["spanish_reference"] = spanish_reference

        system_prompt = (
            SYSTEM_EN_RU_COMMENT if lang == "en"
            else (SYSTEM_ES_RU_COMMENT if lang == "es" else SYSTEM_RU_ES_COMMENT)
        )

        body = {
            "model": self.model,
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(user_content, ensure_ascii=False)},
            ],
        }

        headers = {"Authorization": f"Bearer {self.api_key}", "X-Title": "Daily Reader"}
        own = self._http is None
        http = self._http or httpx.AsyncClient(timeout=60)
        expected_items = {int(it["id"]): str(it["word"]) for it in items}
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
                    return parse_response(content, expected_items, lang=lang)
                except (httpx.HTTPError, TranslationError, KeyError, IndexError, ValueError) as e:
                    last = e
                    log.warning("OpenRouter full comment attempt %s failed: %s", attempt + 1, e)
                    if isinstance(e, TranslationError) and "OpenRouter 40" in str(e):
                        break
                    await asyncio.sleep(0.8 * (attempt + 1))
        finally:
            if own:
                await http.aclose()
        raise TranslationError(f"OpenRouter unavailable: {last}")

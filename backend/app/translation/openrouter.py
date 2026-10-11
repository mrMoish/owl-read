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
    "You translate Russian words or short phrases, as used in a given Russian sentence, into Argentine Spanish (es-AR) "
    "for an interactive language-learning reader. For each item return the Spanish word or short phrase (up to 4 words) "
    "that can REPLACE the Russian item in place, matching its exact grammatical role, tense, person, number, and context.\n"
    "Key guidelines:\n"
    "- Complete translations: If a word naturally translates as a multi-word phrase, return the full phrase. Do not truncate to a single incomplete word.\n"
    "- Contextual grammar: Match the exact syntactic function in sentence context.\n"
    "- Capitalization: Keep the first letter capitalized if the source item is capitalized.\n"
    "- Style: Use natural Argentine Spanish (es-AR), neutral, no 'vosotros'. Use the provided sentence and Spanish WOL context.\n"
    'Answer with JSON only: {"translations":[{"id":<int>,"es":"<text>"}]}'
)
SYSTEM_EN_RU = (
    "You translate English words or short phrases, as used in a given English sentence, into Russian "
    "for an interactive language-learning reader. For each item return the Russian word or short phrase (up to 4 words) "
    "that can REPLACE the English item in place, matching its exact grammatical role and meaning in context.\n"
    "Key guidelines:\n"
    "- Complete translations: If a verb or word naturally translates as a multi-word phrase, provide the full phrase. Do not truncate to a single incomplete word.\n"
    "- Contextual grammar: Match the exact syntactic function in sentence context.\n"
    "- Capitalization: Keep the first letter capitalized if the source item is capitalized.\n"
    "- JW Reference: Use the English sentence and Russian WOL reference context to choose natural terminology.\n"
    'Answer with JSON only: {"translations":[{"id":<int>,"es":"<text>"}]}'
)
SYSTEM_ES_RU = (
    "You translate Spanish words or short phrases, as used in a given Spanish sentence, into Russian "
    "for an interactive language-learning reader. For each item return the Russian word or short phrase (up to 4 words) "
    "that can REPLACE the Spanish item in place, matching its exact grammatical role and meaning in context.\n"
    "Key guidelines:\n"
    "- Complete translations: If a verb or word naturally translates as a multi-word phrase (e.g. 'maltraten' -> 'плохо обращаются', 'desagrada' -> 'не нравится'), provide the full phrase. Do not truncate to a single incomplete word (e.g. do not reduce 'maltraten' to 'плохо').\n"
    "- Contextual grammar: Match the exact syntactic function in context (e.g. in 'de manera dura y desconsiderada', translate 'desconsiderada' as 'неуважительно').\n"
    "- Capitalization: Keep the first letter capitalized if the source item is capitalized.\n"
    "- JW Reference: Use the Spanish sentence and Russian WOL reference context to choose natural terminology.\n"
    'Answer with JSON only: {"translations":[{"id":<int>,"es":"<text>"}]}'
)
SINGLE_SYSTEM_RU_ES = (
    "You translate selected Russian words or phrases in sentence context into Argentine Spanish (es-AR) "
    "for an interactive reading application. The target translation will replace the selected Russian text in place.\n"
    "Follow these rules strictly:\n"
    "1. Multi-word translations: If a Russian word naturally translates into a multi-word phrase in Spanish, return the full, complete phrase (up to 3-4 words). Do not drop essential words.\n"
    "2. Grammatical and contextual fit: Match the exact syntactic role, tense, person, number, and gender in sentence context.\n"
    "3. Selected text only: Translate only the selected target word or phrase, using the sentence and Spanish WOL context. Do not translate unselected neighboring words.\n"
    "4. Formatting: Keep the first letter capitalized if the source word/phrase is capitalized.\n"
    "Return JSON only: {\"translation\": \"<text>\", \"confidence\": 0.8-1.0}."
)
SINGLE_SYSTEM_ES_RU = (
    "You translate selected Spanish words or phrases in sentence context into Russian for an interactive reading application. "
    "The target translation will replace the selected Spanish text in place.\n"
    "Follow these rules strictly:\n"
    "1. Multi-word translations: If a Spanish word or verb naturally translates into a multi-word phrase in Russian (e.g. 'maltraten' -> 'плохо обращаются', 'desagrada' -> 'не нравится'), return the full, complete multi-word phrase (up to 3-4 words). Do not drop essential verbs or truncate into an incomplete single word like 'плохо'.\n"
    "2. Grammatical and contextual fit: Match the exact syntactic role and meaning in sentence context (tense, person, number, case, manner). For example, in constructions like 'de manera dura y desconsiderada', translate 'desconsiderada' using the matching adverb/manner form ('неуважительно') rather than a default masculine adjective ('невнимательный').\n"
    "3. Selected text only: Translate only the selected target word or phrase, using the sentence and Russian WOL reference for context. Do not translate unselected neighboring words.\n"
    "4. Formatting: Keep the first letter capitalized if the source word/phrase is capitalized.\n"
    "Return JSON only: {\"translation\": \"<text>\", \"confidence\": 0.8-1.0}."
)
SINGLE_SYSTEM_EN_RU = (
    "You translate selected English words or phrases in sentence context into Russian for an interactive reading application. "
    "The target translation will replace the selected English text in place.\n"
    "Follow these rules strictly:\n"
    "1. Multi-word translations: If an English word or verb naturally translates into a multi-word phrase in Russian, return the full, complete multi-word phrase (up to 3-4 words). Do not drop essential verbs or truncate into an incomplete single word.\n"
    "2. Grammatical and contextual fit: Match the exact syntactic role and meaning in sentence context (tense, person, number, case, manner).\n"
    "3. Selected text only: Translate only the selected target word or phrase, using the sentence and Russian WOL reference for context. Do not translate unselected neighboring words.\n"
    "4. Formatting: Keep the first letter capitalized if the source word/phrase is capitalized.\n"
    "Return JSON only: {\"translation\": \"<text>\", \"confidence\": 0.8-1.0}."
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

"""Токенизация, лемматизация (pymorphy3), контекст предложения.

Текстовые узлы блока заменяются последовательностью:
  {"t":"w","id":N,"s":"слово"}  — интерактивное русское слово
  {"t":"text","s":"..."}         — всё остальное (пробелы, пунктуация, цифры)
"""
from __future__ import annotations
import bisect
import re
from functools import lru_cache
import pymorphy3

SENT_RE = re.compile(r"(?<=[.!?…])[»\"\)]*\s+(?=[«\"—А-ЯЁA-ZÁÉÍÓÚÑÜ])")

ES_PHRASES = [
    "a causa de",
    "a fin de",
    "a menos que",
    "a pesar de",
    "a través de",
    "al menos",
    "antes de",
    "así que",
    "cerca de",
    "dado que",
    "de hecho",
    "debido a",
    "después de",
    "en cuanto a",
    "en lugar de",
    "en medio de",
    "en vez de",
    "gracias a",
    "hoy en día",
    "junto a",
    "lejos de",
    "más bien",
    "ni siquiera",
    "para que",
    "por ejemplo",
    "por favor",
    "por fin",
    "por lo tanto",
    "por supuesto",
    "sin duda",
    "sin embargo",
    "tal vez",
    "ya que",
]

EN_PHRASES = [
    "according to",
    "as long as",
    "as soon as",
    "as well as",
    "at least",
    "because of",
    "due to",
    "even if",
    "for example",
    "in fact",
    "in order to",
    "instead of",
    "no longer",
    "so that",
    "such as",
]

RU_PHRASES = [
    "без сомнения",
    "в отличие от",
    "в результате",
    "в течение",
    "в то время как",
    "вместо того чтобы",
    "для того чтобы",
    "до тех пор пока",
    "на самом деле",
    "несмотря на",
    "ни разу",
    "по крайней мере",
    "потому что",
    "с тех пор как",
    "так как",
    "так что",
    "тем не менее",
]


@lru_cache(maxsize=8)
def get_word_re(lang: str = "ru") -> re.Pattern:
    if lang == "en":
        phrases = EN_PHRASES
        single = r"[A-Za-z]+(?:-[A-Za-z]+)*"
    elif lang == "es":
        phrases = ES_PHRASES
        single = r"[A-Za-zÁÉÍÓÚáéíóúÑñÜü]+(?:-[A-Za-zÁÉÍÓÚáéíóúÑñÜü]+)*"
    else:
        phrases = RU_PHRASES
        single = r"[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*"

    sorted_phrases = sorted(phrases, key=len, reverse=True)
    phrase_pattern = "|".join(r"\b" + r"\s+".join(map(re.escape, p.split())) + r"\b" for p in sorted_phrases)
    if phrase_pattern:
        pattern = f"(?:{phrase_pattern})|{single}"
    else:
        pattern = single
    return re.compile(pattern, re.IGNORECASE if phrase_pattern else 0)


@lru_cache(maxsize=1)
def _morph() -> pymorphy3.MorphAnalyzer:
    return pymorphy3.MorphAnalyzer()


def judge(word: str, first_in_sentence: bool, lang: str = "ru"):
    """Любое обычное слово интерактивно."""
    if not word or len(word) < 1:
        return None
    if len(word) > 1 and word.isupper():
        return None
    if lang == "en":
        return (word.lower(), "EN")
    if lang == "es":
        return (word.lower(), "ES")
    parses = _morph().parse(word.lower())
    if not parses:
        return None
    best = parses[0]
    lemma = best.normal_form
    pos = str(best.tag.POS or "")
    return (lemma, pos)


class _Ctx:
    def __init__(self, plain: str):
        self.plain = plain
        self.pos = 0
        self.starts = [0] + [m.end() for m in SENT_RE.finditer(plain)]
        self.ends = self.starts[1:] + [len(plain)]

    def sentence(self, off: int):
        i = max(0, bisect.bisect_right(self.starts, off) - 1)
        start = self.starts[i]
        end = self.ends[i]
        sentence = self.plain[start:end].strip()
        if not sentence:
            sentence = self.plain.strip()
        return start, sentence


def _plain(nodes) -> str:
    return "".join(n["s"] if n["t"] == "text" else _plain(n.get("c", [])) for n in nodes)


def format_text_node(s: str) -> str:
    if not s:
        return s
    s = re.sub(r" +([—–])", "\u00a0\\1", s)
    s = re.sub(r"\s+([,.\!?:;\)\]\}\»”\…%])", "\\1", s)
    s = re.sub(r"([«\(\[\{“]) +", "\\1\u00a0", s)
    return s


def _merge(nodes):
    out = []
    for n in nodes:
        if n["t"] == "text" and out and out[-1]["t"] == "text":
            out[-1] = {"t": "text", "s": format_text_node(out[-1]["s"] + n["s"])}
        else:
            if n["t"] == "text":
                out.append({"t": "text", "s": format_text_node(n["s"])})
            else:
                out.append(n)
    return out


def analyze_blocks(blocks: list[dict], start_id: int = 0, lang: str = "ru"):
    """-> (новые блоки, meta {id: {w, lemma, sent}}, next_id)"""
    meta: dict[int, dict] = {}
    nid = start_id
    out_blocks = []
    word_re = get_word_re(lang)
    for blk in blocks:
        ctx = _Ctx(_plain(blk["nodes"]))

        def walk(nodes):
            nonlocal nid
            res = []
            for n in nodes:
                if n["t"] != "text":
                    res.append({**n, "c": walk(n.get("c", []))})
                    continue
                s, base, last = n["s"], ctx.pos, 0
                for m in word_re.finditer(s):
                    sstart, sent = ctx.sentence(base + m.start())
                    first = not re.search(r"\w", ctx.plain[sstart:base + m.start()])
                    j = judge(m.group(), first, lang=lang)
                    if j:
                        if m.start() > last:
                            res.append({"t": "text", "s": format_text_node(s[last:m.start()])})
                        res.append({"t": "w", "id": nid, "s": m.group()})
                        meta[nid] = {"w": m.group(), "lemma": j[0], "pos": j[1], "sent": sent}
                        nid += 1
                        last = m.end()
                if last < len(s):
                    res.append({"t": "text", "s": format_text_node(s[last:])})
                ctx.pos += len(s)
            return _merge(res)

        out_blocks.append({**blk, "nodes": walk(blk["nodes"])})
    return out_blocks, meta, nid


def priority_order(meta: dict[int, dict]) -> list[int]:
    """Возвращает все слова в порядке появления."""
    return sorted(meta.keys())

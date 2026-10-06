"""Токенизация, лемматизация (pymorphy3), частотность (wordfreq), контекст предложения.

Текстовые узлы блока заменяются последовательностью:
  {"t":"w","id":N,"s":"слово"}  — кандидат на перевод
  {"t":"text","s":"..."}         — всё остальное
"""
from __future__ import annotations
import bisect
import re
from functools import lru_cache
import pymorphy3
from wordfreq import zipf_frequency

WORD_RE = re.compile(r"[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*")
SENT_RE = re.compile(r"(?<=[.!?…])[»\")]*\s+(?=[«\"—А-ЯЁA-Z])")
ALLOWED_POS = {"NOUN", "VERB", "INFN", "ADJF", "ADJS", "ADVB", "PRTF", "PRTS", "GRND"}
PROPER = {"Name", "Surn", "Patr", "Geox", "Orgn", "Abbr", "Init"}
KEEP_CAPITALIZED = {"бог"}  # «Бог» переводим (Dios), остальные имена оставляем
STOP_LEMMAS = {"быть", "стать", "мочь", "являться", "есть", "этот", "весь", "свой", "самый"}
MIN_ZIPF = 3.0  # реже ~1 раза на миллион слов — не «полезное» слово
MIN_LEN = 3


@lru_cache(maxsize=1)
def _morph() -> pymorphy3.MorphAnalyzer:
    return pymorphy3.MorphAnalyzer()


def judge(word: str, first_in_sentence: bool):
    """Возвращает (lemma, zipf) если слово подходит для изучения, иначе None."""
    if len(word) < MIN_LEN or "-" in word:
        return None
    if len(word) > 1 and word.isupper():  # аббревиатура
        return None
    cap = word[0].isupper()
    parses = _morph().parse(word.lower())
    best = parses[0]
    lemma = best.normal_form
    if cap and not first_in_sentence and lemma not in KEEP_CAPITALIZED:
        return None  # имя собственное / название
    if cap and first_in_sentence and any(p.score >= 0.2 and PROPER & set(p.tag.grammemes) for p in parses):
        return None
    if best.tag.POS not in ALLOWED_POS or lemma in STOP_LEMMAS:
        return None
    z = zipf_frequency(lemma, "ru")
    return (lemma, z) if z >= MIN_ZIPF else None


class _Ctx:
    def __init__(self, plain: str):
        self.plain = plain
        self.pos = 0
        self.starts = [0] + [m.end() for m in SENT_RE.finditer(plain)]
        self.ends = self.starts[1:] + [len(plain)]

    def sentence(self, off: int):
        i = bisect.bisect_right(self.starts, off) - 1
        return self.starts[i], self.plain[self.starts[i]:self.ends[i]].strip()


def _plain(nodes) -> str:
    return "".join(n["s"] if n["t"] == "text" else _plain(n.get("c", [])) for n in nodes)


def _merge(nodes):
    out = []
    for n in nodes:
        if n["t"] == "text" and out and out[-1]["t"] == "text":
            out[-1] = {"t": "text", "s": out[-1]["s"] + n["s"]}
        else:
            out.append(n)
    return out


def analyze_blocks(blocks: list[dict], start_id: int = 0):
    """-> (новые блоки, meta {id: {w, lemma, zipf, sent}}, next_id)"""
    meta: dict[int, dict] = {}
    nid = start_id
    out_blocks = []
    for blk in blocks:
        ctx = _Ctx(_plain(blk["nodes"]))

        def walk(nodes, in_link):
            nonlocal nid
            res = []
            for n in nodes:
                if n["t"] != "text":
                    res.append({**n, "c": walk(n.get("c", []), in_link or n["t"] == "a")})
                    continue
                s, base, last = n["s"], ctx.pos, 0
                for m in WORD_RE.finditer(s):
                    j = None
                    if not in_link:
                        sstart, sent = ctx.sentence(base + m.start())
                        first = not re.search(r"\w", ctx.plain[sstart:base + m.start()])
                        j = judge(m.group(), first)
                    if j:
                        if m.start() > last:
                            res.append({"t": "text", "s": s[last:m.start()]})
                        res.append({"t": "w", "id": nid, "s": m.group()})
                        meta[nid] = {"w": m.group(), "lemma": j[0], "zipf": j[1], "sent": sent}
                        nid += 1
                        last = m.end()
                if last < len(s):
                    res.append({"t": "text", "s": s[last:]})
                ctx.pos += len(s)
            return _merge(res)

        out_blocks.append({**blk, "nodes": walk(blk["nodes"], False)})
    return out_blocks, meta, nid


def priority_order(meta: dict[int, dict]) -> list[int]:
    """Сначала частотные (полезные) слова; при равенстве — по порядку в тексте."""
    return sorted(meta, key=lambda i: (-round(meta[i]["zipf"], 1), i))

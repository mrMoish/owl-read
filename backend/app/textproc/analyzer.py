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

WORD_RE = re.compile(r"[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*")
EN_WORD_RE = re.compile(r"[A-Za-z]+(?:-[A-Za-z]+)*")
SENT_RE = re.compile(r"(?<=[.!?…])[»\"\)]*\s+(?=[«\"—А-ЯЁA-Z])")


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


def _merge(nodes):
    out = []
    for n in nodes:
        if n["t"] == "text" and out and out[-1]["t"] == "text":
            out[-1] = {"t": "text", "s": out[-1]["s"] + n["s"]}
        else:
            out.append(n)
    return out


def analyze_blocks(blocks: list[dict], start_id: int = 0, lang: str = "ru"):
    """-> (новые блоки, meta {id: {w, lemma, sent}}, next_id)"""
    meta: dict[int, dict] = {}
    nid = start_id
    out_blocks = []
    word_re = EN_WORD_RE if lang == "en" else WORD_RE
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
                for m in word_re.finditer(s):
                    j = None
                    if not in_link:
                        sstart, sent = ctx.sentence(base + m.start())
                        first = not re.search(r"\w", ctx.plain[sstart:base + m.start()])
                        j = judge(m.group(), first, lang=lang)
                    if j:
                        if m.start() > last:
                            res.append({"t": "text", "s": s[last:m.start()]})
                        res.append({"t": "w", "id": nid, "s": m.group()})
                        meta[nid] = {"w": m.group(), "lemma": j[0], "pos": j[1], "sent": sent}
                        nid += 1
                        last = m.end()
                if last < len(s):
                    res.append({"t": "text", "s": s[last:]})
                ctx.pos += len(s)
            return _merge(res)

        out_blocks.append({**blk, "nodes": walk(blk["nodes"], False)})
    return out_blocks, meta, nid


def priority_order(meta: dict[int, dict]) -> list[int]:
    """Возвращает все слова в порядке появления."""
    return sorted(meta.keys())

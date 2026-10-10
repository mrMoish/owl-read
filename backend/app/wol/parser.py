"""HTML WOL -> нейтральная структура. Единственное место, знающее про разметку WOL.

Результат: {"date_label", "title", "verse": Block, "comment": [Block]}
  Block = {"type": "p", "nodes": [Node]}
  Node  = {"t":"text","s"} | {"t":"em"|"strong","c":[Node]} | {"t":"a","href","c":[Node]}
"""
from __future__ import annotations
import re
from datetime import date
from urllib.parse import urljoin
from bs4 import BeautifulSoup, NavigableString, Tag
from .fetcher import WolError

MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа",
          "сентября", "октября", "ноября", "декабря"]
ES_MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
             "septiembre", "octubre", "noviembre", "diciembre"]
EN_MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august",
             "september", "october", "november", "december"]
STOP_PREFIXES = ("добро пожаловать", "поделиться", "это онлайн-библиотека",
                 "bienvenido", "compartir", "esta es una biblioteca",
                 "welcome", "share", "this is a research tool")


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace("\u0301", "").replace("\xa0", " "))


def _inline(el: Tag, base: str) -> list:
    out: list = []
    for ch in el.children:
        if isinstance(ch, NavigableString):
            if str(ch):
                out.append({"t": "text", "s": _clean(str(ch))})
        elif isinstance(ch, Tag):
            if ch.name in ("em", "i"):
                out.append({"t": "em", "c": _inline(ch, base)})
            elif ch.name in ("strong", "b"):
                out.append({"t": "strong", "c": _inline(ch, base)})
            elif ch.name == "a":
                out.append({"t": "a", "href": urljoin(base, ch.get("href", "")), "c": _inline(ch, base)})
            elif ch.name == "br":
                out.append({"t": "text", "s": " "})
            elif ch.name in ("script", "style", "sup"):
                continue
            else:
                out.extend(_inline(ch, base))
    return out


def _edge_text(nodes, end):
    for n in (reversed(nodes) if end else nodes):
        if n["t"] == "text":
            return n
        if "c" in n:
            r = _edge_text(n["c"], end)
            if r:
                return r
    return None


def _trim(nodes):
    a, b = _edge_text(nodes, False), _edge_text(nodes, True)
    if a: a["s"] = a["s"].lstrip()
    if b: b["s"] = b["s"].rstrip()
    return nodes


def _text(p: Tag) -> str:
    return _clean(p.get_text(" ", strip=True)).strip()


def _is_link_only(p: Tag) -> bool:
    links = "".join(a.get_text() for a in p.find_all("a")).strip()
    return bool(links) and links == p.get_text().strip() and len(links) < 120


def _container(h2: Tag) -> Tag:
    node = h2
    while node.parent is not None and node.parent.name not in ("body", "html", "[document]"):
        if len(node.parent.find_all("h2")) > 1:
            break
        node = node.parent
    return node


def parse_wol_page(html: str, day: date, base: str = "https://wol.jw.org") -> dict:
    soup = BeautifulSoup(html, "html.parser")
    ru_label = f"{day.day} {MONTHS[day.month - 1]}"
    es_label = f"{day.day} de {ES_MONTHS[day.month - 1]}"
    en_label_1 = f"{EN_MONTHS[day.month - 1]} {day.day}"
    en_label_2 = f"{day.day} {EN_MONTHS[day.month - 1]}"
    heading = next((h for h in soup.find_all("h2")
                    if ru_label in _clean(h.get_text()).lower() or
                       es_label in _clean(h.get_text()).lower() or
                       en_label_1 in _clean(h.get_text()).lower() or
                       en_label_2 in _clean(h.get_text()).lower()), None)
    if heading is None:
        raise WolError(f"На странице нет материала за {ru_label} (разметка изменилась или дата недоступна)")

    cont = _container(heading)
    if cont is heading:  # h2 и абзацы — соседи в общем родителе
        paras = []
        for sib in heading.next_siblings:
            if isinstance(sib, Tag):
                if sib.name == "h2":
                    break
                paras.extend([sib] if sib.name == "p" else sib.find_all("p"))
    else:
        paras = [p for p in cont.find_all("p") if not p.find_parent(["header", "footer", "nav"])]

    body, title = [], None
    for p in paras:
        t = _text(p)
        if not t:
            continue
        if t.lower().startswith(STOP_PREFIXES):
            break
        if body and _is_link_only(p):
            title = t
            break
        body.append(p)
    if not body:
        raise WolError("Не удалось найти стих и комментарий в разметке WOL")

    def block(p: Tag) -> dict:
        nodes = _trim(_inline(p, base))
        while len(nodes) == 1 and nodes[0]["t"] == "em":  # стих целиком в <em>
            nodes = nodes[0]["c"]
        return {"type": "p", "nodes": nodes}

    verse, comment = block(body[0]), [block(p) for p in body[1:]]
    if not comment:
        raise WolError("Комментарий к стиху пуст")
    return {"date_label": _clean(heading.get_text()).strip(), "title": title, "verse": verse, "comment": comment}

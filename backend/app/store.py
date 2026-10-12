"""SQLite: кэш ежедневного материала и кэш переводов."""
from __future__ import annotations
import json
import sqlite3
import threading
import time
from pathlib import Path


class Store:
    def __init__(self, path):
        if str(path) != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(str(path), check_same_thread=False)
        self._lock = threading.Lock()
        with self._lock:
            self._db.executescript(
                """CREATE TABLE IF NOT EXISTS daily(
                     date TEXT PRIMARY KEY, content TEXT NOT NULL, fetched_at REAL NOT NULL);
                   CREATE TABLE IF NOT EXISTS daily_es(
                     date TEXT PRIMARY KEY, content TEXT NOT NULL, fetched_at REAL NOT NULL);
                   CREATE TABLE IF NOT EXISTS daily_en(
                     date TEXT PRIMARY KEY, content TEXT NOT NULL, fetched_at REAL NOT NULL);
                   CREATE TABLE IF NOT EXISTS translations(
                     key TEXT PRIMARY KEY, es TEXT NOT NULL, created_at REAL NOT NULL);"""
            )

    def _table(self, lang: str = "ru"):
        if lang == "en":
            return "daily_en"
        return "daily" if lang == "ru" else "daily_es"

    def get_daily(self, date: str, lang: str = "ru"):
        table = self._table(lang)
        with self._lock:
            r = self._db.execute(f"SELECT content FROM {table} WHERE date=?", (date,)).fetchone()
        return json.loads(r[0]) if r else None

    def latest_daily(self, lang: str = "ru"):
        table = self._table(lang)
        with self._lock:
            r = self._db.execute(f"SELECT content FROM {table} ORDER BY date DESC LIMIT 1").fetchone()
        return json.loads(r[0]) if r else None

    def put_daily(self, date: str, content: dict, lang: str = "ru") -> None:
        table = self._table(lang)
        with self._lock, self._db:
            self._db.execute(f"INSERT OR REPLACE INTO {table} VALUES(?,?,?)",
                             (date, json.dumps(content, ensure_ascii=False), time.time()))

    def get_translations(self, keys):
        out = {}
        with self._lock:
            for i in range(0, len(keys), 500):
                part = keys[i:i + 500]
                q = ",".join("?" * len(part))
                for k, es in self._db.execute(f"SELECT key, es FROM translations WHERE key IN ({q})", part):
                    out[k] = es
        return out

    def put_translations(self, items: dict) -> None:
        with self._lock, self._db:
            self._db.executemany("INSERT OR REPLACE INTO translations VALUES(?,?,?)",
                                 [(k, v, time.time()) for k, v in items.items()])

    def get_comment_translation(self, key: str) -> dict[int, str] | None:
        res = self.get_translations([key])
        if key in res:
            try:
                data = json.loads(res[key])
                return {int(k): str(v) for k, v in data.items()}
            except Exception:
                return None
        return None

    def put_comment_translation(self, key: str, translations: dict[int, str]) -> None:
        data_str = json.dumps({str(k): v for k, v in translations.items()}, ensure_ascii=False)
        self.put_translations({key: data_str})

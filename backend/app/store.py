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
                   CREATE TABLE IF NOT EXISTS translations(
                     key TEXT PRIMARY KEY, es TEXT NOT NULL, created_at REAL NOT NULL);"""
            )

    def get_daily(self, date: str):
        with self._lock:
            r = self._db.execute("SELECT content FROM daily WHERE date=?", (date,)).fetchone()
        return json.loads(r[0]) if r else None

    def latest_daily(self):
        with self._lock:
            r = self._db.execute("SELECT content FROM daily ORDER BY date DESC LIMIT 1").fetchone()
        return json.loads(r[0]) if r else None

    def put_daily(self, date: str, content: dict) -> None:
        with self._lock, self._db:
            self._db.execute("INSERT OR REPLACE INTO daily VALUES(?,?,?)",
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

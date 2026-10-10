from __future__ import annotations
import os
from dataclasses import dataclass
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()
ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Settings:
    openrouter_api_key: str
    openrouter_model: str
    db_path: Path
    timezone: str
    wol_base_url: str
    es_wol_base_url: str
    en_wol_base_url: str
    translate_max_share: float  # legacy, kept for compatibility but no longer used by UX
    frontend_dist: Path


def get_settings() -> Settings:
    return Settings(
        openrouter_api_key=os.environ.get("OPENROUTER_API_KEY", "").strip(),
        openrouter_model=os.environ.get("OPENROUTER_MODEL", "openai/gpt-4o-mini"),
        db_path=Path(os.environ.get("DB_PATH", ROOT / "backend" / "data" / "app.sqlite3")),
        timezone=os.environ.get("APP_TIMEZONE", "America/Argentina/Buenos_Aires"),
        wol_base_url=os.environ.get("WOL_BASE_URL", "https://wol.jw.org/ru/wol/h/r2/lp-u/2026/10/8"),
        es_wol_base_url=os.environ.get("WOL_ES_BASE_URL", "https://wol.jw.org/es/wol/h/r4/lp-s/2026/10/8"),
        en_wol_base_url=os.environ.get("WOL_EN_BASE_URL", "https://wol.jw.org/en/wol/h/r1/lp-e/2026/10/8"),
        translate_max_share=0.5,
        frontend_dist=ROOT / "frontend" / "dist",
    )

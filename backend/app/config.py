from dataclasses import dataclass
import os
from pathlib import Path


@dataclass
class Settings:
    db_path: Path
    openrouter_api_key: str
    openrouter_model: str
    translate_max_share: float
    timezone: str
    frontend_dist: Path


def get_settings() -> Settings:
    root = Path(__file__).resolve().parent.parent.parent
    db_dir = root / "data"
    db_dir.mkdir(exist_ok=True)
    frontend_dist = root / "frontend" / "dist"

    return Settings(
        db_path=db_dir / "reader.db",
        openrouter_api_key=os.environ.get("OPENROUTER_API_KEY", "").strip(),
        openrouter_model=os.environ.get("OPENROUTER_MODEL", "x-ai/grok-voice-tts-1.0").strip(),
        translate_max_share=float(os.environ.get("TRANSLATE_MAX_SHARE", "0.5")),
        timezone=os.environ.get("APP_TIMEZONE", "Europe/Moscow"),
        frontend_dist=frontend_dist,
    )

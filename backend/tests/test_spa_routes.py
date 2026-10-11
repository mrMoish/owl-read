import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.config import get_settings, Settings
import tempfile
import pathlib

def test_spa_route_serving():
    with tempfile.TemporaryDirectory() as tmpdir:
        dist = pathlib.Path(tmpdir)
        (dist / "index.html").write_text("<html><body>Daily Reader</body></html>")
        (dist / "ru").mkdir(parents=True, exist_ok=True)
        (dist / "ru" / "index.html").write_text("<html><body>Ruso Reader</body></html>")
        (dist / "manifest-en.webmanifest").write_text('{"name": "Daily Reader"}')
        (dist / "manifest-ru.webmanifest").write_text('{"name": "Ruso"}')

        base = get_settings()
        settings = Settings(
            openrouter_api_key=base.openrouter_api_key,
            openrouter_model=base.openrouter_model,
            db_path=pathlib.Path(tmpdir) / "test.db",
            timezone=base.timezone,
            translate_max_share=base.translate_max_share,
            frontend_dist=dist,
        )
        app = create_app(settings=settings)
        client = TestClient(app)

        # Base index.html
        r_root = client.get("/")
        assert r_root.status_code == 200
        assert "Daily Reader" in r_root.text

        # /en path serving SPA index.html
        r_en = client.get("/en/")
        assert r_en.status_code == 200
        assert "Daily Reader" in r_en.text

        # /ru path serving ru/index.html
        r_ru = client.get("/ru/")
        assert r_ru.status_code == 200
        assert "Ruso Reader" in r_ru.text

        # Static manifest route
        r_manifest = client.get("/manifest-en.webmanifest")
        assert r_manifest.status_code == 200
        assert "Daily Reader" in r_manifest.text

        r_manifest_ru = client.get("/manifest-ru.webmanifest")
        assert r_manifest_ru.status_code == 200
        assert "Ruso" in r_manifest_ru.text

import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.config import get_settings, Settings
import tempfile
import pathlib

def test_spa_path_routes():
    with tempfile.TemporaryDirectory() as tmpdir:
        dist = pathlib.Path(tmpdir)
        (dist / "index.html").write_text("<html><body>Spanish SPA</body></html>")
        en_dir = dist / "en"
        en_dir.mkdir(parents=True, exist_ok=True)
        (en_dir / "index.html").write_text("<html><body>English SPA</body></html>")
        (dist / "manifest-en.webmanifest").write_text('{"short_name": "Чтение EN"}')

        base = get_settings()
        settings = Settings(
            openrouter_api_key=base.openrouter_api_key,
            openrouter_model=base.openrouter_model,
            db_path=pathlib.Path(tmpdir) / "test.db",
            timezone=base.timezone,
            wol_base_url=base.wol_base_url,
            es_wol_base_url=base.es_wol_base_url,
            en_wol_base_url=base.en_wol_base_url,
            translate_max_share=base.translate_max_share,
            frontend_dist=dist,
        )
        app = create_app(settings=settings)
        client = TestClient(app, follow_redirects=False)

        # / -> Spanish index.html
        r_root = client.get("/")
        assert r_root.status_code == 200
        assert "Spanish SPA" in r_root.text

        # /en -> 301 redirect to /en/
        r_en_no_slash = client.get("/en")
        assert r_en_no_slash.status_code == 301
        assert r_en_no_slash.headers["location"] == "/en/"

        # /en/ -> English index.html
        r_en = client.get("/en/")
        assert r_en.status_code == 200
        assert "English SPA" in r_en.text

        # /en/subpath -> English index.html
        r_en_sub = client.get("/en/today")
        assert r_en_sub.status_code == 200
        assert "English SPA" in r_en_sub.text

        # Manifest
        r_manifest = client.get("/manifest-en.webmanifest")
        assert r_manifest.status_code == 200
        assert "Чтение EN" in r_manifest.text

        # Security check: path traversal attempts fail safely
        r_traversal = client.get("/../backend/app/config.py")
        assert "openrouter_api_key" not in r_traversal.text

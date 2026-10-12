from dataclasses import replace
from fastapi.testclient import TestClient
from app.main import create_app
from app.config import get_settings

def test_spa_routes_serve_index(tmp_path):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("root")

    for route in ("ru-es", "es-ru", "ru-es-translit", "en-ru", "en", "es", "ru", "s1", "s2", "s3", "s4"):
        r_dir = dist / route
        r_dir.mkdir()
        (r_dir / "index.html").write_text(f"html for {route}")

    settings = replace(get_settings(), frontend_dist=dist)
    app = create_app(settings)
    client = TestClient(app)

    # Root route returns root index.html
    r = client.get("/")
    assert r.status_code == 200
    assert r.text == "root"

    # Canonical routes return their specific index.html
    assert client.get("/ru-es/").text == "html for ru-es"
    assert client.get("/es-ru/").text == "html for es-ru"
    assert client.get("/ru-es-translit/").text == "html for ru-es-translit"
    assert client.get("/en-ru/").text == "html for en-ru"

    # Legacy routes return their specific index.html
    assert client.get("/s1/").text == "html for s1"
    assert client.get("/s2/").text == "html for s2"
    assert client.get("/s3/").text == "html for s3"
    assert client.get("/s4/").text == "html for s4"

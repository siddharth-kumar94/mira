from fastapi.testclient import TestClient

from app.main import create_app


def test_health_needs_no_rally():
    with TestClient(create_app()) as client:
        response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_foreign_host_header_is_rejected():
    with TestClient(create_app()) as client:
        assert client.get("/api/health", headers={"Host": "evil.example"}).status_code == 400
        assert client.get("/api/health", headers={"Host": "localhost:8787"}).status_code == 200

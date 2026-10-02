"""FastAPI gateway route tests using the Starlette TestClient."""

import pytest
from fastapi.testclient import TestClient

import gateway


@pytest.fixture(scope="module")
def client():
    with TestClient(gateway.app) as test_client:
        yield test_client


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["engine_count"] >= 11
    assert body["voice_omega"] is True
    assert len(body["global_merkle_root"]) == 64


def test_telemetry_inject_high_decoherence(client):
    response = client.post("/telemetry/inject", json={"gamma_decoherence": 0.07})
    assert response.status_code == 200
    body = response.json()
    assert body["stage"] == "HIGH_DECOHERENCE"
    assert body["injection_header"] == "[TELEMETRY] STAGE=HIGH_DECOHERENCE"
    assert body["modifiers"]["high_decoherence"] is True


def test_telemetry_inject_schumann_lock(client):
    response = client.post("/telemetry/inject", json={"schumann_coherence": 0.9})
    assert response.json()["stage"] == "SCHUMANN_LOCK"


def test_audit_verify(client):
    response = client.get("/audit/verify")
    assert response.status_code == 200
    body = response.json()
    assert len(body["global_merkle_root"]) == 64
    assert body["status"] in {"CHAIN_VERIFIED", "CHAIN_BROKEN"}


def test_orchestrate_requires_api_key(client):
    response = client.post("/orchestrate/action", json={"action_id": "ORC-001", "payload": {}})
    assert response.status_code == 401
    assert "Merkle API key" in response.json()["detail"]


def test_orchestrate_with_api_key(client):
    response = client.post(
        "/orchestrate/action",
        json={"action_id": "ORC-001", "payload": {"source": "gateway-test"}},
        headers={"X-API-Key": "sovereign-merkle-key"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "SOVEREIGN_SYSTEM_COHERENT"
    assert len(body["global_merkle_root"]) == 64
    assert body["request_payload"] == {"source": "gateway-test"}


def test_orchestrate_unknown_action(client):
    response = client.post(
        "/orchestrate/action",
        json={"action_id": "ORC-999", "payload": {}},
        headers={"X-API-Key": "sovereign-merkle-key"},
    )
    assert response.status_code == 400


def test_voice_synthesize_is_graceful(client):
    response = client.post("/voice/synthesize", json={"text": "Sovereign core online."})
    # 200 when the optional OpenAI backend is installed, 503 otherwise.
    assert response.status_code in (200, 503)


def test_voice_podcast_is_graceful(client):
    response = client.post(
        "/voice/podcast",
        json={"script": [["Host", "Welcome."], ["Guest", "Thanks."]]},
    )
    assert response.status_code in (200, 503)


def test_persona_summary(client):
    response = client.get("/persona")
    assert response.status_code == 200
    assert response.json()["dimension"] == "C-137"


def test_portal_root_serves_something(client):
    response = client.get("/")
    assert response.status_code == 200

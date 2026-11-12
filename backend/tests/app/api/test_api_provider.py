from types import SimpleNamespace

import pytest

from app.api import provider
from config.settings import get_settings
from database.models import Check, User
from database.session import SessionLocal
from harness.pipeline.prompts import JudgeAnswer

CONFIG = {
    "baseUrl": "https://models.example.com/v1", "model": "shared-model",
    "judgeModels": ["judge-a", "judge-b"], "supportsJsonMode": False,
}


def enable(client, config=None, key="private-test-key"):
    response = client.patch("/api/auth/me", json={"apiProvider": config or CONFIG, "apiKey": key})
    assert response.status_code == 200, response.text
    return response.json()


def fake_endpoint(monkeypatch, fakes):
    requested = []

    def llm(settings, **credentials):
        requested.append((settings, credentials))
        fakes.llm.client = SimpleNamespace(close=lambda: None)
        return fakes.llm

    monkeypatch.setattr(provider, "OpenRouterLLM", llm)
    monkeypatch.setattr(provider, "TavilySearch", lambda settings: fakes.search)
    monkeypatch.setattr(provider, "fetch_page", lambda url, settings: fakes.fetch(url))
    monkeypatch.setattr(get_settings(), "tavily_api_key", "test-search-key")
    return requested


def test_api_key_is_private_and_configuration_is_per_account(client, other_client):
    account = enable(client)
    assert account["apiProvider"] == CONFIG
    assert account["hasApiKey"] is True
    assert "private-test-key" not in str(account)
    assert other_client.get("/api/auth/me").json()["apiProvider"] is None
    with SessionLocal() as session:
        saved = session.get(User, client.user_id).api_provider
        assert saved["base_url"] == CONFIG["baseUrl"]
        assert "private-test-key" not in str(saved)
    # Editing other preferences keeps the key; changing the endpoint requires a new one.
    assert client.patch("/api/auth/me", json={"searchInstructions": "Official sources."}).json()["hasApiKey"]
    moved = {**CONFIG, "baseUrl": "https://other.example.com/v1"}
    assert client.patch("/api/auth/me", json={"apiProvider": moved}).status_code == 422
    assert client.patch("/api/auth/me", json={"apiProvider": CONFIG}).json()["hasApiKey"]
    disabled = client.patch("/api/auth/me", json={"apiProvider": None}).json()
    assert disabled["apiProvider"] is None and not disabled["hasApiKey"]
    assert provider.saved_key(client.user_id, CONFIG["baseUrl"]) is None


@pytest.mark.parametrize("changes", [
    {"baseUrl": "http://models.example.com/v1"},
    {"baseUrl": "https://name:password@models.example.com/v1"},
    {"baseUrl": "https://models.example.com/v1?key=secret"},
    {"judgeModels": ["judge-a", " judge-a "]},
    {"judgeModels": ["judge-a", " "]},
    {"model": " "},
])
def test_provider_rejects_invalid_configuration(client, changes):
    assert client.patch("/api/auth/me", json={"apiProvider": {**CONFIG, **changes}, "apiKey": "key"}).status_code == 422


def test_provider_rejects_private_hosts(client, monkeypatch):
    monkeypatch.setattr("harness.search.fetcher._is_public", lambda host: False)
    assert client.patch("/api/auth/me", json={"apiProvider": CONFIG, "apiKey": "key"}).status_code == 422


def test_custom_models_run_all_steps_and_both_judges_without_openrouter(client, fakes, monkeypatch):
    requested = fake_endpoint(monkeypatch, fakes)
    enable(client)
    response = client.post("/api/check", json={"inputType": "text", "text": "The line opened on 6 November 2021."})
    assert response.status_code == 202, response.text
    check_id = response.json()["id"]
    detail = client.get(f"/api/check/{check_id}").json()
    assert detail["status"] == "completed"
    assert detail["apiProvider"] == CONFIG
    assert detail["judgeIds"] == ["custom-judge-1", "custom-judge-2"]
    assert {model for model, schema in fakes.llm.calls if schema is JudgeAnswer} == {"judge-a", "judge-b"}
    assert all(model in {"shared-model", "judge-a", "judge-b"} for model, _ in fakes.llm.calls)
    followup = client.post(f"/api/check/{check_id}/messages", json={"question": "What is the evidence?", "modelId": "custom-model"})
    assert followup.status_code == 201, followup.text
    assert followup.json()["modelName"] == "shared-model"
    assert all(credentials == {"base_url": CONFIG["baseUrl"], "api_key": "private-test-key"} for _, credentials in requested)
    assert "private-test-key" not in client.get(f"/api/check/{check_id}").text


def test_review_resumes_with_original_models_and_missing_key_never_falls_back(client, fakes, monkeypatch):
    requested = fake_endpoint(monkeypatch, fakes)
    fakes.llm.claims = ["The line opened on 6 November 2021.", "The line serves passengers."]
    enable(client)
    response = client.post("/api/check", json={
        "inputType": "text", "files": [{"name": "note.txt", "size": 20, "text": "The line opened on 6 November 2021."}],
    })
    assert response.status_code == 202, response.text
    check_id = response.json()["id"]
    assert client.get(f"/api/check/{check_id}").json()["status"] == "awaiting_input"
    # Simulate a restart losing only credentials, then restore the key while changing the current preferences.
    provider.forget_key(client.user_id)
    review = {"selectedClaims": [1], "answers": []}
    missing = client.post(f"/api/check/{check_id}/review", json=review)
    assert missing.status_code == 503
    assert missing.json()["detail"] == provider.KEY_REQUIRED
    assert client.get("/api/auth/me").json()["hasApiKey"] is False
    enable(client, {**CONFIG, "model": "new-shared-model", "judgeModels": ["new-a", "new-b"]})
    assert client.post(f"/api/check/{check_id}/review", json=review).status_code == 202
    assert client.get(f"/api/check/{check_id}").json()["status"] == "completed"
    assert requested[-1][0].extraction_model == "shared-model"
    assert {model for model, schema in fakes.llm.calls if schema is JudgeAnswer} == {"judge-a", "judge-b"}
    with SessionLocal() as session:
        assert "private-test-key" not in str(session.get(Check, check_id).api_provider)


def test_remembered_key_expires(client, monkeypatch):
    enable(client)
    now = provider.monotonic()
    monkeypatch.setattr(provider, "monotonic", lambda: now + provider.KEY_TTL + 1)
    assert client.get("/api/auth/me").json()["hasApiKey"] is False

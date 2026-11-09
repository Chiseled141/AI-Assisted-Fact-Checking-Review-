"""Accounts, sign-in sessions, and keeping each user's checks to themselves."""

from base64 import b64decode, b64encode
from datetime import UTC, datetime, timedelta
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select

from app.db.models import Check, User, UserSession
from app.db.session import SessionLocal
from app.main import app
from tests.conftest import PASSWORD
from tests.helpers import run


def register(client, username, password=PASSWORD, confirmation=None):
    return client.post(
        "/api/auth/register",
        json={"username": username, "password": password, "passwordConfirmation": confirmation or password},
    )


def login(client, username, password=PASSWORD):
    return client.post("/api/auth/login", json={"username": username, "password": password})


@pytest.fixture
def anonymous(client):
    return TestClient(app)


def test_signing_up_signs_in_with_an_httponly_cookie_and_an_argon2_hash(client, anonymous):
    response = register(anonymous, "Lan.Nguyen")
    assert response.status_code == 201
    assert response.json()["username"] == "lan.nguyen"
    cookie = response.headers["set-cookie"].lower()
    assert "claimtrace_session=" in cookie and "httponly" in cookie and "samesite=lax" in cookie and "path=/" in cookie
    assert anonymous.get("/api/auth/me").json()["username"] == "lan.nguyen"
    with SessionLocal() as session:
        user = session.scalar(select(User).where(User.username == "lan.nguyen"))
        assert user.password_hash.startswith("$argon2id$")
        assert PASSWORD not in user.password_hash
        token = anonymous.cookies.get("claimtrace_session")
        saved = session.scalar(select(UserSession).where(UserSession.user_id == user.id))
        assert saved.token_hash != token and len(saved.token_hash) == 64


@pytest.mark.parametrize(
    ("username", "password", "confirmation", "status"),
    [
        ("ab", PASSWORD, None, 422),  # Too short.
        ("has space", PASSWORD, None, 422),
        ("lan@mail.com", PASSWORD, None, 422),  # No email addresses as usernames.
        ("lan", "short", None, 422),
        ("lan", PASSWORD, "something else entirely", 422),
        ("tester", PASSWORD, None, 409),  # Taken by the shared client.
        ("TESTER", PASSWORD, None, 409),  # Usernames ignore case.
    ],
)
def test_sign_up_rules(client, anonymous, username, password, confirmation, status):
    response = register(anonymous, username, password, confirmation)
    assert response.status_code == status, response.text
    assert "claimtrace_session" not in anonymous.cookies


def test_logging_in_and_out(client, anonymous):
    assert login(anonymous, "tester", "wrong password!").status_code == 401
    assert login(anonymous, "nobody", PASSWORD).status_code == 401
    assert login(anonymous, "nobody", PASSWORD).json()["detail"] == login(anonymous, "tester", "nope").json()["detail"]
    assert anonymous.get("/api/auth/me").status_code == 401

    assert login(anonymous, " Tester ", PASSWORD).status_code == 200
    token = anonymous.cookies.get("claimtrace_session")
    assert anonymous.get("/api/auth/me").json()["id"] == client.user_id

    logout = anonymous.post("/api/auth/logout")
    assert logout.status_code == 204
    assert 'claimtrace_session=""' in logout.headers["set-cookie"] or "max-age=0" in logout.headers["set-cookie"].lower()
    # The old token stops working on the server too, not just in this browser.
    stolen = TestClient(app, cookies={"claimtrace_session": token})
    assert stolen.get("/api/auth/me").status_code == 401
    # The shared client's own session is untouched.
    assert client.get("/api/auth/me").status_code == 200


def test_profile_updates_keep_account_identity_and_store_a_raster_avatar(client, anonymous, other_client):
    assert anonymous.patch("/api/auth/me", json={"username": "visitor"}).status_code == 401
    image = BytesIO()
    Image.new("RGB", (320, 240), "navy").save(image, "PNG")
    changed = client.patch("/api/auth/me", json={
        "username": "  New.Name  ", "preferredSourceLanguage": "vi",
        "avatar": b64encode(image.getvalue()).decode(),
    })
    assert changed.status_code == 200, changed.text
    profile = changed.json()
    assert profile["id"] == client.user_id and profile["username"] == "new.name"
    assert profile["preferredSourceLanguage"] == "vi"
    assert profile["avatar"].startswith("data:image/webp;base64,")
    with Image.open(BytesIO(b64decode(profile["avatar"].split(",")[1]))) as avatar:
        assert avatar.format == "WEBP" and avatar.size == (192, 192)
    assert client.get("/api/auth/me").json() == profile
    assert other_client.get("/api/auth/me").json()["avatar"] is None
    assert login(anonymous, "new.name").status_code == 200
    assert client.patch("/api/auth/me", json={"avatar": None}).json()["avatar"] is None


def test_profile_rejects_duplicate_names_and_non_images(client, other_client):
    duplicate = client.patch("/api/auth/me", json={"username": "Someone-Else", "preferredSourceLanguage": "vi"})
    assert duplicate.status_code == 409
    assert client.get("/api/auth/me").json()["preferredSourceLanguage"] is None
    payload = b64encode(b'<svg xmlns="http://www.w3.org/2000/svg"></svg>').decode()
    assert client.patch("/api/auth/me", json={"avatar": payload}).status_code == 422
    assert client.get("/api/auth/me").json()["avatar"] is None


def test_password_change_verifies_current_password_and_rotates_all_sessions(client, anonymous):
    assert login(anonymous, "tester").status_code == 200
    previous = client.cookies.get("claimtrace_session")
    updated_password = "a different password"
    body = {"newPassword": updated_password, "passwordConfirmation": updated_password}
    assert client.post("/api/auth/me/password", json={**body, "currentPassword": "incorrect"}).status_code == 422
    assert anonymous.get("/api/auth/me").status_code == 200
    response = client.post("/api/auth/me/password", json={**body, "currentPassword": PASSWORD})
    assert response.status_code == 200 and response.json()["id"] == client.user_id
    assert client.cookies.get("claimtrace_session") != previous
    assert client.get("/api/auth/me").status_code == 200
    assert anonymous.get("/api/auth/me").status_code == 401
    assert login(anonymous, "tester").status_code == 401
    assert login(anonymous, "tester", updated_password).status_code == 200


@pytest.mark.parametrize("language,first", [("vi", "https://vnexpress.net/b"), ("en", "https://bbc.com/a")])
def test_source_language_affects_the_order_of_sources_in_new_checks(client, fakes, language, first):
    assert client.patch("/api/auth/me", json={"preferredSourceLanguage": language}).status_code == 200
    urls = ["https://bbc.com/a", "https://vnexpress.net/b"]
    fakes.search.results = sorted(urls, key=lambda url: url == first)
    check = run(client)
    evidence = client.get(f"/api/claims/{check['claims'][0]['id']}/evidence").json()
    assert [item["url"] for item in evidence] == [first, fakes.search.results[0]]


def test_search_model_preference_is_validated_and_used_only_for_tavily_research(client, fakes):
    from app.core.config import get_settings
    from app.pipeline.prompts import ResearchPicks
    from app.search.tavily import SearchHit

    settings = get_settings()
    research_models = []
    url = "https://reuters.com/a"

    def research(model, system, user, schema, run_search, max_searches):
        research_models.append(model)
        run_search("the opening date")
        return ResearchPicks(urls=[url]), model

    fakes.search.search_hits = lambda query, **options: [SearchHit(url)]
    fakes.llm.research = research
    endpoint = "/api/auth/me"
    assert client.patch(endpoint, json={"preferredSearchModelId": "deepseek-flash"}).status_code == 200
    assert client.patch(endpoint, json={"preferredSearchModelId": "arbitrary-model"}).status_code == 422
    assert client.get(endpoint).json()["preferredSearchModelId"] == "deepseek-flash"

    check = run(client)
    model = settings.judges["deepseek-flash"].model
    task = next(item for item in check["progress"] if item["task"] == "researching")
    assert task["requestedModel"] == model
    assert all(requested != model for requested, _ in fakes.llm.calls)
    assert client.patch(endpoint, json={"preferredSearchModelId": None}).json()["preferredSearchModelId"] is None
    run(client)
    assert research_models == [model, settings.research_model]
    with SessionLocal() as session:
        assert session.get(Check, check["id"]).search_model == model


def test_an_expired_session_is_signed_out(client):
    with SessionLocal() as session:
        for saved in session.scalars(select(UserSession).where(UserSession.user_id == client.user_id)):
            saved.expires_at = datetime.now(UTC) - timedelta(minutes=1)
        session.commit()
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/checks").status_code == 401


def test_repeated_failed_logins_are_slowed_down(client, anonymous):
    from app.core.config import get_settings

    for _ in range(get_settings().max_login_attempts_per_hour):
        assert login(anonymous, "tester", "wrong password!").status_code == 401
    assert login(anonymous, "tester", PASSWORD).status_code == 429


def test_signed_out_visitors_can_read_nothing(client, anonymous):
    check = run(client)
    claim_id = check["claims"][0]["id"]
    path = f"/api/check/{check['id']}"
    for method, url, body in [
        ("post", "/api/check", {"inputType": "text", "text": "The line opened in 2021."}),
        ("get", path, None),
        ("get", "/api/checks", None),
        ("post", f"{path}/messages", {"question": "Why?"}),
        ("delete", f"{path}/messages", None),
        ("post", f"{path}/feedback", {"helpful": True}),
        ("get", f"/api/claims/{claim_id}/evidence", None),
        ("get", f"/api/claims/{claim_id}/revisions", None),
        ("post", f"/api/claims/{claim_id}/corrections", {"verdict": "contradicted", "reason": "A long enough reason.", "evidenceIds": [], "expectedVersion": 1}),
        ("get", "/api/stats", None),
    ]:
        response = anonymous.request(method, url, json=body)
        assert response.status_code == 401, (method, url, response.text)
    # The home page looks for earlier checks while typing; signed out, it simply finds none.
    found = anonymous.post("/api/checks/similar", json={"text": "The line opened on 6 November 2021."}).json()
    assert found == {"claims": [], "link": None}
    assert anonymous.get("/api/health").status_code == 200


def test_another_user_cannot_see_or_change_a_check(client, other_client, fakes):
    check = run(client)
    claim_id = check["claims"][0]["id"]
    path = f"/api/check/{check['id']}"
    assert client.post(f"{path}/messages", json={"question": "Which source said so?"}).status_code == 201
    calls = len(fakes.llm.calls)

    # Someone else's check looks exactly like one that doesn't exist.
    for method, url, body in [
        ("get", path, None),
        ("post", f"{path}/messages", {"question": "Why?"}),
        ("delete", f"{path}/messages", None),
        ("post", f"{path}/feedback", {"helpful": False}),
        ("get", f"/api/claims/{claim_id}/evidence", None),
        ("get", f"/api/claims/{claim_id}/revisions", None),
        ("post", f"/api/claims/{claim_id}/corrections", {"verdict": "contradicted", "reason": "A long enough reason.", "evidenceIds": [], "expectedVersion": 1}),
    ]:
        response = other_client.request(method, url, json=body)
        assert response.status_code == 404, (method, url, response.text)
        assert response.json() == {"detail": "Not found."}
    assert len(fakes.llm.calls) == calls  # No paid call was made for them.

    assert other_client.get("/api/checks").json()["total"] == 0
    assert other_client.get("/api/checks", params={"query": "line"}).json()["items"] == []
    assert other_client.get("/api/stats").json()["checks"] == 0
    assert other_client.post("/api/checks/similar", json={"text": "The line opened on 6 November 2021."}).json()["claims"] == []

    # The owner still has it all: the follow-up, the verdict, and the history entry.
    saved = client.get(path).json()
    assert len(saved["messages"]) == 1
    assert len(client.get(f"/api/claims/{claim_id}/revisions").json()) == 1
    assert client.get("/api/checks").json()["total"] == 1
    assert client.get("/api/stats").json()["checks"] == 1


def test_each_user_sees_only_their_own_history_and_earlier_checks(client, other_client):
    mine = run(client)
    theirs = run(other_client)
    assert [item["id"] for item in client.get("/api/checks").json()["items"]] == [mine["id"]]
    assert [item["id"] for item in other_client.get("/api/checks").json()["items"]] == [theirs["id"]]
    [found] = other_client.post("/api/checks/similar", json={"text": "The line opened on 6 November 2021."}).json()["claims"]
    assert found["checkId"] == theirs["id"]


def test_a_correction_is_signed_with_the_username(client):
    claim = run(client)["claims"][0]
    response = client.post(
        f"/api/claims/{claim['id']}/corrections",
        json={"verdict": "contradicted", "reason": "The opening was a day later.", "evidenceIds": [], "expectedVersion": 1},
    )
    assert response.status_code == 201, response.text
    assert response.json()["revision"]["author"] == "tester"


def test_checks_from_before_accounts_stay_hidden_until_claimed(client, other_client):
    from app.db.session import engine
    from app.db.transfer import TransferError, claim_unowned

    with SessionLocal() as session:
        old = Check(title="Old", input_type="text", input_text="Text", judge_ids=[], status="completed")
        other = Check(title="Theirs", input_type="text", input_text="Text", judge_ids=[], status="completed", user_id=other_client.user_id)
        session.add_all([old, other])
        session.commit()
        old_id, other_id = old.id, other.id
    assert client.get(f"/api/check/{old_id}").status_code == 404
    assert other_client.get(f"/api/check/{old_id}").status_code == 404

    with pytest.raises(TransferError):
        claim_unowned(engine, "nobody")
    assert claim_unowned(engine, "Tester") == 1
    assert claim_unowned(engine, "tester") == 0  # Already claimed.
    assert client.get(f"/api/check/{old_id}").status_code == 200
    # Claiming never takes a check from another user.
    assert claim_unowned(engine, "tester", [other_id]) == 0
    assert other_client.get(f"/api/check/{other_id}").status_code == 200
    assert client.get(f"/api/check/{other_id}").status_code == 404

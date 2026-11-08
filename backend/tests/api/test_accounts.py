"""Accounts, sign-in sessions, and keeping each user's checks to themselves."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
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

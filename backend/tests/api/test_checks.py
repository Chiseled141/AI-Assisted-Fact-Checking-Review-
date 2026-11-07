"""Whole checks through the API, with fake providers in place of the outside services."""

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.pipeline.run import _distinct_titles
from app.search.fetcher import Page
from tests.helpers import TEXT, run


@pytest.mark.parametrize("category", ["subjective", "advice", "prediction", "unclear", "no_factual_claim"])
def test_nonfactual_inputs_return_a_saved_category_without_searching_or_judging(client, fakes, category):
    from app.pipeline.prompts import ExtractedClaims

    calls = []

    def complete(model, system, user, schema, check=None):
        calls.append(schema)
        assert schema is ExtractedClaims
        return ExtractedClaims(claims=[], input_category=category), model

    fakes.llm.complete = complete
    check = run(client, {"inputType": "text", "text": "Ronaldo có phải là GOAT?"})
    assert check["status"] == "completed"
    assert check["claims"] == []
    assert check["inputCategory"] == category
    assert calls == [ExtractedClaims]
    assert fakes.fetch.fetched == []
    saved = client.get(f"/api/check/{check['id']}").json()
    assert saved["inputCategory"] == category
    assert saved["progress"][0]["inputCategory"] == category
    history = client.get("/api/checks").json()["items"]
    assert next(item for item in history if item["id"] == check["id"])["inputCategory"] == category


def test_an_input_category_cannot_hide_real_extracted_claims(client, fakes):
    from app.pipeline.prompts import ExtractedClaim, ExtractedClaims

    complete = fakes.llm.complete

    def answer(model, system, user, schema, check=None):
        if schema is ExtractedClaims:
            return ExtractedClaims(
                claims=[ExtractedClaim(text="The line opened on 6 November 2021.", checkworthiness=0.9)],
                input_category="subjective",
            ), model
        return complete(model, system, user, schema, check)

    fakes.llm.complete = answer
    check = run(client)
    assert check["claims"][0]["current"]["verdict"] == "supported"
    assert check["inputCategory"] is None


def test_text_check_returns_claims_both_judges_and_saved_evidence(client, fakes):
    check = run(client)
    assert check["status"] == "completed"
    assert check["claimCount"] == 1
    assert check["createdAt"].endswith("+00:00")

    claim = check["claims"][0]
    assert claim["status"] == "assessed"
    assert claim["currentVersion"] == 1
    current = claim["current"]
    assert current["verdict"] == "supported"
    assert current["kind"] == "ai_assessment"
    assert current["model"] == {"name": "openai/gpt-6-luna", "promptVersion": get_settings().prompt_version}
    assert [judge["judge"] for judge in current["judges"]] == ["GPT Luna", "Claude Haiku 5.5"]
    assert [judge["primary"] for judge in current["judges"]] == [True, False]

    evidence = client.get(f"/api/claims/{claim['id']}/evidence").json()
    assert [item["url"] for item in evidence] == ["https://reuters.com/a", "https://bbc.com/b"]
    first = evidence[0]
    assert first["excerpt"] == "opened to passengers"
    assert first["relation"] == "supporting"
    assert first["publishedAt"] == "2021-11-06"
    assert current["citedEvidenceIds"] == [first["id"]]
    assert current["citationFreshness"][first["id"]]["status"] == "current"
    assert evidence[1]["relation"] == "contextual"

    assert "analysis" not in first
    assert len(fakes.llm.calls) == 3  # Extraction and the two claim judges only.


def test_a_quote_split_over_lines_in_the_page_is_still_shown(client, fakes):
    fakes.fetch.text = "The line opened\n   to passengers on 6 November 2021 after a handover that morning. " * 8
    created = run(client)
    evidence = client.get(f"/api/claims/{created['claims'][0]['id']}/evidence").json()
    assert evidence[0]["excerpt"] == "opened to passengers"


def test_sources_with_one_title_are_told_apart_by_their_own_words():
    report = "Daily report\nIssued by {office}\nThe temperature was measured at the airport."
    pages = {
        url: Page(url=url, title="National Weather Service", text=report.format(office=office))
        for url, office in (("https://weather.gov/a", "Office A"), ("https://weather.gov/b", "Office B"))
    }
    pages["https://bbc.com/c"] = Page(url="https://bbc.com/c", title="Another title", text="Daily report")
    assert _distinct_titles(pages) == {
        "https://weather.gov/a": "National Weather Service: Issued by Office A",
        "https://weather.gov/b": "National Weather Service: Issued by Office B",
        "https://bbc.com/c": "Another title",
    }


def test_models_are_told_the_dates_they_need(client, fakes):
    from app.db.models import utcnow
    from app.pipeline.prompts import ExtractedClaims, JudgeAnswer

    run(client, {"inputType": "url", "url": "https://reuters.com/a"})
    today = f"Today's date: {utcnow().date().isoformat()}"
    by_schema = {schema: user for schema, _, user in fakes.llm.prompts}
    for schema in (ExtractedClaims, JudgeAnswer):
        assert today in by_schema[schema]
    assert "Article date: 2021-11-06" in by_schema[ExtractedClaims]


def test_a_text_check_has_no_article_date(client, fakes):
    from app.pipeline.prompts import ExtractedClaims

    run(client)
    extract = next(user for schema, _, user in fakes.llm.prompts if schema is ExtractedClaims)
    assert "Article date" not in extract


def test_sources_are_fetched_once_without_extra_source_reviews(client, fakes):

    fakes.llm.claims = ["The line opened in 2021.", "The line has 12 stations."]
    fakes.search.results = ["https://reuters.com/a"]
    check = run(client)
    assert check["claimCount"] == 2
    assert fakes.fetch.fetched == ["https://reuters.com/a"]
    assert len(fakes.llm.calls) == 5  # Extraction and two judges for each claim.


def test_disagreement_keeps_both_verdicts_and_shows_the_first(client, fakes):
    fakes.llm.verdicts = {"anthropic/claude-haiku-5.5": "insufficient_evidence"}
    judges = run(client)["claims"][0]["current"]["judges"]
    assert [judge["verdict"] for judge in judges] == ["supported", "insufficient_evidence"]
    assert run(client)["claims"][0]["current"]["verdict"] == "supported"


def test_one_failed_judge_still_gives_a_verdict(client, fakes):
    fakes.llm.failing = {"openai/gpt-6-luna"}
    claim = run(client)["claims"][0]
    assert claim["status"] == "assessed"
    assert [judge["judge"] for judge in claim["current"]["judges"]] == ["Claude Haiku 5.5"]
    assert claim["current"]["judges"][0]["primary"] is True
    assert "analysis" not in client.get(f"/api/claims/{claim['id']}/evidence").json()[0]


def test_both_judges_failing_is_unavailable_not_a_verdict(client, fakes):
    # Not the extraction model, so that the claims still come through.
    fakes.llm.failing = {"openai/gpt-6-luna", "deepseek/deepseek-v4.1-flash"}
    check = run(client, {**TEXT, "judgeIds": ["gpt-luna", "deepseek-flash"]})
    claim = check["claims"][0]
    assert check["status"] == "completed"
    assert claim["status"] == "unavailable"
    assert claim["current"] is None
    assert "no verdict" in claim["unavailableReason"]


def test_search_failure_is_unavailable_not_insufficient_evidence(client, fakes):
    fakes.search.fails = True
    claim = run(client)["claims"][0]
    assert claim["status"] == "unavailable"
    assert claim["current"] is None


def test_all_source_reads_failing_is_unavailable_without_asking_a_judge(client, fakes):
    from app.pipeline.prompts import JudgeAnswer

    fakes.fetch.unreadable = {"https://reuters.com/a", "https://bbc.com/b"}
    claim = run(client)["claims"][0]
    assert claim["status"] == "unavailable"
    assert claim["current"] is None
    assert not any(schema is JudgeAnswer for _, schema in fakes.llm.calls)


def test_sources_are_capped_per_check(client, fakes):
    fakes.llm.claims = [f"Claim number {index} about the line." for index in range(5)]
    fakes.search.results = [f"https://reuters.com/{index}" for index in range(5)]
    assert run(client)["status"] == "completed"
    assert len(set(fakes.fetch.fetched)) <= 10

    class ByClaim(type(fakes.search)):
        def search(self, query):
            return [f"https://reuters.com/{query}/{index}" for index in range(5)]

    fakes.fetch.fetched.clear()
    fakes.search.__class__ = ByClaim
    assert run(client)["status"] == "completed"
    # One readable publisher per claim; further URLs from the same publisher are not fetched to fill slots.
    assert len(fakes.fetch.fetched) == 5


def test_url_check_shows_its_article_and_never_uses_it_as_evidence(client, fakes):
    url = "https://reuters.com/a"
    check = run(client, {"inputType": "url", "url": url})
    assert check["article"] == {"title": f"Title of {url}", "publisher": "Example News", "publishedAt": "2021-11-06"}
    assert check["title"] == f"Title of {url}"
    evidence = client.get(f"/api/claims/{check['claims'][0]['id']}/evidence").json()
    assert [item["url"] for item in evidence] == ["https://bbc.com/b"]


def test_unreadable_url_fails_the_check_with_a_clear_reason(client, fakes):
    url = "https://reuters.com/missing"
    fakes.fetch.unreadable = {url}
    check = run(client, {"inputType": "url", "url": url})
    assert check["status"] == "failed"
    assert check["errorMessage"] == "No article text could be read from this page."


def test_extraction_failure_fails_the_check_without_leaking_details(client, fakes):
    fakes.llm.failing = {"anthropic/claude-haiku-5.5"}
    check = run(client)
    assert check["status"] == "failed"
    assert check["errorMessage"] == "The claims could not be extracted."


def test_file_check_reads_the_files(client):
    check = run(client, {"inputType": "text", "files": [{"name": "a.txt", "size": 5, "text": "The line opened in 2021."}]})
    assert check["title"] == "a.txt"
    assert check["files"][0]["name"] == "a.txt"
    assert check["status"] == "completed"


def test_too_many_checks_from_one_address_are_refused(client):
    import pytest
    from fastapi import HTTPException

    from app.api.checks import enforce_rate_limit
    from app.core.config import get_settings

    settings = get_settings().model_copy(update={"max_checks_per_hour": 2})
    enforce_rate_limit("a", settings, now=0)
    enforce_rate_limit("a", settings, now=1)
    with pytest.raises(HTTPException) as refused:
        enforce_rate_limit("a", settings, now=2)
    assert refused.value.status_code == 429
    enforce_rate_limit("b", settings, now=2)  # Someone else isn't affected.
    enforce_rate_limit("a", settings, now=3601)  # The window moves on.
    for _ in range(30):
        client.post("/api/check", json=TEXT)
    assert client.post("/api/check", json=TEXT).status_code == 429


def test_input_is_validated(client):
    bad = [
        {"inputType": "text", "text": "   "},
        {"inputType": "text", "text": "x" * 5001},
        {"inputType": "url", "url": "ftp://example.org/a"},
        {"inputType": "text", "text": "Fine.", "judgeIds": ["gpt-luna"]},
        {"inputType": "text", "text": "Fine.", "judgeIds": ["gpt-luna", "gpt-luna"]},
        {"inputType": "text", "text": "Fine.", "judgeIds": ["gpt-luna", "nobody"]},
    ]
    for body in bad:
        assert client.post("/api/check", json=body).status_code == 422, body


def test_missing_keys_refuse_new_checks_but_keep_serving_saved_ones(client):
    saved = run(client)
    client.app.state.start_check = None
    assert client.post("/api/check", json=TEXT).status_code == 503
    assert client.get(f"/api/check/{saved['id']}").status_code == 200
    assert client.get("/api/health").json()["canRunChecks"] is False


def test_unknown_ids_are_404(client):
    assert client.get("/api/check/nope").status_code == 404
    assert client.get("/api/claims/nope/evidence").status_code == 404


def test_history_searches_filters_and_pages(client, fakes):
    for index in range(12):
        run(client, {"inputType": "text", "text": f"Metro claim number {index} here."})
    fakes.llm.failing = {"anthropic/claude-haiku-5.5"}
    run(client, {"inputType": "text", "text": "A budget claim that fails."})

    first = client.get("/api/checks", params={"pageSize": 5}).json()
    assert (first["total"], first["totalPages"], len(first["items"])) == (13, 3, 5)
    assert first["items"][0]["title"] == "A budget claim that fails."
    assert client.get("/api/checks", params={"query": "budget"}).json()["total"] == 1
    assert client.get("/api/checks", params={"status": "failed"}).json()["total"] == 1
    assert client.get("/api/checks", params={"status": "completed"}).json()["total"] == 12
    assert client.get("/api/checks", params={"status": "processing"}).json()["total"] == 0


def test_stats_and_feedback(client):
    check = run(client)
    assert client.post(f"/api/check/{check['id']}/feedback", json={"helpful": True, "comment": "Clear."}).status_code == 201
    assert client.post("/api/check/nope/feedback", json={"helpful": True}).status_code == 404
    stats = client.get("/api/stats").json()
    assert stats["checks"] == 1
    assert stats["labelDistribution"] == {"supported": 1}
    assert stats["averageSeconds"] >= 0


def test_source_specific_search_image_fills_only_missing_article_preview(client, fakes):
    from dataclasses import replace

    from app.search.tavily import SearchHit

    def hits(query, **_):
        return [SearchHit('https://reuters.com/a', 'https://images.example/search.jpg'),
                SearchHit('https://bbc.com/b', 'https://images.example/other-search.jpg')]

    fakes.search.search_hits = hits
    original_fetch = fakes.fetch
    # Keep the real article preview when there is one; use source-specific search metadata only for the other page.
    def fetch(url):
        page = original_fetch(url)
        return replace(page, image_url='https://images.example/article.jpg') if 'bbc.com' in url else page

    from app.core.config import get_settings
    from app.db.session import SessionLocal
    from app.pipeline.run import Providers, run_check
    providers = Providers(llm=fakes.llm, search=fakes.search, fetch=fetch)
    client.app.state.start_check = lambda check_id: run_check(check_id, SessionLocal, providers, get_settings())
    result = run(client)
    evidence = client.get(f"/api/claims/{result['claims'][0]['id']}/evidence").json()
    assert [item['imageUrl'] for item in evidence] == ['https://images.example/search.jpg', 'https://images.example/article.jpg']


def test_search_image_does_not_turn_an_unreadable_page_into_evidence(client, fakes):
    from app.search.tavily import SearchHit

    fakes.search.search_hits = lambda query, **_: [SearchHit('https://reuters.com/a', 'https://images.example/search.jpg')]
    fakes.fetch.unreadable = {'https://reuters.com/a'}
    result = run(client)
    claim = result['claims'][0]
    assert claim['status'] == 'unavailable'
    assert claim['current'] is None
    assert client.get(f"/api/claims/{claim['id']}/evidence").json() == []


def test_a_restart_closes_running_tasks_so_none_looks_alive():
    from app.db.models import Check
    from app.db.session import SessionLocal
    from app.main import RESTARTED, app

    with SessionLocal() as session:
        check = Check(title="Check", input_type="text", input_text="Text", judge_ids=[], status="assessing", progress=[
            {"id": "done", "kind": "ai", "task": "extracting", "status": "completed", "startedAt": "2026-11-05T01:00:00"},
            {"id": "running", "kind": "ai", "task": "judging", "status": "running", "startedAt": "2026-11-05T01:00:00"},
        ])
        session.add(check)
        session.commit()
        check_id = check.id
    with TestClient(app):
        pass
    with SessionLocal() as session:
        check = session.get(Check, check_id)
        assert check.status == "failed"
        assert check.error_message == RESTARTED
        assert [event["status"] for event in check.progress] == ["completed", "failed"]
        assert check.progress[1]["summary"] == RESTARTED


def test_a_quote_cleaned_on_reading_loses_its_translation(client, fakes):
    from app.db.models import Evidence
    from app.db.session import SessionLocal

    claim_id = run(client)["claims"][0]["id"]
    with SessionLocal() as session:
        item = session.query(Evidence).filter_by(claim_id=claim_id).first()
        item.translations = {"vi": "Bản dịch."}
        session.commit()
    first = client.get(f"/api/claims/{claim_id}/evidence").json()[0]
    assert first["translations"] == {"vi": "Bản dịch."}
    with SessionLocal() as session:
        session.query(Evidence).filter_by(claim_id=claim_id).first().excerpt = "![chart](https://x/y.png)"
        session.commit()
    assert client.get(f"/api/claims/{claim_id}/evidence").json()[0]["translations"] is None


def test_a_check_saved_with_task_names_from_an_older_version_still_opens(client):
    from app.db.models import Check
    from app.db.session import SessionLocal

    with SessionLocal() as session:
        check = Check(title="Old", input_type="text", input_text="Text", judge_ids=[], status="completed", progress=[
            {"id": "a", "kind": "search", "task": "chart_sources", "chart": "seats", "status": "completed", "startedAt": "2026-11-05T01:00:00"},
            {"id": "b", "kind": "ai", "task": "a_task_since_renamed", "status": "completed", "startedAt": "2026-11-05T01:00:00"},
        ])
        session.add(check)
        session.commit()
        check_id = check.id
    response = client.get(f"/api/check/{check_id}")
    assert response.status_code == 200
    assert response.json()["progress"][0]["chart"] == "seats"

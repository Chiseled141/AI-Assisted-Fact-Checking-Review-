"""Whole checks through the API, with fake providers in place of the outside services.
"""

from tests.helpers import TEXT, run


def test_text_check_returns_claims_both_judges_and_saved_evidence(client):
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
    assert current["model"] == {"name": "openai/gpt-6-luna", "promptVersion": "v1"}
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

    analysis = first["analysis"]
    assert analysis["keyPoints"] == ["It opened in November."]
    assert [note["judge"] for note in analysis["judgeNotes"]] == ["GPT Luna", "Claude Haiku 5.5"]
    assert analysis["judgeNotes"][0]["ratings"] == [90, 80, 70, 60]


def test_models_are_told_the_dates_they_need(client, fakes):
    from app.db.models import utcnow
    from app.pipeline.prompts import ExtractedClaims, JudgeAnswer, SourceAnswer

    run(client, {"inputType": "url", "url": "https://reuters.com/a"})
    today = f"Today's date: {utcnow().date().isoformat()}"
    by_schema = {schema: user for schema, _, user in fakes.llm.prompts}
    for schema in (ExtractedClaims, JudgeAnswer, SourceAnswer):
        assert today in by_schema[schema]
    assert "Article date: 2021-11-06" in by_schema[ExtractedClaims]


def test_a_text_check_has_no_article_date(client, fakes):
    from app.pipeline.prompts import ExtractedClaims

    run(client)
    extract = next(user for schema, _, user in fakes.llm.prompts if schema is ExtractedClaims)
    assert "Article date" not in extract


def test_a_source_is_judged_once_even_when_two_claims_use_it(client, fakes):
    from app.pipeline.prompts import SourceAnswer

    fakes.llm.claims = ["The line opened in 2021.", "The line has 12 stations."]
    fakes.search.results = ["https://reuters.com/a"]
    check = run(client)
    assert check["claimCount"] == 2
    assert fakes.fetch.fetched == ["https://reuters.com/a"]
    assert sum(schema is SourceAnswer for _, schema in fakes.llm.calls) == 2  # One per judge.


def test_disagreement_keeps_both_verdicts_and_shows_the_first(client, fakes):
    fakes.llm.verdicts = {"anthropic/claude-haiku-5.5": "insufficient_evidence"}
    judges = run(client)["claims"][0]["current"]["judges"]
    assert [judge["verdict"] for judge in judges] == ["supported", "insufficient_evidence"]
    assert run(client)["claims"][0]["current"]["verdict"] == "supported"


def test_one_failed_judge_still_gives_a_verdict_but_no_side_by_side_analysis(client, fakes):
    fakes.llm.failing = {"openai/gpt-6-luna"}
    claim = run(client)["claims"][0]
    assert claim["status"] == "assessed"
    assert [judge["judge"] for judge in claim["current"]["judges"]] == ["Claude Haiku 5.5"]
    assert claim["current"]["judges"][0]["primary"] is True
    assert client.get(f"/api/claims/{claim['id']}/evidence").json()[0]["analysis"] is None


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


def test_no_readable_source_says_not_enough_evidence_without_asking_a_judge(client, fakes):
    from app.pipeline.prompts import JudgeAnswer

    fakes.fetch.unreadable = {"https://reuters.com/a", "https://bbc.com/b"}
    claim = run(client)["claims"][0]
    assert claim["current"]["verdict"] == "insufficient_evidence"
    assert claim["current"]["citedEvidenceIds"] == []
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
    assert len(fakes.fetch.fetched) == 10


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


def test_fact_check_match_is_shown_on_the_claim(client, fakes):
    fakes.fact_checks.match = {"publisher": "Africa Check", "rating": "False", "url": "https://africacheck.org/x"}
    assert run(client)["claims"][0]["factCheck"]["publisher"] == "Africa Check"


def test_plain_fact_check_gives_an_instant_verdict_without_search_or_judges(client, fakes):
    from app.pipeline.prompts import JudgeAnswer

    fakes.fact_checks.match = {
        "publisher": "Africa Check",
        "rating": "False",
        "url": "https://africacheck.org/x",
        "claim_reviewed": "The line opened on 6 November 2021.",
    }
    fakes.search.fails = True  # Proves search was never needed.
    claim = run(client)["claims"][0]
    assert claim["status"] == "assessed"
    assert claim["current"]["verdict"] == "contradicted"
    assert claim["current"]["author"] == "Africa Check"
    assert claim["current"]["judges"] is None
    assert set(claim["factCheck"]) == {"publisher", "rating", "url"}
    assert not any(schema is JudgeAnswer for _, schema in fakes.llm.calls)


def test_unclear_fact_check_is_shown_but_the_judges_still_decide(client, fakes):
    fakes.fact_checks.match = {
        "publisher": "Africa Check",
        "rating": "Misleading",
        "url": "https://africacheck.org/x",
        "claim_reviewed": "The line opened on 6 November 2021.",
    }
    claim = run(client)["claims"][0]
    assert claim["factCheck"]["rating"] == "Misleading"
    assert len(claim["current"]["judges"]) == 2


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

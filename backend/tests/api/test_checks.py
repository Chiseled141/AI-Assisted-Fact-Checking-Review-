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


def test_related_check_suggestions_are_generated_once_and_saved(client, fakes):
    from app.pipeline.prompts import ExtractedClaims, InputSuggestions

    original = "Ronaldo có phải là GOAT?"
    suggestion = "Ronaldo Nazário có giành nhiều World Cup hơn Cristiano Ronaldo không?"
    calls = []

    def complete(model, system, user, schema, check=None):
        if schema is ExtractedClaims:
            return ExtractedClaims(claims=[], input_category="subjective"), model
        assert schema is InputSuggestions
        assert original in user
        calls.append(user)
        return InputSuggestions(suggestions=[suggestion, f" {suggestion} ", original]), model

    fakes.llm.complete = complete
    check = run(client, {"inputType": "text", "text": original})
    assert check["inputSuggestions"] is None
    url = f"/api/check/{check['id']}"
    for _ in range(2):
        response = client.post(f"{url}/input-suggestions")
        assert response.status_code == 200
        assert response.json() == {"suggestions": [suggestion]}
    assert len(calls) == 1
    assert client.get(url).json()["inputSuggestions"] == [suggestion]
    assert fakes.fetch.fetched == []


def test_text_check_returns_claims_both_judges_and_saved_evidence(client, fakes):
    check = run(client)
    assert check["status"] == "completed"
    assert check["claimCount"] == 1
    assert check["createdAt"].endswith("+00:00")

    claim = check["claims"][0]
    assert claim["status"] == "assessed"
    assert claim["currentVersion"] == 1
    assert claim["stockHeatmapMarkets"] is None
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
    assert current["judges"][0]["citations"][0]["evidenceId"] == first["id"]
    assert current["judges"][0]["citations"][0]["quote"] == "opened to passengers"
    assert current["citationFreshness"][first["id"]]["status"] == "current"
    assert evidence[1]["relation"] == "contextual"

    assert "analysis" not in first
    assert len(fakes.llm.calls) == 4  # Extraction, the claim review and the two claim judges only.


def test_stock_question_saves_only_its_relevant_heatmap_markets(client, fakes):
    from app.pipeline.prompts import ExtractedClaim, ExtractedClaims, QUESTION_SYSTEM

    complete = fakes.llm.complete

    def answer(model, system, user, schema, check=None):
        if schema is ExtractedClaims:
            if system != QUESTION_SYSTEM:
                return ExtractedClaims(claims=[]), model
            return ExtractedClaims(claims=[ExtractedClaim(
                text="VN-Index hôm nay giảm.", checkworthiness=0.9, stock_heatmap_markets=["vn"],
            )]), model
        return complete(model, system, user, schema, check)

    fakes.llm.complete = answer
    check = run(client, {"inputType": "text", "text": "VN-Index hôm nay có giảm không?"})
    assert check["status"] == "completed"
    assert check["claims"][0]["stockHeatmapMarkets"] == ["vn"]
    saved = client.get(f"/api/check/{check['id']}").json()
    assert saved["claims"][0]["stockHeatmapMarkets"] == ["vn"]


def test_a_quote_split_over_lines_in_the_page_is_still_shown(client, fakes):
    fakes.fetch.text = "The line opened\n   to passengers on 6 November 2021 after a handover that morning. " * 8
    created = run(client)
    evidence = client.get(f"/api/claims/{created['claims'][0]['id']}/evidence").json()
    assert evidence[0]["excerpt"] == "opened to passengers"


@pytest.mark.parametrize("figure,expected", [("1,250.5", True), ("1,250", False)])
def test_bar_compares_source_figures_without_accepting_a_partial_number(client, fakes, figure, expected):
    from app.pipeline.prompts import ExtractedClaim, ExtractedClaims, ReportedBarChart

    text = "Rail carried more passengers than coaches."
    fakes.fetch.text += " Passengers (thousands). Rail: 1,250.5. Coaches: 850."
    complete = fakes.llm.complete

    def answer(model, system, user, schema, check=None):
        if schema is ExtractedClaims:
            return ExtractedClaims(claims=[ExtractedClaim(text=text, checkworthiness=0.9, bar_chart=True)]), model
        if schema is ReportedBarChart:
            return ReportedBarChart.model_validate({"comparison": {
                "evidence_id": "E1", "title": "Passengers by transport mode", "unit": "thousands",
                "unit_quote": "Passengers (thousands).", "decimal_separator": ".",
                "points": [
                    {"name": "Rail", "figure": figure, "quote": "Rail: 1,250.5."},
                    {"name": "Coaches", "figure": "850", "quote": "Coaches: 850."},
                ],
            }}), model
        return complete(model, system, user, schema, check)

    fakes.llm.complete = answer
    check = run(client, {"inputType": "text", "text": text})
    chart = check["claims"][0]["barChart"]
    if expected:
        assert chart["unit"] == "thousands"
        assert chart["points"] == [{"name": "Rail", "value": 1250.5}, {"name": "Coaches", "value": 850}]
    else:
        assert chart is None


@pytest.mark.parametrize("reverse", [False, True])
def test_route_uses_reported_stop_order_and_verified_times(client, fakes, monkeypatch, reverse):
    from app.pipeline.prompts import ExtractedClaim, ExtractedClaims, ReportedRouteMap

    text = "The service travels from Hanoi to Da Nang."
    fakes.fetch.text += f" {text} It leaves Hanoi at 08:30. It reaches Da Nang at 10:00."
    complete = fakes.llm.complete
    calls = []

    def locate(name, settings, **filters):
        calls.append(name)
        coordinates = {"Hanoi": [105.85, 21.03], "Da Nang": [108.2, 16.05]}[name]
        return [{"properties": {"name": name, "countrycode": "VN"},
                 "geometry": {"type": "Point", "coordinates": coordinates}}]

    def answer(model, system, user, schema, check=None):
        if schema is ExtractedClaims:
            return ExtractedClaims(claims=[ExtractedClaim(text=text, checkworthiness=0.9, route_map=True)]), model
        if schema is ReportedRouteMap:
            stops = [
                {"name": "Hanoi", "country": "VN", "schedule": "08:30", "schedule_quote": "It leaves Hanoi at 08:30."},
                {"name": "Da Nang", "country": "VN", "schedule": "08:30", "schedule_quote": "It leaves Hanoi at 08:30."},
            ]
            return ReportedRouteMap.model_validate({"route": {
                "evidence_id": "E1", "title": "Hanoi to Da Nang", "quote": text,
                "stops": stops[::-1] if reverse else stops,
            }}), model
        return complete(model, system, user, schema, check)

    monkeypatch.setattr("app.charts.route_map.photon_features", locate)
    fakes.llm.complete = answer
    check = run(client, {"inputType": "text", "text": text})
    route = check["claims"][0]["routeMap"]
    if reverse:
        assert route is None
        assert calls == []
    else:
        assert calls == ["Hanoi", "Da Nang"]
        assert route["stops"] == [
            {"name": "Hanoi", "position": [105.85, 21.03], "schedule": "08:30"},
            {"name": "Da Nang", "position": [108.2, 16.05]},
        ]
        assert 600 < route["straightLineKm"] < 615


@pytest.mark.parametrize("text,total,expected", [
    ("In Vietnam, most registered cars run on petrol.", "1,000", True),
    ("Phần lớn xe đăng ký chạy bằng xăng.", "1,100", False),
])
def test_local_search_and_source_verified_pie_chart(client, fakes, text, total, expected):
    from app.pipeline.prompts import ExtractedClaim, ExtractedClaims, ReportedPieChart, ResearchPicks
    from app.search.tavily import SearchHit

    local = "https://vnexpress.net/registered-cars.html"
    other = "https://reuters.com/registered-cars/"
    query = "cơ cấu xe đăng ký theo loại nhiên liệu"
    fakes.fetch.text = f"Total registered cars: {total}. Petrol: 600. Electric: 400. " + fakes.fetch.text
    searched = []
    complete = fakes.llm.complete

    def search_hits(value, **options):
        searched.append((value, options.get("domains")))
        return [SearchHit(local)] if options.get("domains") else [SearchHit(other)]

    def research(model, system, user, schema, run_search, max_searches):
        assert "Prefer reliable Vietnamese news outlets" in user
        run_search("registered cars by fuel")
        return ResearchPicks(urls=[local, other]), model

    def answer(model, system, user, schema, check=None):
        if schema is ExtractedClaims:
            return ExtractedClaims(claims=[ExtractedClaim(
                text=text, checkworthiness=0.9, pie_chart=True, search_query_vi=query,
            )]), model
        if schema is ReportedPieChart:
            return ReportedPieChart.model_validate({"breakdown": {
                "evidence_id": "E1", "title": "Registered cars by fuel", "unit": "count",
                "total": {"figure": total, "quote": f"Total registered cars: {total}."},
                "parts": [
                    {"name": "Petrol", "figure": "600", "quote": "Petrol: 600."},
                    {"name": "Electric", "figure": "400", "quote": "Electric: 400."},
                ],
            }}), model
        return complete(model, system, user, schema, check)

    fakes.search.search_hits = search_hits
    fakes.llm.research = research
    fakes.llm.complete = answer
    check = run(client, {"inputType": "text", "text": text})
    assert check["status"] == "completed"
    assert searched[0][0] == query and "vnexpress.net" in searched[0][1]
    assert searched[1] == ("registered cars by fuel", None)
    pie = check["claims"][0]["pieChart"]
    if expected:
        assert pie["url"] == local
        assert pie["parts"] == [{"name": "Petrol", "value": 600}, {"name": "Electric", "value": 400}]
    else:
        assert pie is None


def test_match_research_searches_organizer_first_and_rejects_pre_event_sources(client, fakes):
    from datetime import date

    from app.pipeline.prompts import ExtractedClaim, ExtractedClaims, ResearchPicks
    from app.search.tavily import SearchHit

    text = "PSG thắng Inter vào ngày 31/5/2025 ở Champions League."
    official = "https://www.uefa.com/uefachampionsleague/2025/05/31/result"
    preview = "https://reuters.com/2025/05/30/preview"
    searches = []
    complete = fakes.llm.complete

    def answer(model, system, user, schema, check=None):
        if schema is ExtractedClaims:
            return ExtractedClaims(claims=[ExtractedClaim(
                text=text, checkworthiness=0.9, match_result="sport", event_date=date(2025, 5, 31),
                search_query_en="PSG Inter Champions League final result", search_query_vi="PSG Inter chung kết",
            )]), model
        return complete(model, system, user, schema, check)

    def search_hits(query, **options):
        searches.append((query, options))
        return [SearchHit(official)] if options.get("domains") else [SearchHit(preview)]

    def research(model, system, user, schema, run_search, max_searches):
        assert "official competition source" in user
        run_search("PSG Inter final result 31 May 2025")
        return ResearchPicks(urls=[preview, official]), model

    fakes.llm.complete, fakes.llm.research, fakes.search.search_hits = answer, research, search_hits
    claim = run(client, {"inputType": "text", "text": text})["claims"][0]
    assert claim["timeContext"] == "2025-05-31"
    assert searches[0][0].startswith("2025-05-31 PSG Inter")
    assert searches[0][1]["domains"] == ["uefa.com"]
    assert all(options["start_date"] == "2025-05-31" for _, options in searches)
    assert [item["url"] for item in client.get(f"/api/claims/{claim['id']}/evidence").json()] == [official]


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
    assert len(fakes.llm.calls) == 6  # Extraction, the claim review and two judges for each claim.


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
        check = Check(user_id=client.user_id, title="Old", input_type="text", input_text="Text", judge_ids=[], status="completed", progress=[
            {"id": "a", "kind": "search", "task": "chart_sources", "chart": "seats", "status": "completed", "startedAt": "2026-11-05T01:00:00"},
            {"id": "b", "kind": "ai", "task": "a_task_since_renamed", "status": "completed", "startedAt": "2026-11-05T01:00:00"},
        ])
        session.add(check)
        session.commit()
        check_id = check.id
    response = client.get(f"/api/check/{check_id}")
    assert response.status_code == 200
    assert response.json()["progress"][0]["chart"] == "seats"


def _saved_under(check_id):
    from sqlalchemy import func, select

    from app.db import models
    from tests.conftest import SessionLocal

    with SessionLocal() as session:
        claims = select(models.Claim.id).where(models.Claim.check_id == check_id)
        count = lambda table, where: session.scalar(select(func.count()).select_from(table).where(where))  # noqa: E731
        return {
            "claims": count(models.Claim, models.Claim.check_id == check_id),
            "sources": count(models.Source, models.Source.check_id == check_id),
            "evidence": count(models.Evidence, models.Evidence.claim_id.in_(claims)),
            "verdicts": count(models.Verdict, models.Verdict.claim_id.in_(claims)),
            "feedback": count(models.Feedback, models.Feedback.check_id == check_id),
        }


def _set_status(check_id, status):
    from app.db import models
    from tests.conftest import SessionLocal

    with SessionLocal() as session:
        session.get(models.Check, check_id).status = status
        session.commit()


def test_deleting_a_check_removes_everything_under_it_and_nothing_else(client):
    kept, gone = run(client), run(client)
    assert client.post(f"/api/check/{gone['id']}/feedback", json={"helpful": True}).status_code == 201
    assert all(_saved_under(gone["id"]).values())
    assert client.delete(f"/api/check/{gone['id']}").status_code == 200
    assert client.get(f"/api/check/{gone['id']}").status_code == 404
    assert not any(_saved_under(gone["id"]).values())
    assert _saved_under(kept["id"])["evidence"] and client.get(f"/api/check/{kept['id']}").status_code == 200


def test_a_running_check_cannot_be_deleted(client):
    from app.pipeline.run import stop_requests

    check = run(client)
    _set_status(check["id"], "retrieving")
    assert client.delete(f"/api/check/{check['id']}").status_code == 422
    # Stopped on screen, but its pipeline hasn't reached its next step yet.
    _set_status(check["id"], "stopped")
    stop_requests.add(check["id"])
    try:
        assert client.delete(f"/api/check/{check['id']}").status_code == 422
    finally:
        stop_requests.discard(check["id"])
    assert client.delete(f"/api/check/{check['id']}").status_code == 200


def test_delete_all_clears_the_history_except_running_checks(client):
    first, running = run(client), run(client)
    _set_status(running["id"], "assessing")
    assert client.delete("/api/checks").json() == {"deleted": 1, "kept": 1}
    assert client.get(f"/api/check/{first['id']}").status_code == 404
    assert [item["id"] for item in client.get("/api/checks").json()["items"]] == [running["id"]]


def test_checks_of_another_reader_are_never_deleted(client):
    from tests.conftest import sign_up

    theirs = run(client)
    sign_up(client, "someone-else")
    assert client.delete(f"/api/check/{theirs['id']}").status_code == 404
    assert client.delete("/api/checks").json() == {"deleted": 0, "kept": 0}
    assert _saved_under(theirs["id"])["claims"]

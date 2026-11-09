from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Event
from types import SimpleNamespace

import pytest
from sqlalchemy.orm import sessionmaker

from app.core.config import Settings
from app.db.models import Check, Claim, Evidence, Source
from app.db.session import Base, make_engine
from app.pipeline.progress import CHART_INCOMPLETE, TaskLog
from app.pipeline.prompts import Citation, ClaimReview, ExtractedClaims, JudgeAnswer, ReportedSeats, SeatChartRequest
from app.pipeline.run import Providers, _judge_claim, run_check
from app.providers.llm import TIMED_OUT, LLMError
from app.search.tavily import SearchError


def test_finished_judge_progress_arrives_before_the_slower_judge_without_changing_primary():
    settings = Settings()
    first_id, second_id = settings.default_judge_ids
    first_model = settings.judges[first_id].model
    release_first = Event()
    events = []

    def complete(model, system, user, schema, check=None):
        if model == first_model:
            assert release_first.wait(3), "The faster model's public update was blocked behind the slower model."
        answer = JudgeAnswer(
            verdict="supported" if model == first_model else "contradicted",
            confidence=0.8,
            review=f"The supplied opening report was reviewed by {model}.",
            citations=[Citation(evidence_id="E1", relation="supporting" if model == first_model else "contradicting",
                                quote="opened in March")],
        )
        check(answer)
        return answer, model if model == first_model else settings.judges["deepseek-flash"].model

    def progress(event):
        events.append(dict(event))
        if event["id"].endswith(second_id) and event["status"] == "completed":
            assert not release_first.is_set()
            release_first.set()

    source = Source(id="src_test", title="Opening report", text="The route opened in March.")
    claim = Claim(id="clm_test", text="The route opened in March.", position=1)
    evidence = [Evidence(id="evd_test", claim_id=claim.id, source=source)]
    check = Check(judge_ids=settings.default_judge_ids)
    providers = SimpleNamespace(llm=SimpleNamespace(complete=complete))
    with ThreadPoolExecutor(2) as pool:
        verdict = _judge_claim(claim, evidence, check, providers, settings, pool, TaskLog(progress))

    done = [event for event in events if event["status"] == "completed"]
    assert done[0]["id"].endswith(second_id)
    # The requested model stays on the row, beside what the provider says really answered.
    assert not any("modelName" in event for event in done)
    started = next(event for event in events if event["id"] == done[0]["id"] and event["status"] == "running")
    assert started["requestedModel"] == settings.judges[second_id].model
    assert done[0]["actualModel"] == settings.judges["deepseek-flash"].model
    assert done[0]["actualModelName"] == "DeepSeek Flash V4.1"
    assert all(event.get("summary") for event in done)
    assert verdict.label == "supported"
    assert [judge["primary"] for judge in verdict.judges] == [True, False]
    assert verdict.judges[1]["judge"] == "DeepSeek Flash V4.1"
    assert len(events) == 4  # Two starts and two finishes, with no additional model requests.


def test_pipeline_saves_public_progress_without_any_per_source_model_calls(tmp_path, fakes):
    engine = make_engine(f"sqlite:///{tmp_path}/progress.db")
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    settings = Settings()
    with sessions() as session:
        check = Check(title="Opening check", input_type="text", input_text="The route opened in March.", judge_ids=settings.default_judge_ids)
        session.add(check)
        session.commit()
        check_id = check.id
    providers = Providers(llm=fakes.llm, search=fakes.search, fetch=fakes.fetch)
    run_check(check_id, sessions, providers, settings)
    with sessions() as session:
        check = session.get(Check, check_id)
        assert check.status == "completed"
        assert all(event["status"] == "completed" for event in check.progress)
        assert check.progress[0]["claimCount"] == 1
        assert [event["task"] for event in check.progress] == ["extracting", "reviewing", "searching", "judging", "judging"]
        assert [event["kind"] for event in check.progress] == ["ai", "ai", "search", "ai", "ai"]
        search = check.progress[2]
        assert search["service"] == "Tavily"
        assert search["claimPosition"] == 1
        assert search["sourceCount"] == 2
        assert search["sourceTarget"] == settings.target_publishers_per_claim
        assert "requestedModel" not in search
    assert len(fakes.llm.calls) == 4
    assert {schema for _, schema in fakes.llm.calls} == {ExtractedClaims, ClaimReview, JudgeAnswer}


def test_failed_extraction_closes_its_public_progress(tmp_path, fakes):
    engine = make_engine(f"sqlite:///{tmp_path}/failed.db")
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    settings = Settings()
    fakes.llm.failing.add(settings.extraction_model)
    with sessions() as session:
        check = Check(title="Opening check", input_type="text", input_text="The route opened in March.", judge_ids=settings.default_judge_ids)
        session.add(check)
        session.commit()
        check_id = check.id
    providers = Providers(llm=fakes.llm, search=fakes.search, fetch=fakes.fetch)
    run_check(check_id, sessions, providers, settings)
    with sessions() as session:
        check = session.get(Check, check_id)
        assert check.status == "failed"
        assert check.progress[0]["status"] == "failed"
        assert check.progress[0]["finishedAt"]
        # The task keeps its own cause, and the check keeps its plain message.
        assert check.progress[0]["summary"] == "down"
        assert check.error_message == "The claims could not be extracted."


def _run_check(tmp_path, providers, settings=None):
    engine = make_engine(f"sqlite:///{tmp_path}/tasks.db")
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    settings = settings or Settings()
    with sessions() as session:
        check = Check(title="Check", input_type="text", input_text="The route opened in March.", judge_ids=settings.default_judge_ids)
        session.add(check)
        session.commit()
        check_id = check.id
    run_check(check_id, sessions, providers, settings)
    with sessions() as session:
        check = session.get(Check, check_id)
        return check.status, check.error_message, check.progress


def test_extraction_timeout_is_shown_on_the_requested_model(tmp_path, fakes):
    settings = Settings()

    def complete(model, system, user, schema, check=None):
        raise LLMError(f"{model}: {TIMED_OUT}", TIMED_OUT)

    providers = Providers(llm=SimpleNamespace(complete=complete), search=fakes.search, fetch=fakes.fetch)
    status, _, progress = _run_check(tmp_path, providers, settings)
    assert status == "failed"
    assert progress[0]["requestedModel"] == settings.extraction_model
    assert progress[0]["status"] == "failed"
    assert progress[0]["summary"] == TIMED_OUT
    assert progress[0].get("actualModel") is None


def test_one_judges_failure_stays_on_that_judges_row(tmp_path, fakes):
    settings = Settings()
    first, second = (settings.judges[judge_id].model for judge_id in settings.default_judge_ids)
    fakes.llm.failing.add(first)
    providers = Providers(llm=fakes.llm, search=fakes.search, fetch=fakes.fetch)
    status, _, progress = _run_check(tmp_path, providers, settings)
    judges = {event["requestedModel"]: event for event in progress if event["task"] == "judging"}
    assert status == "completed"
    assert judges[first]["status"] == "failed"
    assert judges[first]["summary"] == "down"
    assert judges[second]["status"] == "completed"
    assert judges[second]["actualModel"] == second


def test_a_provider_that_reports_no_model_is_not_credited_with_one(tmp_path, fakes):
    def complete(model, system, user, schema, check=None):
        answer, _ = fakes.llm.complete(model, system, user, schema, check)
        return answer, ""

    providers = Providers(llm=SimpleNamespace(complete=complete), search=fakes.search, fetch=fakes.fetch)
    status, _, progress = _run_check(tmp_path, providers)
    assert status == "completed"
    for event in progress:
        if event["kind"] == "ai":
            assert event["actualModel"] is None
            assert event["requestedModel"]


def test_a_tavily_failure_is_on_the_tavily_row_and_calls_no_judge(tmp_path, fakes):
    def search(query):
        raise SearchError("The service is rate-limited.")

    providers = Providers(llm=fakes.llm, search=SimpleNamespace(search=search), fetch=fakes.fetch)
    status, _, progress = _run_check(tmp_path, providers)
    assert status == "completed"
    tavily = next(event for event in progress if event["kind"] == "search")
    assert tavily["status"] == "failed"
    assert tavily["summary"] == "The service is rate-limited."
    assert not any(event["task"] == "judging" for event in progress)


def test_chart_data_is_only_listed_when_a_service_is_really_called(tmp_path, fakes):
    providers = Providers(
        llm=fakes.llm, search=fakes.search, fetch=fakes.fetch, market=fakes.market,
    )
    _, _, progress = _run_check(tmp_path, providers)
    assert not any(event["kind"] == "data" for event in progress)
    assert fakes.market.calls == []


def test_chart_data_rows_name_the_service_and_its_failure(tmp_path, fakes):
    fakes.llm.claims = ["Bitcoin price rose above $100,000 on 5 December 2024."]
    fakes.llm.price_asset = "bitcoin"
    fakes.market.fails = True
    providers = Providers(
        llm=fakes.llm, search=fakes.search, fetch=fakes.fetch, market=fakes.market,
    )
    status, _, progress = _run_check(tmp_path, providers)
    assert status == "completed"
    row = next(event for event in progress if event["kind"] == "data")
    assert (row["service"], row["chart"], row["status"]) == (fakes.market.name, "price", "failed")
    assert row["claimPosition"] == 1
    assert "requestedModel" not in row


def test_reading_figures_for_a_chart_is_an_ai_task_on_the_configured_model(tmp_path, fakes):
    settings = Settings(research_model="test/chart-reader")
    fakes.llm.claims = ["Labour won 412 seats in the 2024 election to the House of Commons."]
    fakes.llm.seat_chart = SeatChartRequest(body="House of Commons", year=2024)
    fakes.fetch.published_at = "2024-07-05"
    providers = Providers(llm=fakes.llm, search=fakes.search, fetch=fakes.fetch)
    status, _, progress = _run_check(tmp_path, providers, settings)
    assert status == "completed"
    row = next(event for event in progress if event["task"] == "reading_seats")
    assert (row["kind"], row["requestedModel"], row["actualModel"]) == ("ai", "test/chart-reader", "test/chart-reader")
    assert row["summary"] == CHART_INCOMPLETE
    assert ("test/chart-reader", ReportedSeats) in fakes.llm.calls
    assert (settings.extraction_model, ReportedSeats) not in fakes.llm.calls


def test_charts_for_different_claims_run_at_the_same_time_and_still_report_their_tasks(tmp_path, fakes):
    fakes.llm.claims = ["Bitcoin price rose above $100,000.", "Ethereum price rose above $4,000."]
    fakes.llm.price_asset = "bitcoin"
    both_running = Barrier(2, timeout=3)

    class Market:
        name = "Test market"

        def daily_closes(self, symbol, start, end):
            both_running.wait()  # Breaks, failing the check, unless the other claim's chart is running too.
            return [[1733356800000, 98000.5], [1733443200000, 101000.25]]

    answered = []

    def complete(model, system, user, schema, check=None):
        answer, actual = fakes.llm.complete(model, system, user, schema, check)
        if schema is ExtractedClaims:
            answer.claims[1].price_asset = "ethereum"
        answered.append(schema)
        return answer, actual

    providers = Providers(llm=SimpleNamespace(complete=complete), search=fakes.search, fetch=fakes.fetch, market=Market())
    status, _, progress = _run_check(tmp_path, providers)
    assert status == "completed"
    rows = [event for event in progress if event["kind"] == "data"]
    assert sorted(event["claimPosition"] for event in rows) == [1, 2]
    assert all(event["status"] == "completed" and event["startedAt"] for event in rows)


def test_reading_figures_for_different_claims_runs_at_the_same_time(tmp_path, fakes):
    fakes.llm.claims = [
        "Labour won 412 seats in the 2024 election to the House of Commons.",
        "The Conservatives won 121 seats in the 2024 election to the House of Commons.",
    ]
    fakes.llm.seat_chart = SeatChartRequest(body="House of Commons", year=2024)
    fakes.fetch.published_at = "2024-07-05"
    both_running = Barrier(2, timeout=3)

    def complete(model, system, user, schema, check=None):
        if schema is ReportedSeats:
            both_running.wait()
        return fakes.llm.complete(model, system, user, schema, check)

    providers = Providers(llm=SimpleNamespace(complete=complete), search=fakes.search, fetch=fakes.fetch)
    status, _, progress = _run_check(tmp_path, providers)
    assert status == "completed"
    rows = [event for event in progress if event["task"] == "reading_seats"]
    assert sorted(event["claimPosition"] for event in rows) == [1, 2]
    assert all(event["status"] == "completed" for event in rows)


def _translating_judges(tmp_path, fakes, answer):
    complete = fakes.llm.complete

    def judge(model, system, user, schema, check=None):
        if schema is JudgeAnswer:
            return answer, model
        return complete(model, system, user, schema, check)

    fakes.llm.complete = judge
    fakes.search.results = ["https://reuters.com/a"]
    engine = make_engine(f"sqlite:///{tmp_path}/translated.db")
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    settings = Settings()
    with sessions() as session:
        check = Check(title="Check", input_type="text", input_text="The line opened.", judge_ids=settings.default_judge_ids)
        session.add(check)
        session.commit()
        check_id = check.id
    run_check(check_id, sessions, Providers(llm=fakes.llm, search=fakes.search, fetch=fakes.fetch), settings)
    with sessions() as session:
        check = session.get(Check, check_id)
        claim = session.query(Claim).filter_by(check_id=check_id).one()
        return check.progress, claim.verdicts[-1], claim.evidence[0]


def test_the_judges_own_translations_are_saved_with_no_extra_model_call(tmp_path, fakes):
    from app.api.serializers import revision_out

    answer = JudgeAnswer(
        verdict="supported", confidence=0.9, review="The line opened on 6 November 2021.",
        review_en="The line opened on 6 November 2021.", review_vi="Tuyến mở cửa ngày 6/11/2021.",
        citations=[Citation(evidence_id="E1", relation="supporting", quote="opened to passengers on 6 November 2021",
                            quote_vi="mở cửa đón khách ngày 6/11/2021")],
    )
    progress, verdict, evidence = _translating_judges(tmp_path, fakes, answer)
    assert verdict.judges[0]["translations"]["vi"] == "Tuyến mở cửa ngày 6/11/2021."
    response = revision_out(verdict).model_dump(mode="json", by_alias=True)
    assert response["judges"][0]["translations"]["vi"] == "Tuyến mở cửa ngày 6/11/2021."
    assert verdict.judges[0]["review"] == "The line opened on 6 November 2021."
    assert evidence.excerpt == "opened to passengers on 6 November 2021"
    assert evidence.translations == {"vi": "mở cửa đón khách ngày 6/11/2021"}
    assert next(event for event in progress if event["task"] == "judging")["translations"]["vi"]
    assert not any(schema.__name__.startswith("Transl") for _, schema in fakes.llm.calls)


def test_a_translation_that_loses_a_figure_is_dropped(tmp_path, fakes):
    answer = JudgeAnswer(
        verdict="supported", confidence=0.9, review="The line carried 412 riders in 2021.",
        review_vi="Tuyến chở nhiều khách.",
        citations=[Citation(evidence_id="E1", relation="supporting", quote="opened to passengers on 6 November 2021",
                            quote_vi="mở cửa đón khách")],
    )
    _, verdict, evidence = _translating_judges(tmp_path, fakes, answer)
    assert verdict.judges[0]["translations"] == {}
    assert evidence.translations == {}


def _price_chart(*days_and_prices):
    from datetime import UTC, datetime

    return {
        "asset": "gold",
        "currency": "USD",
        "source": "Yahoo Finance",
        "prices": [[int(datetime.fromisoformat(day).replace(tzinfo=UTC).timestamp() * 1000), price]
                   for day, price in days_and_prices],
    }


def test_judges_read_the_claims_price_data_and_may_cite_it_alone():
    settings = Settings()
    prompts = []

    def complete(model, system, user, schema, check=None):
        prompts.append(user)
        answer = JudgeAnswer(
            verdict="contradicted",
            confidence=0.8,
            review="Yahoo Finance shows gold rising from 3,898.90 to 4,113.50 USD.",
            citations=[
                Citation(evidence_id="D1", relation="contradicting", quote="2026-11-05: 4,113.50"),
                Citation(evidence_id="E1", relation="contextual", quote="Gold may keep falling, analysts say."),
            ],
        )
        check(answer)
        return answer, model

    source = Source(id="src_test", title="Gold forecast", text="Gold may keep falling, analysts say.")
    claim = Claim(id="clm_test", text="Giá vàng giảm mạnh trong tháng 11/2026.", position=1,
                  price_chart=_price_chart(("2026-10-30", 3898.9), ("2026-11-05", 4113.5)))
    evidence = [Evidence(id="evd_test", claim_id=claim.id, source=source)]
    check = Check(judge_ids=settings.default_judge_ids)
    providers = SimpleNamespace(llm=SimpleNamespace(complete=complete))
    with ThreadPoolExecutor(2) as pool:
        verdict = _judge_claim(claim, evidence, check, providers, settings, pool)

    assert '<data evidence_id="D1"' in prompts[0]
    assert "2026-10-30: 3,898.90" in prompts[0] and "2026-11-05: 4,113.50" in prompts[0]
    assert verdict.label == "contradicted"
    # The data is the claim's chart, not a source, so it is never saved as one.
    assert verdict.evidence_ids == [] and verdict.citation_freshness == {}


def test_a_claim_without_price_data_cannot_cite_it():
    settings = Settings()

    def complete(model, system, user, schema, check=None):
        assert "<data" not in user
        answer = JudgeAnswer(verdict="supported", confidence=0.8, review="Cited data.",
                             citations=[Citation(evidence_id="D1", relation="supporting", quote="x")])
        with pytest.raises(ValueError, match="Unknown evidence ids"):
            check(answer)
        raise LLMError("bad answer")

    source = Source(id="src_test", title="Report", text="The route opened in March.")
    claim = Claim(id="clm_test", text="The route opened in March.", position=1)
    check = Check(judge_ids=settings.default_judge_ids)
    providers = SimpleNamespace(llm=SimpleNamespace(complete=complete))
    with ThreadPoolExecutor(2) as pool:
        assert _judge_claim(claim, [Evidence(id="e", claim_id=claim.id, source=source)], check, providers, settings, pool) is None


def test_every_configured_judge_must_quote_each_supplied_source():
    settings = Settings()
    called = set()

    def complete(model, system, user, schema, check=None):
        assert 'evidence_id="E1"' in user and 'evidence_id="E2"' in user
        answer = JudgeAnswer(
            verdict="supported", confidence=0.9, review="The official result confirms the claim.",
            citations=[Citation(evidence_id="E1", relation="supporting", quote="United beat City 2–1.")],
        )
        with pytest.raises(ValueError, match="Missing source entries: E2"):
            check(answer)
        answer.citations.append(Citation(evidence_id="E2", relation="contextual", quote="United won 2–1."))
        with pytest.raises(ValueError, match="Quotes for E2"):
            check(answer)
        answer.citations[-1].quote = "The teams were due to play on Sunday."
        answer.citations[0].freshness = "outdated"
        with pytest.raises(ValueError, match="applies to the claim's period"):
            check(answer)
        answer.citations[0].freshness = "current"
        check(answer)
        called.add(model)
        return answer, model

    claim = Claim(id="clm_match", text="United beat City 2–1.", position=1)
    evidence = [
        Evidence(id="official", source=Source(title="Final result", text="United beat City 2–1.")),
        Evidence(id="preview", source=Source(title="Preview", text="The teams were due to play on Sunday.")),
    ]
    check = Check(judge_ids=list(settings.judges))
    providers = SimpleNamespace(llm=SimpleNamespace(complete=complete))
    with ThreadPoolExecutor(4) as pool:
        verdict = _judge_claim(claim, evidence, check, providers, settings, pool)

    assert called == {option.model for option in settings.judges.values()}
    assert verdict.evidence_ids == ["official"]
    assert all([citation["evidence_id"] for citation in judge["citations"]] == ["official", "preview"]
               for judge in verdict.judges)

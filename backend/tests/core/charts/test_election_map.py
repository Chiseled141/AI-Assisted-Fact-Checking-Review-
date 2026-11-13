from datetime import date

import pytest

from claimtrace.config.settings import get_settings
from claimtrace.core.charts.election_map import election_window, is_us_election_claim, is_verified_state
from claimtrace.core.pipeline.prompts import (
    ElectionMapRequest,
    ExtractedClaims,
    ReportedElection,
    ReportedSeat,
    ReportedSeats,
    ReportedState,
    ReportedStates,
    ReportedTotal,
    ResearchPicks,
    SeatChartRequest,
)
from claimtrace.core.search.tavily import SearchHit
from tests.helpers import run

CLAIM = "Trump carried Ohio in the 2024 US presidential election."
OHIO = "Trump carried Ohio with 55% of the vote."
VIRGINIA = "Harris won Virginia in the final count."
GEORGIA = "Trump won Georgia after a close race."
PAGE = f"{OHIO} {VIRGINIA} {GEORGIA} "


def _state(state="Ohio", winner="Trump", quote=OHIO, detail="55%", evidence_id="E1"):
    return ReportedState(evidence_id=evidence_id, state=state, winner=winner, quote=quote, detail=detail)


def _setup(fakes, states=None, year=2024):
    fakes.llm.claims = [CLAIM]
    fakes.llm.election_map = ElectionMapRequest(office="president", year=year)
    fakes.fetch.text = PAGE * 8
    fakes.fetch.published_at = "2024-11-20"
    fakes.llm.reported_states = ReportedStates(states=states or [])


@pytest.mark.parametrize(
    ("text", "office", "expected"),
    [
        (CLAIM, "president", True),
        ("Republicans won 220 seats in the 2024 election to the US House of Representatives.", "house", True),
        ("Đảng Cộng hòa thắng ở Hạ viện Mỹ trong bầu cử 2024.", "house", True),
        ("Labour won the UK House of Commons election.", "house", False),
        ("The US president visited Hanoi.", "president", False),
        (CLAIM, "senate", False),
    ],
)
def test_only_a_claim_about_a_us_election_gets_a_map(text, office, expected):
    assert is_us_election_claim(text, office) is expected


@pytest.mark.parametrize(
    ("report", "expected"),
    [
        (_state(), True),
        (_state("Virginia", "Harris", VIRGINIA, None), True),
        # The quote isn't in the page, names another state, names another winner, or gives another figure.
        (_state(quote="Trump carried Ohio by a mile."), False),
        (_state("Georgia"), False),
        (_state(winner="Harris"), False),
        (_state(detail="60%"), False),
        # Not a real state, or a state inside another name.
        (_state("Atlantis"), False),
        (_state("Kansas", "Trump", "Trump won Arkansas easily.", None), False),
        (_state("Virginia", "Trump", "Trump won West Virginia easily.", None), False),
    ],
)
def test_a_state_read_by_a_model_must_be_in_the_sources_own_words(report, expected):
    page = f"{PAGE} Trump won Arkansas easily. Trump won West Virginia easily."
    assert is_verified_state(report, page) is expected


def test_a_result_from_before_the_final_count_is_dropped():
    quote = "Trump is projected to win Ohio."
    assert not is_verified_state(_state(quote=quote, detail=None), quote)


def test_a_check_saves_the_states_that_pass_and_nothing_else(client, fakes):
    _setup(fakes, [_state(), _state("Virginia", "Harris", VIRGINIA, None), _state("Georgia", "Trump", GEORGIA, None), _state("Texas", "Trump", "Trump won Texas.", None)])
    election = run(client)["claims"][0]["electionMap"]
    assert (election["office"], election["year"]) == ("president", 2024)
    assert [(state["code"], state["winner"], state["detail"]) for state in election["states"]] == [
        ("us-ga", "Trump", None), ("us-oh", "Trump", "55%"), ("us-va", "Harris", None),
    ]
    assert election["states"][0]["url"].startswith("https://")


def test_a_verified_state_is_enough_for_a_claim_about_that_state(client, fakes):
    _setup(fakes, [_state()])
    check = run(client)
    assert [state["code"] for state in check["claims"][0]["electionMap"]["states"]] == ["us-oh"]
    assert next(event for event in check["progress"] if event["task"] == "reading_states")["status"] == "completed"


def test_results_from_another_state_do_not_fill_a_focused_map(client, fakes):
    _setup(fakes, [_state("Virginia", "Harris", VIRGINIA, None)])
    assert run(client)["claims"][0]["electionMap"] is None


@pytest.mark.parametrize("verified", [True, False])
def test_both_chambers_midterm_claim_draws_a_house_map_with_verified_results(client, fakes, monkeypatch, verified):
    fakes.llm.claims = ["Đảng Dân Chủ chiếm ưu thế ở cả 2 viện trong cuộc bầu cử giữa kỳ tháng 11/2026."]
    complete = fakes.llm.complete

    def complete_with_topic(model, system, user, schema, check=None):
        answer, reported = complete(model, system, user, schema, check)
        if schema is ExtractedClaims:
            answer.claims[0].topic = "kiểm soát Quốc hội Mỹ 2026"
        return answer, reported

    fakes.llm.complete = complete_with_topic
    monkeypatch.setattr(get_settings(), "election_map_min_states", 51)
    quote = "Democrats won most of Virginia's House seats."
    fakes.fetch.text = (quote + " " + PAGE) * 8 if verified else PAGE * 8
    fakes.fetch.published_at = "2026-11-08"
    fakes.llm.reported_states = ReportedStates(states=[_state("Virginia", "Democrats", quote, None)])

    check = run(client)
    election = check["claims"][0]["electionMap"]
    assert any(event["task"] == "reading_states" for event in check["progress"])
    if verified:
        assert (election["office"], election["year"]) == ("house", 2026)
        assert [state["code"] for state in election["states"]] == ["us-va"]
    else:
        assert election is None


def test_when_sources_disagree_the_other_winner_stays_on_screen(client, fakes):
    other = "Harris carried Ohio in a surprise."
    _setup(fakes, [
        _state(), _state(evidence_id="E2"), _state("Ohio", "Harris", other, None, "E3"),
        _state("Virginia", "Harris", VIRGINIA, None), _state("Georgia", "Trump", GEORGIA, None),
    ])
    fakes.fetch.text = (PAGE + other + " ") * 8
    fakes.search.results = ["https://reuters.com/a", "https://bbc.com/b", "https://apnews.com/c"]
    states = run(client)["claims"][0]["electionMap"]["states"]
    ohio = next(state for state in states if state["code"] == "us-oh")
    assert ohio["winner"] == "Trump"
    assert [other["winner"] for other in ohio["others"]] == ["Harris"]


def test_other_claims_spend_no_model_call_on_a_map(client, fakes):
    fakes.llm.claims = ["The line opened on 6 November 2021."]
    run(client)
    assert not any(schema is ReportedStates for _, schema in fakes.llm.calls)


def test_a_failed_map_keeps_the_verdict(client, fakes):
    _setup(fakes, [_state()])
    fakes.llm.failing.add("__none__")
    original = fakes.llm.complete

    def complete(model, system, user, schema, check=None):
        if schema is ReportedStates:
            from claimtrace.core.providers.llm import LLMError

            raise LLMError("down")
        return original(model, system, user, schema, check)

    fakes.llm.complete = complete
    check = run(client)
    claim = check["claims"][0]
    assert claim["electionMap"] is None
    assert claim["current"]["verdict"] == "supported"
    assert next(event for event in check["progress"] if event["task"] == "reading_states")["status"] == "failed"


def test_a_claim_with_both_visuals_spends_one_model_call_on_them(client, fakes):
    claim = "Republicans won 220 seats in the 2024 election to the US House of Representatives."
    total = "Republicans won 220 seats in the 435-seat House."
    states = ["Republicans won Ohio.", "Democrats won Virginia.", "Republicans won Texas."]
    fakes.llm.claims = [claim]
    fakes.llm.seat_chart = SeatChartRequest(body="US House of Representatives", year=2024)
    fakes.llm.election_map = ElectionMapRequest(office="house", year=2024)
    fakes.fetch.text = f"{total} {' '.join(states)} " * 8
    fakes.fetch.published_at = "2024-12-05"
    fakes.llm.reported_election = ReportedElection(
        total=ReportedTotal(evidence_id="E1", seats=435, quote=total),
        parties=[ReportedSeat(evidence_id="E1", party="Republicans", seats=220, quote=total)],
        states=[
            _state(state, winner, quote, None)
            for state, winner, quote in zip(("Ohio", "Virginia", "Texas"), ("Republicans", "Democrats", "Republicans"), states, strict=True)
        ],
    )
    page = "https://reuters.com/a"
    fakes.search.search_hits = lambda query, **options: [SearchHit(page)]

    def research(model, system, user, schema, run_search, max_searches):
        run_search("q")
        return ResearchPicks(urls=[page]), model

    fakes.llm.research = research
    check = run(client)
    result = check["claims"][0]
    assert result["seatChart"]["parties"][0]["seats"] == 220
    assert [state["code"] for state in result["electionMap"]["states"]] == ["us-oh", "us-tx", "us-va"]
    reads = [schema for _, schema in fakes.llm.calls if schema in (ReportedElection, ReportedSeats, ReportedStates)]
    assert reads == [ReportedElection]
    tasks = [event["task"] for event in check["progress"]]
    assert tasks.count("reading_election") == 1


def test_claims_about_one_election_and_scope_share_one_model_call_and_map(client, fakes):
    claims = [
        "Trump carried Ohio in the 2024 US presidential election.",
        "Trump won 17 electoral votes from Ohio in the 2024 US presidential election.",
    ]
    _setup(fakes, [_state(), _state("Virginia", "Harris", VIRGINIA, None), _state("Georgia", "Trump", GEORGIA, None)])
    fakes.llm.claims = claims
    check = run(client)
    maps = [claim["electionMap"] for claim in check["claims"]]
    assert maps[0] and all(election == maps[0] for election in maps)
    assert sum(schema is ReportedStates for _, schema in fakes.llm.calls) == 1


@pytest.mark.parametrize(
    ("year", "us", "today", "start", "end"),
    [
        (2024, True, date(2026, 11, 5), "2024-11-05", "2025-06-30"),
        (2026, True, date(2026, 11, 5), "2026-11-03", None),
        (2024, False, date(2026, 11, 5), "2024-01-01", "2025-06-30"),
    ],
)
def test_an_elections_window_runs_from_election_day_into_the_next_year(year, us, today, start, end):
    window = election_window(year, us=us, today=today)
    assert (window.start, window.end) == (start, end)


def test_a_party_only_colors_the_map_when_the_source_uses_the_word(client, fakes):
    ohio = _state()
    ohio.party = "republican"
    georgia = _state("Georgia", "Trump", GEORGIA, None)
    georgia.party = "republican"
    virginia = _state("Virginia", "Harris", VIRGINIA, None)
    virginia.party = "democratic"
    _setup(fakes, [ohio, georgia, virginia])
    fakes.fetch.text = (PAGE + "The Republican candidate spoke. ") * 8
    states = {state["code"]: state["party"] for state in run(client)["claims"][0]["electionMap"]["states"]}
    assert states == {"us-oh": "republican", "us-ga": "republican", "us-va": None}

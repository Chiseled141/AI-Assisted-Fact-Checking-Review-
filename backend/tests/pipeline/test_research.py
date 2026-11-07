from types import SimpleNamespace
from unittest.mock import patch

from sqlalchemy.orm import sessionmaker

from app.core.config import Settings
from app.db.models import Check, Claim, Source
from app.db.session import Base, make_engine
from app.pipeline.prompts import (
    ElectionMapRequest,
    ExtractedClaim,
    ExtractedClaims,
    JudgeAnswer,
    ReportedState,
    ReportedStates,
    ResearchPicks,
)
from app.pipeline.research import research_sources
from app.pipeline.run import Providers, run_check
from app.providers.llm import TIMED_OUT, LLMError
from app.search.fetcher import Page
from app.search.tavily import CHART_DOMAINS, CHART_SOURCES, SearchError, SearchHit, TimeWindow

GOOD = "https://reuters.com/results"
OTHER = "https://bbc.com/results"


def _researcher(*queries, urls=(GOOD,), reported="research/answered", results_only=False):
    def research(model, system, user, schema, run_search, max_searches):
        for query in queries:
            run_search(query, results_only)
        return ResearchPicks(urls=list(urls)), reported

    return research


def _search(hits=None, asked=None):
    def search_hits(query, **options):
        if asked is not None:
            asked.append(options)
        return hits if hits is not None else [SearchHit(GOOD, title="Results", raw_content="Results " * 40), SearchHit(OTHER)]

    return search_hits


def test_the_model_can_only_choose_addresses_a_search_returned():
    found = research_sources("A claim.", "brief", _search(), _researcher("q", urls=(OTHER, "https://made-up.example/x", OTHER)), Settings(), None, True)
    # Only the model's valid choice remains. Unselected pages cannot fill the source target.
    assert [hit.url for hit in found.hits] == [OTHER]
    assert found.searches == 1


def test_the_server_applies_the_period_and_the_domains_not_the_model():
    asked = []
    window = TimeWindow("2024-11-05", "2025-06-30")
    research_sources("A claim.", "brief", _search(asked=asked), _researcher("q", results_only=True), Settings(), window, False)
    assert asked == [{"newest_first": False, "start_date": "2024-11-05", "end_date": "2025-06-30", "domains": CHART_DOMAINS["elections"]}]


def test_a_failed_model_is_reported_and_nothing_is_chosen():
    def research(*args):
        raise LLMError("detail", TIMED_OUT)

    found = research_sources("A claim.", "brief", _search(), research, Settings(), None, True)
    assert found.hits is None
    assert found.llm_error == TIMED_OUT


def test_every_failed_search_is_not_the_same_as_choosing_nothing():
    def failing(query, **options):
        raise SearchError("The service is rate-limited.")

    found = research_sources("A claim.", "brief", failing, _researcher("q"), Settings(), None, True)
    assert found.hits is None
    assert found.search_error == "The service is rate-limited."
    nothing_found = research_sources("A claim.", "brief", _search(hits=[]), _researcher("q", urls=()), Settings(), None, True)
    assert nothing_found.hits == []
    assert nothing_found.search_error is None


def test_a_model_rejecting_every_candidate_does_not_get_padded_with_unselected_pages():
    found = research_sources("A claim.", "brief", _search(), _researcher("q", urls=()), Settings(), None, True)
    assert found.hits == []
    assert found.candidate_count == 2


def test_a_rejected_result_set_is_not_reintroduced_by_a_direct_backfill(fakes):
    from concurrent.futures import ThreadPoolExecutor

    from app.pipeline.run import _retrieve

    def must_not_backfill(*args, **kwargs):
        raise AssertionError("Researcher-rejected pages must not be brought back by a direct search.")

    search = SimpleNamespace(search_hits=_search(), search_more=must_not_backfill)
    providers = Providers(llm=SimpleNamespace(research=_researcher("q", urls=())), search=search, fetch=fakes.fetch)
    with ThreadPoolExecutor(2) as pool:
        pages, selected, failed = _retrieve(
            [Claim(id="c", position=1, text="A factual claim.")], None, providers, Settings(), pool, briefs={"c": "brief"},
        )
    assert pages == {} and selected == {"c": []}
    assert not failed and not fakes.fetch.fetched


def test_a_full_choice_is_left_alone():
    many = [SearchHit(f"https://reuters.com/{index}") for index in range(7)]
    chosen = tuple(hit.url for hit in many[:5])
    found = research_sources("A claim.", "brief", _search(hits=many), _researcher("q", urls=chosen), Settings(), None, True)
    assert [hit.url for hit in found.hits] == list(chosen)


def test_a_search_that_found_nothing_is_followed_by_the_direct_search(tmp_path, fakes):
    asked = []

    def search_hits(query, **options):
        asked.append(options)
        return []

    def search_more(query, exclude, **options):
        asked.append(options)
        return [SearchHit(GOOD)]

    fakes.llm.research = _researcher("q", urls=())
    settings = Settings(research_model="third/model")
    engine = make_engine(f"sqlite:///{tmp_path}/backfill.db")
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    with sessions() as session:
        check = Check(title="Check", input_type="text", input_text="The route opened in March.", judge_ids=settings.default_judge_ids)
        session.add(check)
        session.commit()
        check_id = check.id
    search = SimpleNamespace(search_hits=search_hits, search_more=search_more, search=lambda query: [])
    run_check(check_id, sessions, Providers(llm=fakes.llm, search=search, fetch=fakes.fetch), settings)
    with sessions() as session:
        assert [source.url for source in session.query(Source).filter_by(check_id=check_id).all()] == [GOOD]
    assert len(asked) >= 2


def _check(tmp_path, fakes, research, search_hits=None, settings=None):
    engine = make_engine(f"sqlite:///{tmp_path}/research.db")
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    settings = settings or Settings(research_model="third/model")
    fakes.llm.research = research
    search = SimpleNamespace(search_hits=search_hits or _search(), search=lambda query: [])
    with sessions() as session:
        check = Check(title="Check", input_type="text", input_text="The route opened in March.", judge_ids=settings.default_judge_ids)
        session.add(check)
        session.commit()
        check_id = check.id
    run_check(check_id, sessions, Providers(llm=fakes.llm, search=search, fetch=fakes.fetch), settings)
    with sessions() as session:
        check = session.get(Check, check_id)
        sources = session.query(Source).filter_by(check_id=check_id).all()
        return check.status, check.progress, [source.url for source in sources]


def test_the_third_model_finds_the_sources_and_the_two_judges_only_assess_them(tmp_path, fakes):
    status, progress, sources = _check(tmp_path, fakes, _researcher("q"))
    assert status == "completed"
    assert sources[0] == GOOD
    row = next(event for event in progress if event["task"] == "researching")
    assert (row["kind"], row["requestedModel"], row["actualModel"], row["status"]) == ("ai", "third/model", "research/answered", "completed")
    judges = [model for model, schema in fakes.llm.calls if schema is JudgeAnswer]
    assert "third/model" not in judges
    assert len(judges) == 2
    tavily = next(event for event in progress if event["task"] == "searching")
    assert tavily["service"] == "Tavily"
    assert tavily["searchCount"] == 1


def test_no_extra_search_runs_after_research_even_when_it_chose_few_sources(tmp_path, fakes):
    asked = []
    _check(tmp_path, fakes, _researcher("q", urls=(GOOD,)), _search(asked=asked))
    assert len(asked) == 1


def test_when_research_fails_tavily_still_finds_sources_and_the_failure_stays_visible(tmp_path, fakes):
    def research(*args):
        raise LLMError("detail", TIMED_OUT)

    status, progress, sources = _check(tmp_path, fakes, research)
    assert status == "completed"
    assert sources
    row = next(event for event in progress if event["task"] == "researching")
    assert (row["status"], row["summary"]) == ("failed", TIMED_OUT)
    assert not any(event.get("actualModel") == "third/model" for event in progress)


def test_the_research_model_is_told_what_a_chart_needs(tmp_path, fakes):
    fakes.llm.claims = ["Trump carried Ohio in the 2024 US presidential election."]
    fakes.llm.election_map = ElectionMapRequest(office="president", year=2024)
    fakes.fetch.published_at = "2024-11-20"
    prompts = []

    def research(model, system, user, schema, run_search, max_searches):
        prompts.append(user)
        run_search("q")
        return ResearchPicks(urls=[GOOD]), model

    _check(tmp_path, fakes, research)
    assert "who won each US state" in prompts[0]
    assert "2024-11-05" in prompts[0]


CLAIM_2024 = "Trump carried Ohio in the 2024 US presidential election."
OHIO = "Trump carried Ohio with 55% of the vote."
GEORGIA = "Trump won Georgia after a close race."
VIRGINIA = "Harris won Virginia in the final count."
TEXAS = "Trump won Texas easily in the final count."


def _state(name, winner, quote, evidence_id):
    return ReportedState(evidence_id=evidence_id, state=name, winner=winner, quote=quote)


def _chart_run(tmp_path, fakes, pages, answers, settings=None):
    """`pages` maps a search round's chosen address to its text, in order. `answers` are the reader's, round by round."""
    fakes.llm.claims = [CLAIM_2024]
    fakes.llm.election_map = ElectionMapRequest(office="president", year=2024)
    settings = settings or Settings(research_model="third/model")
    briefs, reads = [], []
    urls = iter(pages)

    def research(model, system, user, schema, run_search, max_searches):
        briefs.append(user)
        if "still needs" not in user:  # The claim's evidence research.
            run_search("q")
            return ResearchPicks(urls=[GOOD]), model
        run_search("q")
        chosen = next(urls, None)
        return ResearchPicks(urls=[chosen] if chosen else []), model

    fakes.llm.research = research
    answers = iter(answers)
    complete = fakes.llm.complete

    def read(model, system, user, schema, check=None):
        if schema is ReportedStates:
            reads.append(user)
            return next(answers, ReportedStates()), model
        return complete(model, system, user, schema, check)

    fakes.llm.complete = read

    def fetch(url):
        return Page(url=url, title=url, text=f"{pages.get(url, '')} " + "words " * 90, publisher=url, published_at="2024-11-20")

    def search_hits(query, **options):
        # A chart searches its own list. Evidence searches everything, so the two sets of pages stay apart here.
        return [SearchHit(url) for url in pages] if options.get("domains") else [SearchHit(GOOD)]

    search = SimpleNamespace(search_hits=search_hits, search=lambda query: [])
    engine = make_engine(f"sqlite:///{tmp_path}/chart.db")
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    with sessions() as session:
        check = Check(title="Check", input_type="text", input_text=CLAIM_2024, judge_ids=settings.default_judge_ids)
        session.add(check)
        session.commit()
        check_id = check.id
    # These tests choose their own pages, so the known results page stays out of the way.
    with patch.dict(CHART_SOURCES["countries"]["US"]["results"], {}, clear=True):
        run_check(check_id, sessions, Providers(llm=fakes.llm, search=search, fetch=fetch), settings)
    with sessions() as session:
        check = session.get(Check, check_id)
        claim = session.query(Claim).filter_by(check_id=check_id).first()
        return check.progress, claim.election_map, briefs, reads, [source.url for source in session.query(Source).filter_by(check_id=check_id).all()]


def test_a_chart_finds_its_own_sources_and_searches_again_for_the_states_still_missing(tmp_path, fakes):
    first, second = "https://nytimes.com/national", "https://bbc.com/texas"
    pages = {first: f"{OHIO} {GEORGIA} {VIRGINIA}", second: TEXAS}
    answers = [
        ReportedStates(states=[_state("Ohio", "Trump", OHIO, "E1"), _state("Georgia", "Trump", GEORGIA, "E1"), _state("Virginia", "Harris", VIRGINIA, "E1")]),
        ReportedStates(states=[_state("Texas", "Trump", TEXAS, "E2")]),
    ]
    progress, election_map, briefs, reads, evidence_urls = _chart_run(tmp_path, fakes, pages, answers)
    assert [state["code"] for state in election_map["states"]] == ["us-ga", "us-oh", "us-tx", "us-va"]
    assert {state["url"] for state in election_map["states"]} == {first, second}
    # The second round asks only for what is still missing.
    chart_briefs = [brief for brief in briefs if "still needs" in brief]
    needs = [brief.split("still needs:")[1] for brief in chart_briefs]
    assert "Ohio" in needs[0] and "Ohio" not in needs[1] and "Texas" in needs[1]
    # The chart's pages are never given to the judges.
    assert first not in evidence_urls and second not in evidence_urls
    assert any(event["task"] == "researching_chart" for event in progress)
    assert sum(event["task"] == "chart_sources" for event in progress) >= 2


def test_a_round_that_finds_nothing_does_not_end_the_search(tmp_path, fakes):
    pages = {"https://nytimes.com/a": OHIO, "https://bbc.com/b": GEORGIA, "https://cnn.com/c": VIRGINIA}
    _, _, briefs, reads, _ = _chart_run(tmp_path, fakes, pages, [ReportedStates(), ReportedStates(), ReportedStates()])
    assert len([brief for brief in briefs if "still needs" in brief]) == 3
    assert len(reads) == 3


def test_a_round_with_no_new_page_ends_the_search(tmp_path, fakes):
    pages = {"https://nytimes.com/a": OHIO}
    _, _, briefs, reads, _ = _chart_run(tmp_path, fakes, pages, [ReportedStates()])
    assert len(reads) == 1
    assert len([brief for brief in briefs if "still needs" in brief]) == 2


def test_chart_research_stops_at_its_round_limit(tmp_path, fakes):
    pages = {"https://nytimes.com/a": OHIO, "https://bbc.com/b": GEORGIA, "https://cnn.com/c": VIRGINIA, "https://apnews.com/d": TEXAS}
    answers = [ReportedStates(states=[_state(name, "Trump", quote, f"E{index}")]) for name, quote, index in (("Ohio", OHIO, 1), ("Georgia", GEORGIA, 2), ("Texas", TEXAS, 3))]
    settings = Settings(research_model="third/model", chart_research_rounds=2, election_map_min_states=1)
    _, election_map, briefs, _, _ = _chart_run(tmp_path, fakes, pages, answers, settings)
    assert len([brief for brief in briefs if "still needs" in brief]) == 2
    assert election_map is not None


def test_a_state_the_source_does_not_state_stays_off_the_chart_however_hard_it_searches(tmp_path, fakes):
    pages = {"https://nytimes.com/a": f"{OHIO} {GEORGIA} {VIRGINIA}"}
    invented = ReportedStates(states=[
        _state("Ohio", "Trump", OHIO, "E1"), _state("Georgia", "Trump", GEORGIA, "E1"), _state("Virginia", "Harris", VIRGINIA, "E1"),
        _state("Alaska", "Trump", "Trump won Alaska by a mile.", "E1"),
    ])
    _, election_map, _, _, _ = _chart_run(tmp_path, fakes, pages, [invented])
    assert "us-ak" not in [state["code"] for state in election_map["states"]]


def test_a_chart_only_searches_its_own_list_of_sources(tmp_path, fakes):
    asked = []
    settings = Settings(research_model="third/model")
    from concurrent.futures import ThreadPoolExecutor

    from app.charts.chart_research import make_chart_finder
    from app.pipeline.progress import NO_TASKS

    def search_hits(query, **options):
        asked.append(options)
        return [SearchHit(GOOD)]

    with ThreadPoolExecutor(1) as pool:
        finder = make_chart_finder(search_hits, _researcher("q"), fakes.fetch, settings, pool, None, None, "A claim.")
        finder("needs", 1, NO_TASKS)
    assert asked[0]["domains"] == CHART_DOMAINS["elections"]


def test_by_default_a_partial_chart_is_not_shown():
    assert Settings.model_fields["election_map_min_states"].default == 51
    assert Settings.model_fields["seat_chart_require_all_seats"].default is True
    from app.charts.seat_chart import complete_chart

    settings = Settings(seat_chart_require_all_seats=True)
    partial = {"total": 435, "parties": [{"seats": 220}]}
    whole = {"total": 435, "parties": [{"seats": 220}, {"seats": 215}]}
    assert complete_chart(partial, settings) is None
    assert complete_chart(whole, settings) == whole


def test_a_map_short_of_every_state_is_not_shown_and_the_screen_says_why(tmp_path, fakes):
    pages = {"https://nytimes.com/a": f"{OHIO} {GEORGIA} {VIRGINIA}"}
    answer = ReportedStates(states=[_state("Ohio", "Trump", OHIO, "E1"), _state("Georgia", "Trump", GEORGIA, "E1"), _state("Virginia", "Harris", VIRGINIA, "E1")])
    settings = Settings(research_model="third/model", election_map_min_states=51)
    progress, election_map, _, _, _ = _chart_run(tmp_path, fakes, pages, [answer], settings)
    assert election_map is None
    assert any("did not cover the whole chart" in (event.get("summary") or "") for event in progress)


RESULTS_PAGE = (
    "State Results Alabama Alaska Maine ### Donald J. Trump wins Ohio 17 electoral votes### Kamala Harris wins Maine 2 electoral votes"
    "Elissa Slotkin, a Democrat, wins election to the U.S. Senate in Michigan.### Donald J. Trump wins Nebraska’s First Congressional District 1 electoral vote"
    "### Donald J. Trump wins West Virginia 4 electoral votes"
)


def test_a_page_with_results_in_a_fixed_form_is_read_by_code():
    from app.charts.election_map import _verified_states, states_written_as_results
    from app.db.models import Source

    labels = {"E1": Source(url="https://nytimes.com/r", title="t", text=RESULTS_PAGE, publisher="NYT")}
    reports = states_written_as_results(labels)
    assert [(report.state, report.winner, report.detail) for report in reports] == [
        ("Ohio", "Donald J. Trump", "17 electoral votes"),
        ("Maine", "Kamala Harris", "2 electoral votes"),
        ("West Virginia", "Donald J. Trump", "4 electoral votes"),
    ]
    states = _verified_states(ReportedStates(states=reports), labels)
    assert [state["code"] for state in states] == ["us-me", "us-oh", "us-wv"]


def test_a_known_results_page_is_read_first_and_a_presidential_map_needs_no_model_reading(tmp_path, fakes):
    from concurrent.futures import ThreadPoolExecutor

    from app.charts.chart_research import make_chart_finder
    from app.pipeline.progress import NO_TASKS

    known = "https://www.nytimes.com/interactive/2024/results-president.html"
    read = []

    def fetch(url):
        read.append(url)
        return Page(url=url, title=url, text="words " * 100, publisher=url, published_at="2026-03-03")

    settings = Settings(research_model="third/model")
    def must_not_search(*args, **kwargs):
        raise AssertionError("A readable registered page should be tried before spending a search or research call.")

    with ThreadPoolExecutor(2) as pool:
        finder = make_chart_finder(
            must_not_search, must_not_search, fetch, settings, pool, TimeWindow("2024-11-05", "2025-06-30"),
            None, "A claim.", [known],
        )
        assert [page.url for page in finder("needs", 1, NO_TASKS)] == [known]
    assert read == [known]


def test_a_registered_chart_page_cannot_redirect_outside_its_profile():
    from concurrent.futures import ThreadPoolExecutor

    from app.charts.chart_research import make_chart_finder
    from app.pipeline.progress import NO_TASKS

    def fetch(url):
        return Page(url="https://bbc.com/other", title="Other country", text="words " * 100)

    with ThreadPoolExecutor(1) as pool:
        finder = make_chart_finder(_search(), _researcher("q", urls=()), fetch, Settings(), pool, None, None, "A claim.", [GOOD], ["reuters.com"])
        assert finder("needs", 1, NO_TASKS) == []


def test_every_known_results_page_is_on_a_green_source():
    from app.search.tavily import CHART_SOURCES, is_allowed_source

    for profile in CHART_SOURCES["countries"].values():
        for pages in profile["results"].values():
            assert pages and all(is_allowed_source(page) for page in pages)


def test_the_english_search_always_runs_and_counts_towards_the_limit():
    asked = []
    given = {}

    def search_hits(query, **options):
        asked.append(query)
        return [SearchHit(GOOD, title="Gold passes $2,000")]

    def research(model, system, user, schema, run_search, max_searches):
        given.update(user=user, max_searches=max_searches)
        return ResearchPicks(urls=[GOOD]), model

    found = research_sources("Giá vàng vượt 2.000 USD.", "brief", search_hits, research, Settings(), None, False, first_query="gold above $2,000")
    assert asked == ["gold above $2,000"]
    assert found.searches == 1
    assert given["max_searches"] == Settings().research_max_searches_per_claim - 1
    assert "gold above $2,000" in given["user"] and "Gold passes $2,000" in given["user"]


def test_a_vietnamese_claim_reads_the_right_passage_of_an_english_page(tmp_path, fakes):
    filler = "Markets in Asia were mixed on the day with little news about shares and bonds overall. " * 12
    fact = "Gold prices soared past US$2,000 an ounce for the first time on Aug 4 in New York trading. "
    page = f"{filler}\n\n{fact * 3}\n\n{filler}\n\n{filler}\n\n{filler}"
    fakes.fetch.text = page
    fakes.fetch.published_at = "2020-08-05"
    prompts = []
    complete = fakes.llm.complete

    def answer(model, system, user, schema, check=None):
        if schema is ExtractedClaims:
            claim = ExtractedClaim(
                text="Giá vàng vượt 2.000 USD mỗi ounce ngày 4/8/2020.", checkworthiness=0.9,
                search_query="giá vàng vượt 2.000 USD 4/8/2020", search_query_en="gold prices past US$2,000 an ounce first time Aug 4 2020",
            )
            return ExtractedClaims(claims=[claim]), model
        if schema is JudgeAnswer:
            prompts.append(user)
            return JudgeAnswer(verdict="insufficient_evidence", confidence=0.5, review="Unclear."), model
        return complete(model, system, user, schema, check)

    settings = Settings()
    engine = make_engine(f"sqlite:///{tmp_path}/reading.db")
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    with sessions() as session:
        check = Check(title="Check", input_type="text", input_text="Giá vàng.", judge_ids=settings.default_judge_ids)
        session.add(check)
        session.commit()
        check_id = check.id
    run_check(check_id, sessions, Providers(llm=SimpleNamespace(complete=answer), search=fakes.search, fetch=fakes.fetch), settings)
    assert prompts and "soared past US$2,000" in prompts[0]

from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from sqlalchemy.orm import sessionmaker

from claimtrace.config.settings import Settings
from claimtrace.core.pipeline.prompts import (
    ElectionMapRequest,
    ExternalResearchPicks,
    ExtractedClaim,
    ExtractedClaims,
    JudgeAnswer,
    MapPlace,
    ReportedState,
    ReportedStates,
    ResearchPicks,
)
from claimtrace.core.pipeline.research import research_sources
from claimtrace.core.pipeline.run import Providers, _retrieve, run_check
from claimtrace.core.providers.llm import TIMED_OUT, LLMError
from claimtrace.core.search.fetcher import Page
from claimtrace.core.search.tavily import CHART_DOMAINS, CHART_SOURCES, SearchError, SearchHit, TimeWindow, is_allowed_source
from claimtrace.db.models import Check, Claim, Source
from claimtrace.db.session import Base, make_engine

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


def test_research_can_choose_a_data_table_search_then_search_broadly():
    asked = []

    def research(model, system, user, schema, run_search, max_searches):
        run_search("ASEAN population by country", data_tables_only=True)
        run_search("ASEAN population comparison")
        return ResearchPicks(urls=[GOOD]), model

    research_sources("ASEAN population.", "brief", _search(asked=asked), research, Settings(), None, True)
    assert {"aseanstats.org", "population.un.org"} <= set(asked[0]["domains"])
    assert "domains" not in asked[1]


def test_a_failed_model_is_reported_and_nothing_is_chosen():
    def research(*args):
        raise LLMError("detail", TIMED_OUT)

    found = research_sources("A claim.", "brief", _search(), research, Settings(), None, True)
    assert found.hits is None
    assert found.llm_error == TIMED_OUT


def test_researched_source_priority_survives_publication_date_sorting():
    table = "https://data.worldbank.org/indicator/NY.GDP.MKTP.CD"
    search = SimpleNamespace(search_hits=_search(hits=[SearchHit(GOOD), SearchHit(table)]))

    def fetch(url):
        return Page(url=url, title=url, text="words " * 90, published_at="2026-10-10" if url == GOOD else None)

    providers = Providers(llm=SimpleNamespace(research=_researcher("GDP series", urls=(table, GOOD))),
                          search=search, fetch=fetch)
    with ThreadPoolExecutor(2) as pool:
        _, selected, failed = _retrieve(
            [Claim(id="c", position=1, text="Vietnam has a higher GDP than Malaysia.")],
            None, providers, Settings(), pool, briefs={"c": "brief"},
        )
    assert selected == {"c": [table, GOOD]}
    assert not failed


def test_a_public_profile_claim_searches_profile_publishers_with_the_full_name():
    text = "Alex Example lives in Miami."
    profile = "https://www.miaminewtimes.com/arts-culture/creator-profile"
    asked = []

    def search_hits(query, **options):
        asked.append((query, options))
        return [SearchHit(profile)]

    providers = Providers(
        llm=SimpleNamespace(research=_researcher(urls=(profile,))),
        search=SimpleNamespace(search_hits=search_hits),
        fetch=lambda url: Page(url=url, title="Profile", text=f"{text} " * 30),
    )
    with ThreadPoolExecutor(2) as pool:
        _, selected, failed = _retrieve(
            [Claim(id="c", position=1, text=text)], None, providers, Settings(), pool,
            briefs={"c": "brief"}, people={"c": "Alex Example"},
        )
    assert "Alex Example" in asked[0][0]
    assert {"miaminewtimes.com", "tubefilter.com", "gq.com"} <= set(asked[0][1]["domains"])
    assert selected == {"c": [profile]} and not failed


def test_apple_vietnam_store_page_precedes_press_coverage_for_a_current_list_price():
    store = "https://www.apple.com/vn/shop/buy-iphone/iphone-17"
    text = "Apple Store Việt Nam hiện niêm yết iPhone 17 bản 256 GB giá 28.999.000 đồng."

    def fetch(url):
        return Page(url=url, title="iPhone 17", text="256GB Đen 28.999.000đ\n" + "words " * 90)

    providers = Providers(llm=SimpleNamespace(research=_researcher(urls=(GOOD,))), search=SimpleNamespace(search_hits=_search()), fetch=fetch)
    with ThreadPoolExecutor(2) as pool:
        _, selected, failed = _retrieve(
            [Claim(id="c", position=1, text=text)], None, providers, Settings(), pool, briefs={"c": "brief"},
        )
    assert selected == {"c": [store, GOOD]} and not failed


@pytest.mark.parametrize("approved, external_readable", [(True, True), (False, True), (False, False)])
def test_discovery_runs_only_after_the_approved_search_and_requires_vetted_live_pages(approved, external_readable):
    from claimtrace.core.search.fetcher import FetchError

    local = "https://local-news.example/report"
    gossip = "https://pagesix.com/gossip"
    unvetted = "https://another-local.example/report"
    calls = []

    def discover_hits(query, **options):
        calls.append(query)
        return [SearchHit(url, raw_content="words " * 90) for url in (local, gossip, unvetted)]

    def research(model, system, user, schema, run_search, max_searches):
        if schema is ExternalResearchPicks:
            assert gossip not in user
            return ExternalResearchPicks(urls=[local, gossip, unvetted], publisher_basis={local: "Named reporter and original interview"}), model
        return ResearchPicks(urls=[GOOD] if approved else []), model

    def fetch(url):
        if url == local and not external_readable:
            raise FetchError("Blocked")
        return Page(url=url, title="Report", text="words " * 90)

    providers = Providers(
        llm=SimpleNamespace(research=research), search=SimpleNamespace(search_hits=_search(), discover_hits=discover_hits), fetch=fetch,
    )
    with ThreadPoolExecutor(2) as pool:
        _, selected, _ = _retrieve(
            [Claim(id="c", position=1, text="A factual claim.")], None, providers, Settings(), pool,
            briefs={"c": "brief"}, english_queries={"c": "test query"},
        )
    assert bool(calls) is not approved
    assert selected == {"c": [GOOD] if approved else [local] if external_readable else []}


def test_x_posts_are_checked_only_for_the_claims_registered_speaker(monkeypatch):
    exact = "https://x.com/NASA/status/1362900021386104838"
    clone = "https://x.com/NASA_Official/status/1362900021386104838"
    checked = []

    def read_x_post(url, handle, settings):
        checked.append((url, handle))
        return Page(url=url, title="NASA on X", text="A briefing will be held on Monday.")

    monkeypatch.setattr("claimtrace.core.pipeline.run.read_x_post", read_x_post)
    search = SimpleNamespace(search=lambda query: [], search_x_posts=lambda *args, **kwargs: [
        SearchHit(clone, x_handle="nasa"), SearchHit(exact, x_handle="nasa"),
    ])
    with ThreadPoolExecutor(2) as pool:
        _, selected, _ = _retrieve(
            [Claim(id="c", position=1, text="NASA announced a briefing.")], None,
            SimpleNamespace(search=search, fetch=lambda url: None), Settings(), pool,
        )
    assert checked == [(exact, "nasa")]
    assert selected == {"c": [exact]}


@pytest.mark.parametrize("month, expected", [(10, True), (9, False)])
def test_norway_registration_dashboard_is_kept_only_for_its_reported_period(month, expected):
    table = "https://ofv.no/statistikk"
    asked = []
    search = SimpleNamespace(search_hits=_search(hits=[SearchHit(GOOD)], asked=asked))

    def fetch(url):
        return Page(url=url, title="Statistikk | OFV", text=(
            "| Registreringer og eierskifter — personbiler | Hittil i år jan–okt 2026 |\n"
            "| Registreringstype | Antall |\n| Førstegangsregistrerte nye | 130 921 |\n"
            "| Fordeling av drivlinjer |\n| Drivlinje | Antall | Andel |\n| Elektrisitet | 128 362 | 98,0 % |\n"
            "Kilde: OFV Statistikk / Statens vegvesen. " * 10
        ))

    providers = Providers(llm=SimpleNamespace(research=_researcher(urls=())), search=search, fetch=fetch)
    text = f"Từ tháng 1 đến hết tháng {month}/2026, xe điện thuần chiếm 95,9% số ô tô con đăng ký mới ở Na Uy."
    with ThreadPoolExecutor(2) as pool:
        _, selected, failed = _retrieve(
            [Claim(id="c", position=1, text=text)], None, providers, Settings(), pool, briefs={"c": "brief"},
        )
    assert asked[0]["domains"] == ["ofv.no", "ssb.no"]
    assert selected == {"c": [table] if expected else []}
    assert not failed


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


@pytest.mark.parametrize("strict", [
    {"people": {"c": "Alex Example"}},
    {"windows": {"c": TimeWindow("2024-11-05")}},
])
def test_a_rejected_result_set_about_a_person_or_an_election_gets_no_backfill(fakes, strict):
    def must_not_backfill(*args, **kwargs):
        raise AssertionError("Researcher-rejected pages must not be brought back by a direct search.")

    search = SimpleNamespace(search_hits=_search(), search_more=must_not_backfill)
    providers = Providers(llm=SimpleNamespace(research=_researcher("q", urls=())), search=search, fetch=fakes.fetch)
    with ThreadPoolExecutor(2) as pool:
        pages, selected, failed = _retrieve(
            [Claim(id="c", position=1, text="Alex Example won a factual claim.")], None, providers, Settings(), pool,
            briefs={"c": "brief"}, **strict,
        )
    assert pages == {} and selected == {"c": []}
    assert not failed and not fakes.fetch.fetched


def test_a_general_claim_with_nothing_kept_searches_reference_sites_in_english(fakes):
    asked = []

    def search_more(query, exclude, **options):
        asked.append((query, exclude, options))
        return [SearchHit("https://www.britannica.com/science/boiling-point")]

    search = SimpleNamespace(search_hits=_search(), search_more=search_more)
    providers = Providers(llm=SimpleNamespace(research=_researcher("q", urls=())), search=search, fetch=fakes.fetch)
    settings = Settings()
    with ThreadPoolExecutor(2) as pool:
        pages, selected, failed = _retrieve(
            [Claim(id="c", position=1, text="Nước sôi ở 100 độ C ở mực nước biển.")], None, providers, settings, pool,
            queries={"c": "nhiệt độ sôi của nước"}, briefs={"c": "brief"}, english_queries={"c": "water boiling point sea level"},
        )
    assert asked == [("water boiling point sea level", [], {"newest_first": False, "domains": settings.reference_domains})]
    assert selected == {"c": ["https://www.britannica.com/science/boiling-point"]} and pages and not failed


def test_a_failed_reference_search_is_unavailable_not_insufficient_evidence(fakes):
    def search_more(query, exclude, **options):
        raise SearchError("The service is rate-limited.")

    search = SimpleNamespace(search_hits=_search(), search_more=search_more)
    providers = Providers(llm=SimpleNamespace(research=_researcher("q", urls=())), search=search, fetch=fakes.fetch)
    with ThreadPoolExecutor(2) as pool:
        _, _, failed = _retrieve(
            [Claim(id="c", position=1, text="A factual claim.")], None, providers, Settings(), pool, briefs={"c": "brief"},
        )
    assert failed == {"c"}


def test_every_reference_site_is_green_rated():
    assert all(is_allowed_source(f"https://{domain}/page") for domain in Settings().reference_domains)


def test_an_address_copied_with_another_scheme_or_slash_still_counts():
    hit = SearchHit("https://reuters.com/world/story")
    found = research_sources(
        "A claim.", "brief", _search(hits=[hit]), _researcher("q", urls=("http://www.reuters.com/world/story/",)), Settings(), None, True,
    )
    assert [item.url for item in found.hits] == [hit.url]
    assert found.picked_count == 1


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
    assert not any(event.get("actualModel") == "third/model" for event in progress if event["task"] != "reviewing")


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
    assert "final results for the states named in the claim" in prompts[0]
    assert "Available map options: election" in prompts[0]
    assert "2024-11-05" in prompts[0]


@pytest.mark.parametrize("choice", ["election", "location", "none"])
def test_the_search_model_can_choose_the_map_without_changing_evidence(tmp_path, fakes, choice):
    fakes.llm.claims = ["Trump carried Ohio in the 2024 US presidential election."]
    fakes.llm.election_map = ElectionMapRequest(office="president", year=2024)
    fakes.fetch.published_at = "2024-11-20"
    fakes.fetch.text = ("Trump carried Ohio in the final count. " + "words " * 90)
    fakes.llm.reported_states = ReportedStates(states=[
        ReportedState(evidence_id="E1", state="Ohio", winner="Trump", quote="Trump carried Ohio in the final count."),
    ])
    complete = fakes.llm.complete

    def add_location(model, system, user, schema, check=None):
        answer, used = complete(model, system, user, schema, check)
        if schema is ExtractedClaims:
            answer.claims[0].map_places = [MapPlace(name="Ohio", country="US")]
        return answer, used

    def research(model, system, user, schema, run_search, max_searches):
        assert "Available map options: location, election" in user
        run_search("Ohio 2024 certified results")
        return ResearchPicks(urls=[GOOD], map_choice=choice), model

    fakes.llm.complete = add_location
    status, progress, sources = _check(tmp_path, fakes, research)
    assert status == "completed"
    assert sources == [GOOD]
    sessions = sessionmaker(bind=make_engine(f"sqlite:///{tmp_path}/research.db"))
    with sessions() as session:
        claim = session.query(Claim).one()
        assert bool(claim.election_map) == (choice == "election")
        assert bool(claim.location_map) == (choice == "location")
    assert not any(event["task"] == "chart_sources" for event in progress)


CLAIM_2024 = "Trump won the 2024 US presidential election."
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

    from claimtrace.core.charts.chart_research import make_chart_finder
    from claimtrace.core.pipeline.progress import NO_TASKS

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
    from claimtrace.core.charts.seat_chart import complete_chart

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
    from claimtrace.core.charts.election_map import _verified_states, states_written_as_results
    from claimtrace.db.models import Source

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

    from claimtrace.core.charts.chart_research import make_chart_finder
    from claimtrace.core.pipeline.progress import NO_TASKS

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

    from claimtrace.core.charts.chart_research import make_chart_finder
    from claimtrace.core.pipeline.progress import NO_TASKS

    def fetch(url):
        return Page(url="https://bbc.com/other", title="Other country", text="words " * 100)

    with ThreadPoolExecutor(1) as pool:
        finder = make_chart_finder(_search(), _researcher("q", urls=()), fetch, Settings(), pool, None, None, "A claim.", [GOOD], ["reuters.com"])
        assert finder("needs", 1, NO_TASKS) == []


def test_every_known_results_page_is_on_a_green_source():
    from claimtrace.core.search.tavily import CHART_SOURCES, is_allowed_source

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

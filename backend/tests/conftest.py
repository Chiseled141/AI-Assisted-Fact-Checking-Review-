import os
import re

# SQLite in memory by default. TEST_DATABASE_URL runs the same tests on an empty PostgreSQL database, which they wipe.
os.environ.update(DATABASE_URL=os.environ.get("TEST_DATABASE_URL", "sqlite:///:memory:"), OPENROUTER_API_KEY="", TAVILY_API_KEY="", ELECTION_MAP_MIN_STATES="3", SEAT_CHART_REQUIRE_ALL_SEATS="false", DATA_SERVICE_RETRY_SECONDS="0")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.engine import make_url

from claimtrace.config.settings import get_settings
from claimtrace.core.charts.data_sources import MarketError
from claimtrace.core.charts.location_map import PLACES
from claimtrace.core.pipeline.prompts import (
    Citation,
    ClaimReview,
    ExtractedClaim,
    ExtractedClaims,
    FollowUpAnswer,
    IncidentLocations,
    JudgeAnswer,
    MapDetails,
    PriceEvent,
    ReportedElection,
    ReportedMatchResult,
    ReportedPrices,
    ReportedSeats,
    ReportedStates,
)
from claimtrace.core.pipeline.run import Providers, run_check
from claimtrace.core.search.fetcher import FetchError, Page
from claimtrace.core.search.tavily import SearchError
from claimtrace.db.session import Base, SessionLocal, engine
from claimtrace.main import app

ARTICLE = "The line opened to passengers on 6 November 2021 after a handover that morning. " * 8


class FakeLLM:
    """Answers by schema. `verdicts` sets each judge's verdict by model, and `failing` makes a model raise."""

    def __init__(self):
        self.claims = ["The line opened on 6 November 2021."]
        self.review_questions = []
        self.price_asset = None
        self.reported_prices = []
        self.map_places = []
        self.country_stat = None
        self.seat_chart = None
        self.reported_seats = None
        self.election_map = None
        self.reported_states = None
        self.reported_election = None
        self.match_result = None
        self.reported_match = None
        self.map_details = []
        self.incident_locations = []
        self.verdicts: dict[str, str] = {}
        self.failing: set[str] = set()
        self.calls: list[tuple[str, type]] = []
        self.prompts: list[tuple[type, str, str]] = []

    def followup(self, model, system, user, schema, run_search):
        answer, reported = self.complete(model, system, user, schema)
        return answer, reported, []

    def complete(self, model, system, user, schema, check=None):
        from claimtrace.core.providers.llm import LLMError

        self.calls.append((model, schema))
        self.prompts.append((schema, system, user))
        if model in self.failing:
            raise LLMError("down")
        if schema is ExtractedClaims:
            answer = ExtractedClaims(
                claims=[
                    ExtractedClaim(
                        text=text,
                        topic="the opening",
                        checkworthiness=0.9,
                        price_asset=self.price_asset,
                        map_places=self.map_places,
                        country_stat=self.country_stat,
                        seat_chart=self.seat_chart,
                        election_map=self.election_map,
                        match_result=self.match_result,
                        price_events=[PriceEvent(date="2024-12-05", title="Passed $100,000", text="It passed $100,000.")]
                        if self.price_asset
                        else [],
                    )
                    for text in self.claims
                ]
            )
        elif schema is ClaimReview:
            answer = ClaimReview(questions=self.review_questions)
        elif schema is ReportedSeats:
            answer = self.reported_seats or ReportedSeats()
        elif schema is ReportedElection:
            answer = self.reported_election or ReportedElection()
        elif schema is ReportedStates:
            answer = self.reported_states or ReportedStates()
        elif schema is ReportedMatchResult:
            answer = self.reported_match or ReportedMatchResult()
        elif schema is MapDetails:
            answer = MapDetails(details=self.map_details)
        elif schema is IncidentLocations:
            answer = IncidentLocations(locations=self.incident_locations)
        elif schema is ReportedPrices:
            answer = ReportedPrices(prices=self.reported_prices)
        elif schema is FollowUpAnswer:
            answer = FollowUpAnswer(answer=f"Answered by {model} from the saved sources.")
        elif schema is JudgeAnswer:
            verdict = self.verdicts.get(model, "supported")
            passages = re.findall(r'<passage evidence_id="(E\d+)"[^>]*>\n(.*?)\n</passage>', user, re.S)
            citations = [
                Citation(
                    evidence_id=key,
                    relation={"supported": "supporting", "contradicted": "contradicting", "outdated": "supporting"}
                    .get(verdict, "contextual") if index == 0 else "contextual",
                    quote="opened to passengers" if "opened to passengers" in passage else " ".join(passage.split()[:8]),
                    freshness="current",
                )
                for index, (key, passage) in enumerate(passages)
            ]
            if not citations and (data := re.search(r'<data evidence_id="D1"[^>]*>\n(.*?)\n</data>', user, re.S)):
                citations.append(Citation(evidence_id="D1", relation="supporting", quote=data[1].splitlines()[-1]))
            answer = JudgeAnswer(verdict=verdict, confidence=0.8, review=f"Review by {model}.", citations=citations)
        else:
            raise AssertionError(f"Unexpected model task: {schema.__name__}")
        if check:
            check(answer)
        return answer, model


class FakeSearch:
    def __init__(self):
        self.results: list[str] = ["https://reuters.com/a", "https://bbc.com/b"]
        self.fails = False

    def search(self, query):
        if self.fails:
            raise SearchError("down")
        return self.results


class FakeFetch:
    def __init__(self):
        self.unreadable: set[str] = set()
        self.fetched: list[str] = []
        self.text = ARTICLE
        self.published_at = "2021-11-06"

    def __call__(self, url):
        self.fetched.append(url)
        if url in self.unreadable:
            raise FetchError("No article text could be read from this page.")
        return Page(url=url, title=f"Title of {url}", text=self.text, publisher="Example News", published_at=self.published_at)


class FakeMarket:
    def __init__(self, name="Yahoo Finance"):
        self.name = name
        self.fails = False
        self.calls: list[str] = []

    def daily_closes(self, symbol, start, end):
        self.calls.append(symbol)
        if self.fails:
            raise MarketError("down")
        return [[1733356800000, 98000.5], [1733443200000, 101000.25]]


def fake_country_rows():
    """Enough countries to draw a map, with two real-looking values for the tests to read."""
    rows = {iso3: {2022: 1_000_000.0, 2023: 1_100_000.0, 2024: 1_200_000.0} for iso3 in list(PLACES["iso3"].values())[:40]}
    rows.update(
        VNM={2022: 99_000_000.0, 2023: 100_000_000.0, 2024: 101_000_000.0},
        IND={2023: 1_438_000_000.0, 2024: 1_450_000_000.0},
        CHN={2023: 1_410_000_000.0, 2024: 1_408_000_000.0},
        WLD={2023: 8_000_000_000.0, 2024: 8_100_000_000.0},
    )
    return rows


class FakeCountryData:
    name = "Test country data"

    def __init__(self):
        self.asked = []

    def by_country(self, indicator, start, end):
        self.asked.append(indicator)
        return fake_country_rows()


class FakeStateData:
    name = "Test state data"

    def __init__(self):
        self.calls = 0

    def population_by_state(self):
        self.calls += 1
        rows = {name: {2023: 1_000_000.0, 2024: 1_100_000.0} for name in PLACES["us_states"].values()}
        rows["California"] = {2023: 39_000_000.0, 2024: 39_200_000.0}
        return rows


class Fakes:
    def __init__(self):
        self.state_data = FakeStateData()
        self.country_data = FakeCountryData()
        self.market = FakeMarket()
        self.llm = FakeLLM()
        self.search = FakeSearch()
        self.fetch = FakeFetch()


@pytest.fixture
def fakes():
    return Fakes()


@pytest.fixture
def client(fakes, monkeypatch):
    # An app import before pytest starts can leave the engine bound to the local app database.
    if engine.url != make_url(os.environ["DATABASE_URL"]):
        pytest.fail("Refusing to reset tables: the app engine was initialized before the test database was configured.")

    # Tests never touch the network, so every host counts as public unless a test says otherwise.
    monkeypatch.setattr("claimtrace.core.search.fetcher._is_public", lambda host: True)
    from claimtrace.api.auth import _failed
    from claimtrace.api.checks import _recent_checks
    from claimtrace.api.provider import _keys

    _recent_checks.clear()
    _failed.clear()
    _keys.clear()
    # Starting the app below applies the real migrations to an empty database.
    Base.metadata.drop_all(engine)
    with engine.begin() as connection:
        connection.execute(text("DROP TABLE IF EXISTS alembic_version"))
    providers = Providers(
        llm=fakes.llm,
        search=fakes.search,
        fetch=fakes.fetch,
        market=fakes.market,
        country_data=fakes.country_data,
        state_data=fakes.state_data,
    )
    app.state.start_check = lambda check_id: run_check(check_id, SessionLocal, providers, get_settings())
    app.state.llm = fakes.llm
    app.state.followup_search = fakes.search
    app.state.followup_fetch = fakes.fetch
    with TestClient(app) as test_client:
        # Every route that reads or writes checks needs an account, so the shared client is signed in.
        test_client.user_id = sign_up(test_client, "tester")["id"]
        yield test_client


PASSWORD = "correct horse battery"


def sign_up(test_client, username, password=PASSWORD):
    response = test_client.post(
        "/api/auth/register", json={"username": username, "password": password, "passwordConfirmation": password}
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture
def other_client(client):
    """A second browser, signed in as someone else, on the same app and database."""
    other = TestClient(app)
    other.user_id = sign_up(other, "someone-else")["id"]
    return other

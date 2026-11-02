import os

os.environ.update(
    DATABASE_URL="sqlite:///:memory:", OPENROUTER_API_KEY="", TAVILY_API_KEY="", GOOGLE_FACTCHECK_API_KEY=""
)

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.config import get_settings
from app.db.session import Base, SessionLocal, engine
from app.main import app
from app.pipeline.prompts import (
    Citation,
    ExtractedClaim,
    ExtractedClaims,
    JudgeAnswer,
    SourceAnswer,
    SourceRatings,
)
from app.pipeline.run import Providers, run_check
from app.providers.fetcher import FetchError, Page
from app.providers.search import SearchError

ARTICLE = "The line opened to passengers on 6 November 2021 after a handover that morning. " * 8


class FakeLLM:
    """Answers by schema. `verdicts` sets each judge's verdict by model, and `failing` makes a model raise."""

    def __init__(self):
        self.claims = ["The line opened on 6 November 2021."]
        self.verdicts: dict[str, str] = {}
        self.failing: set[str] = set()
        self.calls: list[tuple[str, type]] = []
        self.prompts: list[tuple[type, str, str]] = []

    def complete(self, model, system, user, schema, check=None):
        from app.providers.llm import LLMError

        self.calls.append((model, schema))
        self.prompts.append((schema, system, user))
        if model in self.failing:
            raise LLMError("down")
        if schema is ExtractedClaims:
            answer = ExtractedClaims(
                claims=[ExtractedClaim(text=text, topic="the opening", checkworthiness=0.9) for text in self.claims]
            )
        elif schema is JudgeAnswer:
            verdict = self.verdicts.get(model, "supported")
            citations = (
                []
                if verdict == "insufficient_evidence"
                else [Citation(evidence_id="E1", relation="supporting", quote="opened to passengers", freshness="current")]
            )
            answer = JudgeAnswer(verdict=verdict, confidence=0.8, review=f"Review by {model}.", citations=citations)
        else:
            answer = SourceAnswer(
                summary="It reports the opening.",
                key_points=["It opened in November."],
                assessment="A dated report.",
                note=f"Note by {model}.",
                ratings=SourceRatings(match=90, directness=80, timing=70, detail=60),
            )
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


class FakeFactChecks:
    def __init__(self):
        self.match = None

    def lookup(self, claim):
        return self.match


class FakeFetch:
    def __init__(self):
        self.unreadable: set[str] = set()
        self.fetched: list[str] = []

    def __call__(self, url):
        self.fetched.append(url)
        if url in self.unreadable:
            raise FetchError("No article text could be read from this page.")
        return Page(url=url, title=f"Title of {url}", text=ARTICLE, publisher="Example News", published_at="2021-11-06")


class Fakes:
    def __init__(self):
        self.llm = FakeLLM()
        self.search = FakeSearch()
        self.fact_checks = FakeFactChecks()
        self.fetch = FakeFetch()


@pytest.fixture
def fakes():
    return Fakes()


@pytest.fixture
def client(fakes, monkeypatch):
    # Tests never touch the network, so every host counts as public unless a test says otherwise.
    monkeypatch.setattr("app.providers.fetcher._is_public", lambda host: True)
    from app.api.checks import _recent_checks

    _recent_checks.clear()
    # Starting the app below applies the real migrations to an empty database.
    Base.metadata.drop_all(engine)
    with engine.begin() as connection:
        connection.execute(text("DROP TABLE IF EXISTS alembic_version"))
    providers = Providers(llm=fakes.llm, search=fakes.search, fact_checks=fakes.fact_checks, fetch=fakes.fetch)
    app.state.start_check = lambda check_id: run_check(check_id, SessionLocal, providers, get_settings())
    with TestClient(app) as test_client:
        yield test_client

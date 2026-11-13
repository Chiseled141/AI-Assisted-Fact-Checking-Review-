from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from claimtrace.config.settings import Settings, get_settings
from claimtrace.core.charts.data_sources import DataUsa, WorldBankData, YahooMarketData
from claimtrace.core.pipeline.progress import closed_tasks
from claimtrace.core.pipeline.run import FINISHED, Providers, run_check
from claimtrace.core.providers.llm import OpenRouterLLM
from claimtrace.core.search.fetcher import fetch_page
from claimtrace.core.search.tavily import TavilySearch
from claimtrace.db.migrate import run_migrations
from claimtrace.db.models import Check
from claimtrace.db.session import SessionLocal, engine

from .api import router

RESTARTED = "The server restarted while this check was running."


def make_providers(settings: Settings) -> Providers | None:
    if not settings.openrouter_api_key or not settings.tavily_api_key:
        return None
    return Providers(
        llm=OpenRouterLLM(settings),
        search=TavilySearch(settings),
        fetch=lambda url: fetch_page(url, settings),
        market=YahooMarketData(settings),
        country_data=WorldBankData(settings),
        state_data=DataUsa(settings),
    )


def make_starter(providers: Providers | None):
    """Without its keys the API still serves saved checks; it just can't start new ones."""
    if providers is None:
        return None
    return lambda check_id: run_check(check_id, SessionLocal, providers, get_settings())


@asynccontextmanager
async def lifespan(_: FastAPI):
    run_migrations(engine)
    # Checks run inside this process, so any still running died with the last one.
    with SessionLocal() as session:
        # A check waiting for the reader has nothing running, and is saved in full, so it can go on waiting.
        for check in session.scalars(select(Check).where(Check.status.not_in([*FINISHED, "awaiting_input"]))):
            check.status = "failed"
            check.error_message = RESTARTED
            check.progress = closed_tasks(check.progress, RESTARTED)
        session.commit()
    yield


app = FastAPI(title="ClaimTrace API", version="0.1.0", lifespan=lifespan)
_providers = make_providers(get_settings())
app.state.start_check = make_starter(_providers)
# Follow-up questions use the same model client as checks, and are off without keys too.
app.state.llm = _providers.llm if _providers else None
app.state.followup_search = _providers.search if _providers else None
app.state.followup_fetch = _providers.fetch if _providers else None
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_credentials=True,  # The session cookie, when the frontend is served from another origin.
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)

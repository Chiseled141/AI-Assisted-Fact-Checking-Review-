from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import update

from .api import router
from .core.config import Settings, get_settings
from .db.migrate import run_migrations
from .db.models import Check
from .db.session import SessionLocal, engine
from .pipeline.run import Providers, run_check
from .providers.cache import CachedFactChecks, make_cache
from .providers.fetcher import fetch_page
from .providers.llm import OpenRouterLLM
from .providers.search import GoogleFactChecks, TavilySearch


def make_providers(settings: Settings) -> Providers | None:
    if not settings.openrouter_api_key or not settings.tavily_api_key:
        return None
    return Providers(
        llm=OpenRouterLLM(settings),
        search=TavilySearch(settings),
        fact_checks=CachedFactChecks(GoogleFactChecks(settings), make_cache(settings), settings.fact_check_cache_seconds),
        fetch=lambda url: fetch_page(url, settings),
    )


def make_starter():
    """Without its keys the API still serves saved checks; it just can't start new ones."""
    settings = get_settings()
    providers = make_providers(settings)
    if providers is None:
        return None
    return lambda check_id: run_check(check_id, SessionLocal, providers, settings)


@asynccontextmanager
async def lifespan(_: FastAPI):
    run_migrations(engine)
    # Checks run inside this process, so any still running died with the last one.
    with SessionLocal() as session:
        session.execute(
            update(Check)
            .where(Check.status.not_in(["completed", "failed"]))
            .values(status="failed", error_message="The server restarted while this check was running.")
        )
        session.commit()
    yield


app = FastAPI(title="ClaimTrace API", version="0.1.0", lifespan=lifespan)
app.state.start_check = make_starter()
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)

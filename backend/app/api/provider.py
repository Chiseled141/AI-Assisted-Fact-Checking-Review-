"""Per-account OpenAI-compatible endpoints. Credentials live in this process only, never in database rows."""

from threading import Lock
from time import monotonic
from urllib.parse import urlsplit

from fastapi import HTTPException

from config.settings import JudgeOption, Settings
from database.session import SessionLocal
from harness.charts.data_sources import DataUsa, WorldBankData, YahooMarketData
from harness.pipeline.run import Providers, run_check
from harness.providers.llm import OpenRouterLLM
from harness.search.fetcher import FetchError, check_url_allowed, fetch_page
from harness.search.tavily import TavilySearch

from .schemas import ApiProvider

_keys: dict[str, tuple[str, str, float]] = {}
_lock = Lock()
KEY_TTL = 30 * 86400
KEY_REQUIRED = "Re-enter your custom API key in Settings to use this endpoint."


def saved_key(user_id: str, base_url: str) -> str | None:
    with _lock:
        entry = _keys.get(user_id)
        if entry and monotonic() - entry[2] >= KEY_TTL:
            _keys.pop(user_id, None)
            entry = None
        return entry[1] if entry and entry[0] == base_url else None


def keep_key(user_id: str, base_url: str, key: str) -> None:
    with _lock:
        now = monotonic()
        for expired in [owner for owner, entry in _keys.items() if now - entry[2] >= KEY_TTL]:
            _keys.pop(expired, None)
        _keys[user_id] = (base_url, key, now)


def forget_key(user_id: str) -> None:
    with _lock:
        _keys.pop(user_id, None)


def validate_endpoint(config: ApiProvider) -> None:
    try:
        parts = urlsplit(config.base_url)
        if parts.scheme != "https" or parts.query or parts.fragment:
            raise ValueError
        check_url_allowed(config.base_url)
    except (ValueError, FetchError):
        raise HTTPException(422, "Enter a public HTTPS API base URL without a query or fragment.") from None


def provider_settings(config: dict, settings: Settings) -> Settings:
    option = ApiProvider(**config)
    judges = {
        f"custom-judge-{index}": JudgeOption(name=model, model=model, supports_json_mode=option.supports_json_mode)
        for index, model in enumerate(option.judge_models, 1)
    }
    # Include the shared model in prompt-only JSON mode when the endpoint doesn't implement response_format.
    if not option.supports_json_mode:
        judges["custom-model"] = JudgeOption(name=option.model, model=option.model, supports_json_mode=False)
    return settings.model_copy(update={
        "extraction_model": option.model, "research_model": option.model, "followup_model": option.model,
        "judges": judges, "default_judge_ids": ["custom-judge-1", "custom-judge-2"],
    })


def custom_llm(user_id: str, config: dict, settings: Settings) -> OpenRouterLLM:
    option = ApiProvider(**config)
    validate_endpoint(option)
    key = saved_key(user_id, option.base_url)
    if not key:
        raise HTTPException(503, KEY_REQUIRED)
    return OpenRouterLLM(provider_settings(config, settings), base_url=option.base_url, api_key=key)


def custom_starter(user_id: str, config: dict, settings: Settings):
    if not settings.tavily_api_key:
        raise HTTPException(503, "The server is missing its Tavily API key, so it can’t run checks yet.")
    option = ApiProvider(**config)
    validate_endpoint(option)
    key = saved_key(user_id, option.base_url)
    if not key:
        raise HTTPException(503, KEY_REQUIRED)
    scoped = provider_settings(config, settings)

    def start(check_id: str):
        llm = OpenRouterLLM(scoped, base_url=option.base_url, api_key=key)
        try:
            providers = Providers(
                llm=llm, search=TavilySearch(scoped), fetch=lambda url: fetch_page(url, scoped),
                market=YahooMarketData(scoped), country_data=WorldBankData(scoped), state_data=DataUsa(scoped),
            )
            run_check(check_id, SessionLocal, providers, scoped)
        finally:
            llm.client.close()

    return start

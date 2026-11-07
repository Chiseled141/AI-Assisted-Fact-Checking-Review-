"""All backend settings. Limits and timeouts live here; model IDs in `config/models.toml`, never in pipeline code.

Every field can be overridden by an environment variable or `backend/.env` under its upper-case name.

Sections, in order:
    1. Models           read from `config/models.toml`: which model does which job, and the judge list
    2. Keys and storage API keys, database, CORS
    3. Input limits     what a user can submit, and how often
    4. Evidence         Tavily search and page reading, per claim and per check
    5. Charts and maps  one block per visual, each with its own name prefix

Backend and frontend copies to keep in step:
    judge IDs and names     `frontend/src/config.ts`
    green source list       `config/data/source_ratings.json` and `frontend/src/data/sourceRegistry.ts`
"""

import json
import tomllib
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict

# Files you edit without touching code: `models.toml`, `prompts/` and `data/`. Each opens with a note saying what it is for.
CONFIG_DIR = Path(__file__).resolve().parents[2] / "config"
PROMPTS_DIR = CONFIG_DIR / "prompts"
DATA_DIR = CONFIG_DIR / "data"


def load_data(name: str) -> dict:
    """A JSON file in `config/data/`, without its `_about` note."""
    data = json.loads((DATA_DIR / name).read_text(encoding="utf-8"))
    data.pop("_about", None)
    return data

# ---------------------------------------------------------------------------------------------------------------------
# 1. Models, read from `config/models.toml`
# ---------------------------------------------------------------------------------------------------------------------


class JudgeOption(BaseModel):
    name: str
    model: str
    supports_json_mode: bool = True


MODELS = tomllib.loads((CONFIG_DIR / "models.toml").read_text(encoding="utf-8"))
DEFAULT_JUDGES = {key: JudgeOption(**option) for key, option in MODELS["judges"].items()}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=CONFIG_DIR.parent / ".env", extra="ignore")

    # --- 1. Models. Edit `config/models.toml`, or override one here through `.env`. ---------------------------------
    extraction_model: str = MODELS["roles"]["extraction"]
    research_model: str = MODELS["roles"]["research"]
    judges: dict[str, JudgeOption] = DEFAULT_JUDGES
    default_judge_ids: list[str] = MODELS["roles"]["default_judges"]
    prompt_version: str = "v25"  # Bump when any file in `config/prompts/` changes. Each verdict records it.
    llm_timeout_seconds: float = MODELS["openrouter"]["timeout_seconds"]

    # --- 2. Keys and storage ------------------------------------------------------------------------------------------
    openrouter_api_key: str = ""
    openrouter_base_url: str = MODELS["openrouter"]["base_url"]
    tavily_api_key: str = ""

    # The local SQLite file sits with the rest of the database code, wherever the server is started from.
    database_url: str = f"sqlite:///{CONFIG_DIR.parent / 'app' / 'db' / 'claimtrace.db'}"
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ]

    # --- 3. Input limits ----------------------------------------------------------------------------------------------
    max_text_length: int = 5000
    max_url_length: int = 2048
    max_files: int = 3
    max_file_bytes: int = 200 * 1024
    max_claims_per_check: int = 5
    question_max_chars: int = 300  # Longer input with no claims is an article, not a question, so no model is asked.
    # Each check spends API credit, so one address can't start endless checks. 0 turns this off.
    max_checks_per_hour: int = 30

    # Human corrections.
    min_correction_reason: int = 10
    max_correction_reason: int = 1000
    max_attachments: int = 3
    max_attachment_chars: int = 900_000

    # --- 4. Evidence: Tavily search, then page reading ------------------------------------------------------------------
    # Tavily only ever searches the green-rated domains in `config/data/source_ratings.json`.
    tavily_timeout_seconds: float = 20
    tavily_candidates_per_search: int = 20  # Tavily's own maximum.
    tavily_max_searches_per_claim: int = 2  # Only when research fails: a search, then one excluding publishers returned.
    research_max_searches_per_claim: int = 3  # What `research_model` may spend on one claim.
    research_max_picks: int = 8  # More than the target, because some pages turn out unreadable.
    research_timeout_seconds: float = 90  # It reads far more than a judge does, so it gets longer than `llm_timeout_seconds`.

    target_publishers_per_claim: int = 5  # Different publishers. A short result set stays short.
    max_sources_per_check: int = 10
    max_page_reads_per_check: int = 30
    passages_per_source: int = 3  # What each judge reads from one source.
    min_source_words: int = 80  # Less is usually a paywall or a loading error, which shouldn't use up a source's place.

    fetch_timeout_seconds: float = 10
    fetch_max_bytes: int = 2 * 1024 * 1024
    fetch_max_redirects: int = 3
    max_parallel_calls: int = 6

    # --- 5. Charts and maps. A failure in any of these only costs the visual, never the verdict. -----------------------
    # Passages per source for `research_model` on a location map. Figures often sit further from the claim's words.
    location_map_passages_per_source: int = 6

    # Election charts look for their own sources, separately from the judges', until they are complete or these run out.
    # A round is the research model searching and choosing, then reading what it chose. The worst case for one election
    # is rounds x searches in Tavily credits.
    chart_research_rounds: int = 3
    chart_research_searches_per_round: int = 2
    chart_research_pages_per_round: int = 4
    chart_research_max_chars_per_source: int = 40_000  # A national results table can be long.

    # Parliament chart.
    seat_chart_require_all_seats: bool = True  # A chart whose parties don't add up to the chamber is not shown.

    # US election map.
    election_map_min_states: int = 51  # Every state and DC. A partial map is not shown.

    # Data services for charts: Yahoo Finance, World Bank and Data USA. A second try only after a temporary failure.
    data_service_attempts: int = 2
    data_service_retry_seconds: float = 2

    # Price chart, world assets. Prices from Yahoo Finance (`charts/data_sources.py`).
    price_chart_timeout_seconds: float = 10
    price_chart_days_before: int = 730
    price_chart_max_events: int = 3

    # Price chart, SJC gold. Prices read from news. One Tavily search per month, so these two set what a chart costs.
    sjc_chart_search_months: int = 6
    sjc_election_dates_per_month: int = 2

    # Location map. Figures beside it are read from the claim's sources.
    location_map_max_places: int = 8
    location_map_max_details: int = 8
    location_map_max_detail_label: int = 60

    # Heatmap. Values from Open-Meteo (`charts/data_sources.py`).
    heat_map_timeout_seconds: float = 30
    heat_map_attempts: int = 3
    heat_map_retry_seconds: float = 20
    # Grid spacing in degrees. Open-Meteo's free allowance counts every point on every day, at 600 a minute
    # and 10,000 a day, so a world map costs about 500 and can't be much finer. Highcharts also needs 90 to divide
    # evenly by the step, or it draws rows half a row out of place.
    heat_map_step_world: float = 18
    heat_map_step_area: float = 1.5
    heat_map_sample_days: int = 3
    # Open-Meteo refuses long addresses and slows down on big requests, so a grid goes in parts.
    heat_map_points_per_request: int = 50
    heat_map_max_days: int = 31
    heat_map_delay_days: int = 7  # Climate data arrives about a week late.
    heat_map_min_coverage: float = 0.6

    # Country map. Values from the World Bank (`charts/data_sources.py`).
    country_map_timeout_seconds: float = 40
    country_map_years: int = 20
    country_map_min_countries: int = 20

    # US state map. Population from Data USA (`charts/data_sources.py`).
    state_map_timeout_seconds: float = 30
    state_map_min_states: int = 40

    def model_display_name(self, model: str) -> str:
        """The judge list's name for a model ID, or the ID itself when it isn't on the list."""
        return next((option.name for option in self.judges.values() if option.model == model), model)


@lru_cache
def get_settings() -> Settings:
    return Settings()

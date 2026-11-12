"""All backend settings. Limits and timeouts live here; model IDs in `config/models.toml`, never in pipeline code.

Every field can be overridden by an environment variable or the `.env` at the top of the repository, under its upper-case name.

Sections, in order:
    1. Models           read from `config/models.toml`: which model does which job; the judge list is in `config/data/judges.json`
    2. Keys and storage API keys, database, CORS
    3. Input limits     what a user can submit, and how often
    4. Evidence         Tavily search and page reading, per claim and per check
    5. Charts and maps  one block per visual, each with its own name prefix

Lists the frontend reads too, so there is one copy of each:
    judges                  `config/data/judges.json`
    source ratings          `config/data/source_ratings.json`
"""

import json
import tomllib
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Files you edit without touching code: `models.toml` and `data/` here, and the prompts in `harness/prompts/`.
# Each opens with a note saying what it is for.
CONFIG_DIR = Path(__file__).resolve().parent
PROMPTS_DIR = CONFIG_DIR.parent / "harness" / "prompts"
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
# The judge list is shared with the frontend, which also reads how each one is shown.
JUDGES = load_data("judges.json")
DEFAULT_JUDGES = {key: JudgeOption(**option) for key, option in JUDGES["options"].items()}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=CONFIG_DIR.parents[1] / ".env", extra="ignore")

    # --- 1. Models. Edit `config/models.toml`, or override one here through `.env`. ---------------------------------
    extraction_model: str = MODELS["roles"]["extraction"]
    research_model: str = MODELS["roles"]["research"]
    followup_model: str = MODELS["roles"]["followup"]
    judges: dict[str, JudgeOption] = DEFAULT_JUDGES
    default_judge_ids: list[str] = JUDGES["default"]
    prompt_version: str = "v60"  # Bump when any file in `harness/prompts/` changes. Each verdict records it.
    llm_timeout_seconds: float = MODELS["openrouter"]["timeout_seconds"]

    # --- 2. Keys and storage ------------------------------------------------------------------------------------------
    openrouter_api_key: str = ""
    openrouter_base_url: str = MODELS["openrouter"]["base_url"]
    tavily_api_key: str = ""

    # PostgreSQL. Tests use SQLite in memory.
    database_url: str = "postgresql+psycopg://claimtrace@localhost:5432/claimtrace"
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
    review_input_chars: int = 6000  # How much of the source text the claim review reads.
    max_review_questions: int = 3  # More than this and the reader may as well start again.
    # Each check spends API credit, so one address can't start endless checks. 0 turns this off.
    max_checks_per_hour: int = 30

    # Accounts: a username and a password, kept signed in by an HttpOnly cookie.
    username_min_length: int = 3
    username_max_length: int = 32
    password_min_length: int = 8
    password_max_length: int = 128
    session_days: int = 30
    session_cookie_name: str = "claimtrace_session"
    session_cookie_secure: bool = False  # Turn on when the site is served over HTTPS.
    max_login_attempts_per_hour: int = 20  # Per address, counting failed logins and sign-ups. 0 turns this off.

    # Follow-up questions about a finished check. Each one is a paid model call.
    max_followups_per_check: int = 10
    max_followup_length: int = 1000

    # Human corrections.
    min_correction_reason: int = 10
    max_correction_reason: int = 1000
    max_attachments: int = 3
    max_attachment_chars: int = 900_000

    # --- 4. Evidence: Tavily search, then page reading ------------------------------------------------------------------
    # Tavily starts with the green-rated domains in `config/data/source_ratings.json`.
    tavily_timeout_seconds: float = 20
    tavily_candidates_per_search: int = 20  # Tavily's own maximum.
    tavily_max_searches_per_claim: int = 2  # When research fails or keeps nothing: a search, then one more.
    # Where that one more search looks when research kept nothing. News rarely covers general knowledge. Must be green-rated.
    reference_domains: list[str] = [
        "britannica.com", "nasa.gov", "noaa.gov", "usgs.gov", "nih.gov", "who.int", "cdc.gov", "nature.com", "science.org",
    ]
    search_depth: Literal["basic", "advanced"] = "basic"  # Advanced reads deeper and costs twice the Tavily credit.
    blocked_domains: list[str] = []  # Never used as a source, on top of what `source_ratings.json` excludes.
    research_max_searches_per_claim: int = 5  # Includes the first query supplied by the server.
    external_research_max_searches: int = Field(default=2, ge=0, le=3)  # Only after the approved search yields no usable page.
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

    # Charts can look for sources separately from the judges. Pie and bar charts use at most one fallback round.
    # A round is the research model searching and choosing, then reading what it chose.
    chart_research_rounds: int = 3
    chart_research_searches_per_round: int = 2
    chart_research_pages_per_round: int = 4
    chart_research_max_chars_per_source: int = 40_000  # A national results table can be long.

    # Parliament chart.
    seat_chart_require_all_seats: bool = True  # A chart whose parties don't add up to the chamber is not shown.

    # US election map.
    election_map_min_states: int = 51  # Nationwide presidential maps require every state and DC by default.

    # Data services for charts: Yahoo Finance, World Bank and Data USA. A second try only after a temporary failure.
    data_service_attempts: int = 2
    data_service_retry_seconds: float = 2

    # Price chart, world assets. Prices from Yahoo Finance (`charts/data_sources.py`).
    price_chart_timeout_seconds: float = 10
    price_chart_days_before: int = 730
    price_chart_max_events: int = 3
    price_chart_rate_tolerance: float = 0.015  # How far an exchange rate may sit from the days around it.

    # Price chart, SJC gold. Prices read from news. One Tavily search per month, so these two set what a chart costs.
    sjc_chart_search_months: int = 6
    sjc_election_dates_per_month: int = 2

    # Location map. Figures beside it are read from the claim's sources.
    location_map_max_places: int = 8
    location_map_max_details: int = 8
    location_map_max_detail_label: int = 60

    # Street locations come from OpenStreetMap through Photon (roads) and Overpass (junctions).
    incident_map_photon_url: str = "https://photon.komoot.io/api/"
    incident_map_overpass_url: str = "https://overpass-api.de/api/interpreter"
    incident_map_timeout_seconds: float = 5

    # Country map. Values from the World Bank (`charts/data_sources.py`).
    country_map_timeout_seconds: float = 40
    country_map_years: int = 20
    country_map_min_countries: int = 20
    population_pyramid_years_back: int = 3  # How far back to look when the latest figures are missing.

    # US state map. Population from Data USA (`charts/data_sources.py`).
    state_map_timeout_seconds: float = 30
    state_map_min_states: int = 40

    def model_display_name(self, model: str) -> str:
        """The judge list's name for a model ID, or the ID itself when it isn't on the list."""
        return next((option.name for option in self.judges.values() if option.model == model), model)


@lru_cache
def get_settings() -> Settings:
    return Settings()

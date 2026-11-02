"""Settings. Model IDs and limits live here, not in the pipeline code."""

from functools import lru_cache

from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict


class JudgeOption(BaseModel):
    name: str
    model: str


# Keys match `config.judges.options` in the frontend. IDs checked against OpenRouter's model list on 2026-11-02.
DEFAULT_JUDGES = {
    "claude-haiku": JudgeOption(name="Claude Haiku 5.5", model="anthropic/claude-haiku-5.5"),
    "deepseek-flash": JudgeOption(name="DeepSeek Flash V4.1", model="deepseek/deepseek-v4.1-flash"),
    "gpt-luna": JudgeOption(name="GPT Luna", model="openai/gpt-6-luna"),
    "glm-5-3-flash": JudgeOption(name="GLM 5.3 Flash", model="z-ai/glm-5.3-flash"),
    "qwen-flash": JudgeOption(name="Qwen3.8 Flash", model="qwen/qwen3.8-flash"),
    "minimax-flash": JudgeOption(name="MiniMax M3.1 Flash", model="minimax/minimax-m3.1-flash"),
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./claimtrace.db"
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:5174"]

    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    tavily_api_key: str = ""
    google_factcheck_api_key: str = ""

    redis_url: str = ""
    fact_check_cache_seconds: int = 7 * 24 * 3600

    judges: dict[str, JudgeOption] = DEFAULT_JUDGES
    default_judge_ids: list[str] = ["gpt-luna", "claude-haiku"]
    extraction_model: str = "anthropic/claude-haiku-5.5"
    # Tried by OpenRouter when the requested model is down or rate limited.
    fallback_model: str = "deepseek/deepseek-v4.1-flash"
    prompt_version: str = "v1"
    llm_timeout_seconds: float = 45

    max_text_length: int = 5000
    max_url_length: int = 2048
    max_files: int = 3
    max_file_bytes: int = 200 * 1024
    min_correction_reason: int = 10
    max_correction_reason: int = 1000

    max_claims_per_check: int = 5
    min_checkworthiness: float = 0.5
    search_results_per_claim: int = 5
    max_sources_per_check: int = 10
    passages_per_source: int = 3

    fetch_timeout_seconds: float = 10
    fetch_max_bytes: int = 2 * 1024 * 1024
    fetch_max_redirects: int = 3
    max_parallel_calls: int = 6

    # Each check spends API credit, so one address can't start endless checks. 0 turns this off.
    max_checks_per_hour: int = 30
    max_attachments: int = 3
    max_attachment_chars: int = 900_000


@lru_cache
def get_settings() -> Settings:
    return Settings()

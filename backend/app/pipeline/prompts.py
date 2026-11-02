"""Loads the prompts in `app/prompts/`, and defines the answers they must produce.

The wording lives in those Markdown files so it can be tuned without touching code.
Bump `prompt_version` in settings when it changes, because every verdict records the version that made it.
"""

from pathlib import Path

from pydantic import BaseModel, Field

from ..core.labels import Freshness, Relation, Verdict

PROMPTS = Path(__file__).parent.parent / "prompts"


def system_prompt(task: str) -> str:
    """The rules shared by every task, then the task itself."""
    return f"{(PROMPTS / 'harness.md').read_text(encoding='utf-8')}\n{(PROMPTS / task).read_text(encoding='utf-8')}"


EXTRACT_SYSTEM = system_prompt("extract.md")
JUDGE_SYSTEM = system_prompt("judge.md")
SOURCE_SYSTEM = system_prompt("source.md")


class ExtractedClaim(BaseModel):
    text: str = Field(min_length=3)
    topic: str | None = None
    time_context: str | None = None
    checkworthiness: float = Field(ge=0, le=1)


class ExtractedClaims(BaseModel):
    claims: list[ExtractedClaim]


class Citation(BaseModel):
    evidence_id: str
    relation: Relation
    quote: str
    freshness: Freshness = "unknown"
    freshness_reason: str | None = None


class JudgeAnswer(BaseModel):
    verdict: Verdict
    confidence: float = Field(ge=0, le=1)
    review: str = Field(min_length=1)
    citations: list[Citation] = []


class SourceRatings(BaseModel):
    match: int = Field(ge=0, le=100)
    directness: int = Field(ge=0, le=100)
    timing: int = Field(ge=0, le=100)
    detail: int = Field(ge=0, le=100)


class SourceAnswer(BaseModel):
    summary: str
    key_points: list[str] = Field(min_length=1, max_length=5)
    assessment: str
    note: str
    ratings: SourceRatings


def tagged(tag: str, text: str, **attributes: str) -> str:
    """Escapes the closing tag so that page text can't break out of its block."""
    attrs = "".join(f' {key}="{value}"' for key, value in attributes.items())
    return f"<{tag}{attrs}>\n{text.replace(f'</{tag}', f'< /{tag}')}\n</{tag}>"



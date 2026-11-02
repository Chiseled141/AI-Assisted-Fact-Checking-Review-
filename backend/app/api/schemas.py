"""JSON shapes. Field names match `frontend/src/types/models.ts`."""

from datetime import UTC, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer
from pydantic.alias_generators import to_camel

from ..core.labels import Freshness, Relation, Verdict

# SQLite drops time zones, and every time here is UTC. Without the offset, browsers would read them as local time.
UtcTime = Annotated[datetime, PlainSerializer(lambda value: value.replace(tzinfo=UTC).isoformat(), return_type=str)]


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class SubmittedFile(ApiModel):
    name: str
    size: int
    text: str


class FreshnessJudgment(ApiModel):
    status: Freshness
    reason: str | None = None


class Attachment(ApiModel):
    id: str
    name: str
    type: str
    size: int
    data_url: str


class CreateCheck(ApiModel):
    input_type: Literal["text", "url"]
    text: str | None = None
    url: str | None = None
    files: list[SubmittedFile] = []
    judge_ids: list[str] | None = None


class CheckOut(ApiModel):
    id: str
    title: str
    input_type: str
    input_text: str | None = None
    input_url: str | None = None
    files: list[SubmittedFile] | None = None
    article: dict | None = None
    claims_match_input: bool = True
    status: str
    created_at: UtcTime
    updated_at: UtcTime
    claim_count: int | None = None
    error_message: str | None = None
    judge_ids: list[str]


class JudgeVerdictOut(ApiModel):
    judge: str
    verdict: Verdict
    confidence: float
    review: str
    primary: bool


class RevisionOut(ApiModel):
    id: str
    claim_id: str
    version: int
    kind: str
    verdict: Verdict
    rationale: str
    cited_evidence_ids: list[str]
    citation_freshness: dict[str, FreshnessJudgment] | None = None
    attachments: list[Attachment] | None = None
    model: dict | None = None
    judges: list[JudgeVerdictOut] | None = None
    author: str
    created_at: UtcTime


class ClaimOut(ApiModel):
    id: str
    check_id: str
    position: int
    text: str
    topic: str | None = None
    time_context: str | None = None
    status: str
    evidence_ids: list[str]
    current_version: int
    current: RevisionOut | None = None
    unavailable_reason: str | None = None
    fact_check: dict | None = None


class CheckDetailOut(CheckOut):
    claims: list[ClaimOut]


class EvidenceOut(ApiModel):
    id: str
    claim_id: str
    source_title: str
    publisher: str | None = None
    url: str
    excerpt: str
    published_at: str | None = None
    retrieved_at: UtcTime
    image_url: str | None = None
    relation: Relation
    analysis: dict | None = None


class CheckPage(ApiModel):
    items: list[CheckOut]
    page: int
    page_size: int
    total: int
    total_pages: int


class CorrectionIn(ApiModel):
    verdict: Verdict
    reason: str
    evidence_ids: list[str]
    attachments: list[Attachment] = []
    citation_freshness: dict[str, FreshnessJudgment] = {}
    expected_version: int


class CorrectionOut(ApiModel):
    claim: ClaimOut
    revision: RevisionOut


class FeedbackIn(ApiModel):
    helpful: bool
    comment: str | None = Field(default=None, max_length=1000)


class StatsOut(ApiModel):
    checks: int
    label_distribution: dict[str, int]
    average_seconds: float | None

"""JSON shapes. Field names match `frontend/src/types/models.ts`."""

from datetime import UTC, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, StrictInt
from pydantic.alias_generators import to_camel

from config.labels import Freshness, InputCategory, Relation, StockMarket, Verdict


def _utc(value: datetime) -> str:
    # SQLite drops time zones, and every time here is UTC. Without the offset, browsers would read them as local time.
    return (value.astimezone(UTC) if value.tzinfo else value.replace(tzinfo=UTC)).isoformat()


UtcTime = Annotated[datetime, PlainSerializer(_utc, return_type=str)]


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
    status: str
    created_at: UtcTime
    updated_at: UtcTime
    claim_count: int | None = None
    error_message: str | None = None
    judge_ids: list[str]
    input_category: InputCategory | None = None


class JudgeCitationOut(ApiModel):
    evidence_id: str
    quote: str | None = None
    translations: dict[str, str] | None = None
    relation: Relation | None = None
    freshness: Freshness | None = None


class JudgeVerdictOut(ApiModel):
    judge: str
    verdict: Verdict
    confidence: float
    review: str
    translations: dict[str, str] | None = None
    primary: bool
    citations: list[JudgeCitationOut] | None = None
    model: str | None = None


class RevisionOut(ApiModel):
    id: str
    claim_id: str
    version: int
    kind: str
    verdict: Verdict
    rationale: str
    translations: dict[str, str] | None = None  # The rationale in other languages, when the model wrote one.
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
    price_chart: dict | None = None
    stock_heatmap_markets: list[StockMarket] | None = None
    location_map: dict | None = None
    incident_map: dict | None = None
    country_map: dict | None = None
    population_pyramid: dict | None = None
    seat_chart: dict | None = None
    pie_chart: dict | None = None
    bar_chart: dict | None = None
    route_map: dict | None = None
    match_result: dict | None = None
    election_map: dict | None = None
    rephrased_from: str | None = None
    translations: dict[str, str] | None = None  # The claim in other languages, written at extraction.


class ReviewClaimOut(ApiModel):
    position: int
    text: str


class ReviewQuestionOut(ApiModel):
    claim: int
    question: str
    options: list[str]


class ReviewReply(ApiModel):
    claim: int
    answer: str | None = Field(default=None, max_length=300)  # None checks the claim as written.


class ReviewAnswer(ApiModel):
    claim: int | None = None  # The single-claim selection used by older clients.
    selected_claims: list[StrictInt] | None = Field(default=None, min_length=1, exclude_if=lambda value: value is None)
    answers: list[ReviewReply] = Field(default_factory=list, max_length=5)
    typed_claim: str | None = Field(default=None, max_length=300)  # What to check instead, in the reader's own words.


class ReviewOut(ApiModel):
    """What the reader was asked before the search, and what they said. Only these fields of `Check.review` leave the server."""

    claims: list[ReviewClaimOut]
    choose: bool
    questions: list[ReviewQuestionOut]
    answer: ReviewAnswer | None = None


class TaskProgressOut(ApiModel):
    """One real task on the Checking screen. Written in `pipeline/progress.py`."""

    id: str
    kind: Literal["ai", "search", "data"] = "ai"  # Checks saved before this field only recorded model calls.
    # Saved checks keep the names of their time, so these stay open rather than failing an old check.
    task: str
    status: Literal["running", "completed", "failed"]
    # AI tasks.
    model_name: str | None = None
    requested_model: str | None = None
    actual_model: str | None = None  # What the provider says answered.
    actual_model_name: str | None = None
    # Tavily and chart data tasks.
    service: str | None = None
    chart: str | None = None
    phase: Literal["searching", "reading"] | None = None
    search_count: int | None = None
    source_count: int | None = None
    source_target: int | None = None
    state_count: int | None = None
    started_at: str
    finished_at: str | None = None
    claim_position: int | None = None
    claim_count: int | None = None
    input_category: InputCategory | None = None
    summary: str | None = None
    translations: dict[str, str] | None = None  # The summary in other languages, written by the model itself.
    verdict: Verdict | None = None


class MessageReference(ApiModel):
    kind: Literal["judge", "chart", "source", "message", "answer"]
    title: str
    url: str | None = None
    model_name: str | None = None


class FollowUpSource(ApiModel):
    title: str
    url: str


class MessageOut(ApiModel):
    id: str
    question: str
    files: list[SubmittedFile] = []
    answer: str
    reference: MessageReference | None = None
    sources: list[FollowUpSource] = []
    model_name: str | None = None
    created_at: UtcTime


class FollowUpTarget(ApiModel):
    claim_id: str = Field(max_length=32)
    kind: Literal["judge", "chart", "source"]
    key: str = Field(max_length=160)
    label: str | None = Field(default=None, max_length=300)


class FollowUpIn(ApiModel):
    question: str
    files: list[SubmittedFile] = []
    # A key from the judge list. Without one, `followup_model` answers.
    model_id: str | None = None
    reply_to_id: str | None = Field(default=None, max_length=32)
    target: FollowUpTarget | None = None


class SimilarIn(ApiModel):
    text: str | None = Field(default=None, max_length=5000)
    url: str | None = Field(default=None, max_length=2048)


class EarlierClaimOut(ApiModel):
    check_id: str
    claim_id: str
    position: int
    text: str
    verdict: Verdict
    checked_at: UtcTime
    similarity: float


class EarlierLinkOut(ApiModel):
    check_id: str
    title: str
    claim_count: int
    checked_at: UtcTime


class SimilarOut(ApiModel):
    claims: list[EarlierClaimOut] = []
    link: EarlierLinkOut | None = None


class CheckDetailOut(CheckOut):
    claims: list[ClaimOut]
    input_suggestions: list[str] | None = None
    progress: list[TaskProgressOut] = []
    messages: list[MessageOut] = []
    review: ReviewOut | None = None


class InputSuggestionsOut(ApiModel):
    suggestions: list[str]


class QuotedTableOut(ApiModel):
    """The table a quoted row came from, read from the saved page by code. `quoted` indexes into `rows`."""

    columns: list[str]
    rows: list[list[str]]
    quoted: list[int]


class EvidenceOut(ApiModel):
    id: str
    claim_id: str
    source_title: str
    publisher: str | None = None
    url: str
    excerpt: str
    table: QuotedTableOut | None = None
    translations: dict[str, str] | None = None
    published_at: str | None = None
    retrieved_at: UtcTime
    image_url: str | None = None
    relation: Relation


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


# Lengths are checked in `auth.py` against settings; these caps only keep huge bodies away from the hasher.
class RegisterIn(ApiModel):
    username: str = Field(max_length=256)
    password: str = Field(max_length=1024)
    password_confirmation: str = Field(max_length=1024)


class LoginIn(ApiModel):
    username: str = Field(max_length=256)
    password: str = Field(max_length=1024)


SourceLanguage = Literal["vi", "en"]
MAX_AVATAR_BYTES = 4 * 1024 * 1024


MAX_SEARCH_INSTRUCTIONS = 500


class SearchOptions(ApiModel):
    """A reader's search limits. A missing field keeps the server's setting."""

    sources_per_claim: int | None = Field(default=None, ge=1, le=8)  # target_publishers_per_claim
    searches_per_claim: int | None = Field(default=None, ge=1, le=5)  # research_max_searches_per_claim
    search_outside_list: bool | None = None  # False turns off the search outside the approved list.


class ProfileIn(ApiModel):
    username: str | None = Field(default=None, max_length=256)
    avatar: str | None = Field(default=None, max_length=4 * ((MAX_AVATAR_BYTES + 2) // 3))
    preferred_source_language: SourceLanguage | None = None
    preferred_search_model_id: str | None = Field(default=None, min_length=1, max_length=64)
    search_instructions: str | None = Field(default=None, max_length=MAX_SEARCH_INSTRUCTIONS)
    search_options: SearchOptions | None = None


class ChangePasswordIn(ApiModel):
    current_password: str = Field(max_length=1024)
    new_password: str = Field(max_length=1024)
    password_confirmation: str = Field(max_length=1024)


class AccountOut(ApiModel):
    id: str
    username: str
    avatar: str | None = None
    preferred_source_language: SourceLanguage | None = None
    preferred_search_model_id: str | None = None
    search_instructions: str | None = None
    search_options: SearchOptions = SearchOptions()


class StatsOut(ApiModel):
    checks: int
    label_distribution: dict[str, int]
    average_seconds: float | None

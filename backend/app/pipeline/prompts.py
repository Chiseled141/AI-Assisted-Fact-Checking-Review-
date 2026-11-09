"""Loads the prompts in `config/prompts/`, and defines the answers they must produce.

The wording lives in those Markdown files so it can be tuned without touching code.
Bump `prompt_version` in settings when it changes, because every verdict records the version that made it.
"""

import re
from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, Field

from ..charts.data_sources import MarketAsset
from ..core.config import PROMPTS_DIR
from ..core.labels import Freshness, InputCategory, Relation, StockMarket, Verdict

PROMPTS = PROMPTS_DIR


def read_prompt(name: str) -> str:
    """One prompt file, without the HTML comment at its top. That note is for whoever edits it, not the model."""
    return re.sub(r"\A<!--.*?-->\n", "", (PROMPTS / name).read_text(encoding="utf-8"), flags=re.S)


def system_prompt(*tasks: str) -> str:
    """The rules shared by every task, then the task itself, or two tasks answered together."""
    return "\n".join(read_prompt(name) for name in ("harness.md", *tasks))


# Only the tasks that fill a chart or a map need its rules. Judges never see one.
EXTRACT_SYSTEM = system_prompt(
    "charts/chart_rules.md", "extract.md", "charts/stock_heatmap.md", "charts/bar_request.md", "charts/route_request.md",
)
JUDGE_SYSTEM = system_prompt("judge.md")
INPUT_SUGGESTIONS_SYSTEM = system_prompt("input_suggestions.md")
SJC_PRICES_SYSTEM = system_prompt("charts/chart_rules.md", "charts/sjc_prices.md")
MAP_DETAILS_SYSTEM = system_prompt("charts/chart_rules.md", "charts/map_details.md")
PIE_CHART_SYSTEM = system_prompt("charts/chart_rules.md", "charts/pie_chart.md")
BAR_CHART_SYSTEM = system_prompt("charts/chart_rules.md", "charts/bar_chart.md")
ROUTE_MAP_SYSTEM = system_prompt("charts/route_map.md")
MATCH_RESULT_SYSTEM = system_prompt("charts/match_result.md")
INCIDENT_MAP_SYSTEM = system_prompt("charts/chart_rules.md", "charts/incident_map.md")
SEAT_CHART_SYSTEM = system_prompt("charts/chart_rules.md", "charts/seat_chart.md")
ELECTION_MAP_SYSTEM = system_prompt("charts/chart_rules.md", "charts/election_map.md")
ELECTION_RESULTS_SYSTEM = system_prompt("charts/chart_rules.md", "charts/seat_chart.md", "charts/election_map.md")
RESEARCH_SYSTEM = system_prompt("research.md")
QUESTION_SYSTEM = system_prompt("question.md", "charts/stock_heatmap.md", "charts/bar_request.md", "charts/route_request.md")
REVIEW_SYSTEM = system_prompt("review.md")
CHART_RESEARCH_SYSTEM = system_prompt("charts/chart_research.md")
FOLLOWUP_SYSTEM = system_prompt("followup.md")


class PriceEvent(BaseModel):
    date: str
    title: str
    text: str


class MapPlace(BaseModel):
    name: str
    country: str
    region: str | None = None


class HeatMapRequest(BaseModel):
    metric: str
    area: str
    area_name: str
    start: str
    end: str


class CountryStatRequest(BaseModel):
    indicator: str
    countries: list[MapPlace] = []
    year: int | None = None


class PopulationPyramidRequest(BaseModel):
    name: str
    country: str
    year: int | None = None


class SeatChartRequest(BaseModel):
    body: str
    year: int | None = None


class ElectionMapRequest(BaseModel):
    office: Literal["president", "house", "senate"]
    year: int | None = None


class ExtractedClaim(BaseModel):
    text: str = Field(min_length=3)
    person_name: str | None = None
    search_query: str | None = Field(default=None, max_length=400)
    search_query_en: str | None = Field(default=None, max_length=400)
    search_query_vi: str | None = Field(default=None, max_length=400)
    topic: str | None = None
    time_context: str | None = None
    event_date: date | None = None
    checkworthiness: float = Field(ge=0, le=1)
    price_asset: MarketAsset | None = None
    stock_heatmap_markets: list[StockMarket] = Field(default_factory=list, max_length=6)
    price_events: list[PriceEvent] = []
    map_places: list[MapPlace] = []
    map_zoom: Literal["close", "region", "wide"] | None = None
    pie_chart: bool = False
    bar_chart: bool = False
    route_map: bool = False
    match_result: Literal["sport", "esport"] | None = None
    heat_map: HeatMapRequest | None = None
    country_stat: CountryStatRequest | None = None
    population_pyramid: PopulationPyramidRequest | None = None
    seat_chart: SeatChartRequest | None = None
    election_map: ElectionMapRequest | None = None


class ExtractedClaims(BaseModel):
    claims: list[ExtractedClaim]
    input_category: InputCategory | None = None


class InputSuggestions(BaseModel):
    suggestions: list[Annotated[str, Field(max_length=240)]] = Field(max_length=3)


class ClaimQuestion(BaseModel):
    claim: int = Field(ge=1)
    question: str = Field(min_length=3, max_length=300)
    options: list[Annotated[str, Field(min_length=1, max_length=160)]] = Field(default_factory=list, max_length=4)


class ClaimReview(BaseModel):
    questions: list[ClaimQuestion] = []


class ReportedPrice(BaseModel):
    evidence_id: str
    date: str
    sell_price: float = Field(gt=0)
    quote: str


class ReportedPrices(BaseModel):
    prices: list[ReportedPrice] = []


class MapDetail(BaseModel):
    evidence_id: str
    place: str | None = None
    label: str
    value: str
    quote: str


class MapDetails(BaseModel):
    details: list[MapDetail] = []


class ReportedPieFigure(BaseModel):
    figure: str = Field(min_length=1, max_length=32)
    quote: str = Field(min_length=1, max_length=500)


class ReportedPiePart(ReportedPieFigure):
    name: str = Field(min_length=1, max_length=80)


class ReportedPieBreakdown(BaseModel):
    evidence_id: str
    title: str = Field(min_length=1, max_length=140)
    unit: Literal["count", "percent"]
    total: ReportedPieFigure | None = None
    parts: list[ReportedPiePart] = Field(min_length=2, max_length=8)


class ReportedPieChart(BaseModel):
    breakdown: ReportedPieBreakdown | None = None


class ReportedBarPoint(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    figure: str = Field(min_length=1, max_length=32)
    quote: str = Field(min_length=1, max_length=500)


class ReportedBarComparison(BaseModel):
    evidence_id: str
    title: str = Field(min_length=1, max_length=140)
    unit: str = Field(min_length=1, max_length=60)
    unit_quote: str = Field(min_length=1, max_length=500)
    decimal_separator: Literal[".", ","]
    points: list[ReportedBarPoint] = Field(min_length=2, max_length=8)


class ReportedBarChart(BaseModel):
    comparison: ReportedBarComparison | None = None


class ReportedRouteStop(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    country: str | None = Field(default=None, pattern=r"^[A-Z]{2}$")
    schedule: str | None = Field(default=None, min_length=1, max_length=100)
    schedule_quote: str | None = Field(default=None, min_length=1, max_length=400)


class ReportedRoute(BaseModel):
    evidence_id: str
    title: str = Field(min_length=1, max_length=140)
    quote: str = Field(min_length=1, max_length=1200)
    stops: list[ReportedRouteStop] = Field(min_length=2, max_length=8)


class ReportedRouteMap(BaseModel):
    route: ReportedRoute | None = None


class ReportedMatchScore(BaseModel):
    scores: tuple[Annotated[int, Field(ge=0, le=999)], Annotated[int, Field(ge=0, le=999)]]
    quote: str = Field(min_length=1, max_length=500)


class ReportedMatchMap(ReportedMatchScore):
    name: str = Field(min_length=1, max_length=80)


class ReportedMatchMoment(BaseModel):
    minute: str = Field(pattern=r"^[0-9]{1,3}(?:\+[0-9]{1,2})?$")
    label: str = Field(min_length=1, max_length=140)
    quote: str = Field(min_length=1, max_length=500)


class ReportedMatch(ReportedMatchScore):
    evidence_id: str
    teams: tuple[Annotated[str, Field(min_length=1, max_length=100)], Annotated[str, Field(min_length=1, max_length=100)]]
    competition: str | None = Field(default=None, max_length=120)
    stage: str | None = Field(default=None, max_length=70)
    date_label: str | None = Field(default=None, max_length=48)
    shootout: ReportedMatchScore | None = None
    maps: list[ReportedMatchMap] = Field(default_factory=list, max_length=9)
    moments: list[ReportedMatchMoment] = Field(default_factory=list, max_length=12)


class ReportedMatchResult(BaseModel):
    match: ReportedMatch | None = None


class ReportedIncidentArea(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    kind: Literal["area", "road_segment"] = "area"
    start: str | None = Field(default=None, max_length=100)
    end: str | None = Field(default=None, max_length=100)


class ReportedIncidentLocation(BaseModel):
    evidence_id: str
    city: str = Field(min_length=2, max_length=60)
    district: str | None = Field(default=None, max_length=80)
    roads: list[str] = Field(default_factory=list, max_length=2)
    areas: list[ReportedIncidentArea] = Field(default_factory=list, max_length=4)
    toward: str | None = Field(default=None, max_length=100)
    whole_road: bool = False
    quote: str = Field(min_length=1, max_length=650)


class IncidentLocations(BaseModel):
    locations: list[ReportedIncidentLocation] = Field(default_factory=list, max_length=8)


class ReportedSeat(BaseModel):
    evidence_id: str
    party: str
    seats: int
    quote: str


class ReportedTotal(BaseModel):
    evidence_id: str
    seats: int
    quote: str


class ReportedSeats(BaseModel):
    total: ReportedTotal | None = None
    parties: list[ReportedSeat] = []


class ReportedState(BaseModel):
    evidence_id: str
    state: str
    winner: str
    party: Literal["republican", "democratic"] | None = None
    detail: str | None = None
    quote: str


class ReportedStates(BaseModel):
    states: list[ReportedState] = []


class ReportedElection(ReportedSeats, ReportedStates):
    """A claim with a parliament chart and an election map gets both from one model call."""


class ResearchPicks(BaseModel):
    urls: list[str] = []


class Citation(BaseModel):
    evidence_id: str
    relation: Relation
    quote: str
    quote_en: str | None = None
    quote_vi: str | None = None
    freshness: Freshness = "unknown"
    freshness_reason: str | None = None


class JudgeAnswer(BaseModel):
    verdict: Verdict
    confidence: float = Field(ge=0, le=1)
    review: str = Field(min_length=1)
    review_en: str | None = None
    review_vi: str | None = None
    citations: list[Citation] = []


class FollowUpAnswer(BaseModel):
    answer: str = Field(min_length=1)
    source_urls: list[str] = Field(default_factory=list, max_length=18)


def tagged(tag: str, text: str, **attributes: str) -> str:
    """Escapes the closing tag so that page text can't break out of its block."""
    attrs = "".join(f' {key}="{value}"' for key, value in attributes.items())
    return f"<{tag}{attrs}>\n{text.replace(f'</{tag}', f'< /{tag}')}\n</{tag}>"

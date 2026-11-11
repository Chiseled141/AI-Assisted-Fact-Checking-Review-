"""Read a completed sports or esports match from the claim's saved evidence."""

import logging
import re
from typing import Literal

from config.settings import Settings
from database.models import Evidence, Source

from ..pipeline.passages import quote_in_text, top_passages
from ..pipeline.progress import NOT_ENOUGH_VERIFIED, TaskLog
from ..pipeline.prompts import MATCH_RESULT_SYSTEM, ReportedMatch, ReportedMatchResult, ReportedMatchScore, tagged
from ..providers.llm import LLM, LLMError

logger = logging.getLogger(__name__)
MatchKind = Literal["sport", "esport"]
COMPLETED = re.compile(
    r"\b(?:won|wins?|beat(?:ing)?|defeat(?:ed|s)?|swept|victory|ended|finished|full[ -]time|ft|match over|final score|"
    r"thắng|đánh bại|kết thúc|chung cuộc|hết giờ)\b",
    re.IGNORECASE,
)
UNFINISHED = re.compile(
    r"\b(?:will|could|would|predicted|projected|prediction|forecast|in progress|half[ -]?time|aggregate|"
    r"sẽ|dự đoán|dự kiến|đang diễn ra|tổng tỷ số)\b",
    re.IGNORECASE,
)
ORDERED = re.compile(r"\b(?:v|vs|versus|beat(?:ing)?|defeat(?:ed|s)?|thắng|đánh bại|gặp)\b", re.IGNORECASE)
SHOOTOUT = re.compile(r"\b(?:penalties|shoot[ -]?out|luân lưu)\b", re.IGNORECASE)
FINAL_STATUS = re.compile(r"\b(?:match over|full[ -]time|finished|hết giờ|kết thúc)\b", re.IGNORECASE)


def _words(text: str) -> str:
    return " ".join(text.split())


def _term(text: str) -> str:
    return rf"(?<!\w){re.escape(text)}(?!\w)"


def _pair(scores: tuple[int, int]) -> str:
    left, right = scores
    return rf"(?<!\d){left}\s*[-–—:−]\s*{right}(?!\d)"


def _ordered_score(report: ReportedMatchScore, teams: tuple[str, str]) -> bool:
    quote = _words(report.quote)
    pair = _pair(report.scores)
    first, second = map(_term, teams)
    # Common score lines print A 5–0 B or A beat B 5–0.
    for line in re.finditer(rf"{first}(?P<between>.{{0,160}}?){second}(?P<after>.{{0,45}})", quote, re.IGNORECASE):
        between, after = line["between"], line["after"]
        if re.fullmatch(rf"\s*{pair}\s*", between):
            return True
        if ORDERED.search(between) and re.match(rf"^[\s:(]*{pair}", after):
            return True
        # A stacked scoreboard repeats each team's score beside its name.
        left, right = report.scores
        left_score = re.match(rf"^\s+{left}\b(?!\s*[-–—:−]\s*\d)", between)
        if (
            left_score and re.match(rf"^\s+{right}\b(?!\s*[-–—:−]\s*\d)", after)
            and (not re.search(r"\d", between[left_score.end():]) or FINAL_STATUS.search(between))
        ):
            return True
    return False


def _metadata(value: str | None, source: Source) -> str | None:
    value = _words(value or "")
    return value if value and quote_in_text(value, source.text) else None


def _verified_match(report: ReportedMatch, source: Source, kind: MatchKind) -> dict | None:
    teams = (_words(report.teams[0]), _words(report.teams[1]))
    quote = _words(report.quote)
    if (
        not all(teams) or teams[0].casefold() == teams[1].casefold()
        or not COMPLETED.search(quote) or UNFINISHED.search(quote)
        or not quote_in_text(quote, source.text) or not _ordered_score(report, teams)
    ):
        return None
    if kind == "sport" and SHOOTOUT.search(quote) and report.scores[0] != report.scores[1]:
        return None

    score = report.scores
    result = {
        "kind": kind, "teams": teams, "scores": score, "quote": quote,
        "competition": _metadata(report.competition, source),
        "stage": _metadata(report.stage, source),
        "dateLabel": _metadata(report.date_label, source),
        "publisher": source.publisher or source.title, "url": source.url,
    }
    if kind == "esport":
        maps = {}
        for row in report.maps:
            name = _words(row.name)
            row_quote = _words(row.quote)
            if (
                name and row.scores[0] != row.scores[1] and re.search(_term(name), row_quote, re.IGNORECASE)
                and not UNFINISHED.search(row_quote) and quote_in_text(row_quote, source.text)
                and _ordered_score(row, teams)
            ):
                maps.setdefault(name.casefold(), {"name": name, "scores": row.scores})
        wins = [sum(row["scores"][side] > row["scores"][1 - side] for row in maps.values()) for side in (0, 1)]
        if all(won <= total for won, total in zip(wins, score, strict=True)):
            result["maps"] = list(maps.values())
    else:
        moments = {}
        for moment in report.moments:
            label = _words(moment.label)
            row_quote = _words(moment.quote)
            minute = re.escape(moment.minute).replace(r"\+", r"\s*\+\s*")
            stated_minute = rf"(?<![\d+]){minute}\s*['’′]|\b(?:minute|phút)\s+{minute}(?![\d+])"
            if (
                label and label in row_quote and re.search(stated_minute, row_quote, re.IGNORECASE)
                and quote_in_text(row_quote, source.text)
            ):
                moments[(moment.minute, label)] = {"minute": moment.minute, "label": label}
        result["moments"] = sorted(moments.values(), key=lambda item: tuple(map(int, item["minute"].split("+"))))
        shootout = report.shootout
        if (
            shootout and score[0] == score[1] and shootout.scores[0] != shootout.scores[1]
            and SHOOTOUT.search(shootout.quote) and not UNFINISHED.search(shootout.quote)
            and quote_in_text(shootout.quote, source.text) and _ordered_score(shootout, teams)
        ):
            result["shootout"] = shootout.scores
    return result


def build_match_result(
    claim: str, kind: MatchKind, evidence: list[Evidence], llm: LLM, settings: Settings, tasks: TaskLog,
    *, period: str | None = None,
) -> dict | None:
    if not evidence:
        return None
    sources = {f"E{index + 1}": item.source for index, item in enumerate(evidence)}
    query = f"{claim} final result match score full time goals minutes maps best of tỷ số kết quả bàn thắng"
    prompt = "\n\n".join([
        tagged("input", claim, type="claim", category=kind),
        *([f"Match period: {period}"] if period else []),
        *(tagged("passage", top_passages(source.text, query, 6), evidence_id=key,
                 published=source.published_at or "unknown") for key, source in sources.items()),
    ])
    task = tasks.model("match-result", "reading_match", settings.research_model, settings)
    try:
        answer, model = llm.complete(settings.research_model, MATCH_RESULT_SYSTEM, prompt, ReportedMatchResult)
    except LLMError as error:
        logger.warning("Match result failed: %s", error)
        task.fail(error.public_message)
        return None
    report = answer.match
    source = sources.get(report.evidence_id) if report else None
    result = _verified_match(report, source, kind) if report and source else None
    task.finish_model(model, settings, **({} if result else {"summary": NOT_ENOUGH_VERIFIED}))
    return result

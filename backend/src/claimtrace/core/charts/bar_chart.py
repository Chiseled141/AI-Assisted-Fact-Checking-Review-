"""Read comparable, source-reported figures for a claim."""

import logging
import re

from claimtrace.config.settings import Settings
from claimtrace.db.models import Source

from ..pipeline.passages import page_for_reading, quote_in_text, top_passages
from ..pipeline.progress import NOT_ENOUGH_VERIFIED, TaskLog
from ..pipeline.prompts import BAR_CHART_SYSTEM, ReportedBarChart, ReportedBarComparison, tagged
from ..providers.llm import LLM, LLMError
from ..search.fetcher import Page

logger = logging.getLogger(__name__)


def _figure_value(figure: str, decimal_separator: str) -> float | None:
    grouping = "," if decimal_separator == "." else "."
    integer = rf"(?:[0-9]+|[0-9]{{1,3}}(?:{re.escape(grouping)}[0-9]{{3}})+|[0-9]{{1,3}}(?: [0-9]{{3}})+)"
    if not re.fullmatch(rf"[+−-]?{integer}(?:{re.escape(decimal_separator)}[0-9]+)?", figure):
        return None
    value = float(figure.replace(grouping, "").replace(" ", "").replace(decimal_separator, ".").replace("−", "-"))
    return value if abs(value) <= 10**15 else None


def _verified_chart(report: ReportedBarComparison, source: Source | Page) -> dict | None:
    title = report.title.strip()
    unit = " ".join(report.unit.split())
    unit_quote = " ".join(report.unit_quote.split())
    if not title or not unit or not quote_in_text(unit_quote, source.text):
        return None
    unit_pattern = re.escape(unit) if unit in {"%", "$", "€", "£", "¥", "₫", "₹"} else rf"(?<!\w){re.escape(unit)}(?!\w)"
    if not re.search(unit_pattern, unit_quote, re.IGNORECASE):
        return None

    points = []
    names = set()
    for point in report.points:
        name = " ".join(point.name.split())
        figure = " ".join(point.figure.split())
        quote = " ".join(point.quote.split())
        value = _figure_value(figure, report.decimal_separator)
        if not name or name.casefold() in names or value is None or not quote_in_text(quote, source.text):
            return None
        label = re.search(rf"(?<!\w){re.escape(name)}(?!\w)", quote, re.IGNORECASE)
        number = rf"(?<![\w.,+−-])(?<!\d ){re.escape(figure)}(?!\w|[., ]\d)"
        if not label or not any(match.end() <= label.start() or match.start() >= label.end()
                                for match in re.finditer(number, quote)):
            return None
        names.add(name.casefold())
        points.append({"name": name, "value": value})
    return {
        "title": title, "unit": unit, "points": points,
        "publisher": source.publisher or source.title, "url": source.url,
    }


def build_bar_chart(
    claim: str, pages: list[Source | Page], llm: LLM, settings: Settings, tasks: TaskLog,
    *, period: str | None = None, reading_query: str | None = None, retry: bool = False,
) -> dict | None:
    if not pages:
        return None
    sources = {f"E{index + 1}": page for index, page in enumerate(pages)}
    query = reading_query or claim
    prompt = "\n\n".join([
        tagged("input", claim, type="claim"),
        *([f"Period the claim refers to: {period}"] if period else []),
        *(tagged("passage", page_for_reading(source.text, query, settings.chart_research_max_chars_per_source)
                 if retry else top_passages(source.text, query, 6), evidence_id=key,
                 published=source.published_at or "unknown", url=source.url) for key, source in sources.items()),
    ])

    def validate_chart(answer: ReportedBarChart) -> None:
        report = answer.comparison
        source = sources.get(report.evidence_id) if report else None
        if report and (not source or not _verified_chart(report, source)):
            raise ValueError("Copy the unit, labels and figures exactly from the same numbered source. "
                             "Keep the unit in the source's language, or return comparison: null.")

    task = tasks.model("bar-figures-retry" if retry else "bar-figures", "reading_bar", settings.research_model, settings)
    try:
        answer, model = llm.complete(settings.research_model, BAR_CHART_SYSTEM, prompt, ReportedBarChart, validate_chart)
    except LLMError as error:
        logger.warning("Bar chart figures failed: %s", error)
        task.fail(error.public_message)
        return None
    report = answer.comparison
    source = sources.get(report.evidence_id) if report else None
    chart = _verified_chart(report, source) if report and source else None
    task.finish_model(model, settings, **({} if chart else {"summary": NOT_ENOUGH_VERIFIED}))
    return chart

"""Read a complete part-to-whole breakdown from a single cited source."""

import logging
import re
from decimal import Decimal

from config.settings import Settings
from database.models import Source

from ..pipeline.passages import page_for_reading, quote_in_text, source_passages
from ..pipeline.progress import NOT_ENOUGH_VERIFIED, TaskLog
from ..pipeline.prompts import PIE_CHART_SYSTEM, ReportedPieBreakdown, ReportedPieChart, ReportedPieFigure, tagged
from ..providers.llm import LLM, LLMError
from ..search.fetcher import Page

logger = logging.getLogger(__name__)
COUNT = re.compile(r"(?:[0-9]{1,3}(?:([., ])[0-9]{3})(?:\1[0-9]{3})*|[0-9]+)")
PERCENT = re.compile(r"([0-9]+(?:[.,][0-9]+)?)(?: *%| (?:percent|per cent|phần trăm))", re.IGNORECASE)
COUNT_MULTIPLIER = r"(?!\s*(?:%|percent\b|per cent\b|phần trăm\b|thousand\b|million\b|billion\b|nghìn\b|ngàn\b|triệu\b|tỷ\b))"


def _verified_value(report: ReportedPieFigure, source: Source | Page, percent: bool) -> Decimal | None:
    figure = " ".join(report.figure.split())
    quote = " ".join(report.quote.split())
    number = (PERCENT if percent else COUNT).fullmatch(figure)
    if not number or not quote_in_text(quote, source.text):
        return None
    prefix = r"(?<![\w−-])(?<!\d[.,])" if percent else r"(?<![\w−-])(?<!\d[., ])"
    suffix = "" if percent else COUNT_MULTIPLIER
    if not re.search(rf"{prefix}{re.escape(figure)}(?!\w|[., ]\d){suffix}", quote, re.IGNORECASE):
        return None
    if percent:
        return Decimal(number[1].replace(",", "."))
    return Decimal(re.sub(r"[., ]", "", figure))


def _verified_chart(report: ReportedPieBreakdown, source: Source | Page) -> dict | None:
    title = report.title.strip()
    percent = report.unit == "percent"
    total = Decimal(100) if percent else report.total and _verified_value(report.total, source, False)
    if not title or not total or total > 10**15:
        return None
    parts = {}
    for part in report.parts:
        name = " ".join(part.name.split())
        key = name.casefold()
        value = _verified_value(part, source, percent)
        if not name or key in parts or not value or value >= total:
            return None
        if not re.search(rf"(?<!\w){re.escape(key)}(?!\w)", " ".join(part.quote.split()).casefold()):
            return None
        parts[key] = (name, value)
    values = [{"name": name, "value": float(value) if percent else int(value)} for name, value in parts.values()]
    if report.remainder:
        if not percent or len(parts) != 1 or "remaining share" in parts:
            return None
        values.append({"name": "Remaining share", "value": float(total - next(iter(parts.values()))[1])})
    elif len(parts) < 2 or sum(value for _, value in parts.values()) != total:
        return None
    return {
        "title": title,
        "unit": report.unit,
        "parts": values,
        **({"derivedRemainder": True} if report.remainder else {}),
        "publisher": source.publisher or source.title,
        "url": source.url,
    }


def build_pie_chart(
    claim: str, pages: list[Source | Page], llm: LLM, settings: Settings, tasks: TaskLog, *,
    reading_query: str | None = None, retry: bool = False,
) -> dict | None:
    if not pages:
        return None
    sources = {f"E{index + 1}": page for index, page in enumerate(pages)}
    query = f"{reading_query or claim} breakdown total share categories percentage cơ cấu tổng tỷ lệ phần trăm"
    prompt = "\n\n".join([
        tagged("input", claim, type="claim"),
        *(["Look for a complete reported distribution in this attempt."] if retry else []),
        *(tagged("passage", page_for_reading(source.text, query, settings.chart_research_max_chars_per_source)
                 if retry else source_passages(source.text, source.url, claim, query, 4), evidence_id=key)
          for key, source in sources.items()),
    ])
    task = tasks.model("pie-figures-retry" if retry else "pie-figures", "reading_pie", settings.research_model, settings)
    try:
        answer, model = llm.complete(settings.research_model, PIE_CHART_SYSTEM, prompt, ReportedPieChart)
    except LLMError as error:
        logger.warning("Pie chart figures failed: %s", error)
        task.fail(error.public_message)
        return None
    report = answer.breakdown
    source = sources.get(report.evidence_id) if report else None
    chart = _verified_chart(report, source) if report and source and not (retry and report.remainder) else None
    task.finish_model(model, settings, **({} if chart else {"summary": NOT_ENOUGH_VERIFIED}))
    return chart

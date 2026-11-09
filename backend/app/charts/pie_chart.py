"""Read a complete part-to-whole breakdown from a single cited source."""

import logging
import re
from decimal import Decimal

from ..core.config import Settings
from ..db.models import Evidence, Source
from ..pipeline.passages import quote_in_text, top_passages
from ..pipeline.progress import NOT_ENOUGH_VERIFIED, TaskLog
from ..pipeline.prompts import PIE_CHART_SYSTEM, ReportedPieBreakdown, ReportedPieChart, ReportedPieFigure, tagged
from ..providers.llm import LLM, LLMError

logger = logging.getLogger(__name__)
COUNT = re.compile(r"(?:[0-9]{1,3}(?:([., ])[0-9]{3})(?:\1[0-9]{3})*|[0-9]+)")
PERCENT = re.compile(r"[0-9]+(?:[.,][0-9]+)? *%")
COUNT_MULTIPLIER = r"(?!\s*(?:%|percent\b|thousand\b|million\b|billion\b|nghìn\b|ngàn\b|triệu\b|tỷ\b))"


def _verified_value(report: ReportedPieFigure, source: Source, percent: bool) -> Decimal | None:
    figure = " ".join(report.figure.split())
    quote = " ".join(report.quote.split())
    if not (PERCENT if percent else COUNT).fullmatch(figure) or not quote_in_text(quote, source.text):
        return None
    suffix = "" if percent else COUNT_MULTIPLIER
    if not re.search(rf"(?<![\w−-])(?<!\d[.,]){re.escape(figure)}(?!\w|[., ]\d){suffix}", quote, re.IGNORECASE):
        return None
    if percent:
        return Decimal(figure.rstrip("% ").replace(",", "."))
    return Decimal(re.sub(r"[., ]", "", figure))


def _verified_chart(report: ReportedPieBreakdown, source: Source) -> dict | None:
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
    if sum(value for _, value in parts.values()) != total:
        return None
    return {
        "title": title,
        "unit": report.unit,
        "parts": [{"name": name, "value": float(value) if percent else int(value)} for name, value in parts.values()],
        "publisher": source.publisher or source.title,
        "url": source.url,
    }


def build_pie_chart(claim: str, evidence: list[Evidence], llm: LLM, settings: Settings, tasks: TaskLog) -> dict | None:
    if not evidence:
        return None
    sources = {f"E{index + 1}": item.source for index, item in enumerate(evidence)}
    query = f"{claim} breakdown total share categories percentage cơ cấu tổng tỷ lệ phần trăm"
    prompt = "\n\n".join([
        tagged("input", claim, type="claim"),
        *(tagged("passage", top_passages(source.text, query, 4), evidence_id=key) for key, source in sources.items()),
    ])
    task = tasks.model("pie-figures", "reading_pie", settings.research_model, settings)
    try:
        answer, model = llm.complete(settings.research_model, PIE_CHART_SYSTEM, prompt, ReportedPieChart)
    except LLMError as error:
        logger.warning("Pie chart figures failed: %s", error)
        task.fail(error.public_message)
        return None
    report = answer.breakdown
    source = sources.get(report.evidence_id) if report else None
    chart = _verified_chart(report, source) if report and source else None
    task.finish_model(model, settings, **({} if chart else {"summary": NOT_ENOUGH_VERIFIED}))
    return chart

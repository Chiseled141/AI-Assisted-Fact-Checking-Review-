"""Builds a claim's parliament chart, only for a claim about seats won in an election.

No service covers every election, so the research model reads the counts from the sources it chose for the claim, and each
must be found in the source's own words to be kept. The chart is context, so judges never see it.
"""

import logging
import re
from collections import Counter

from config.settings import Settings
from database.models import Source, utcnow

from ..pipeline.passages import quote_in_text
from ..pipeline.prompts import ReportedSeat, ReportedSeats, ReportedTotal, SeatChartRequest
from .location_map import _folded

logger = logging.getLogger(__name__)

SEAT_WORDS = re.compile(r"(?<!\w)(seats?|ghế)(?!\w)|\d[- ](seat|member)", re.IGNORECASE)
# A row counting something else, such as votes, is not a seat count.
OTHER_COUNT_WORDS = re.compile(r"(?<!\w)(votes?|ballots?|phiếu|percent|districts?)(?!\w)|%", re.IGNORECASE)
TABLE_ROW_WORDS = 12
ELECTION_WORDS = re.compile(
    r"(?<!\w)(elections?|elected|general election|vote|bầu cử|tuyển cử|parliament|quốc hội|hạ viện|thượng viện|"
    r"house of commons|bundestag|congress|senate|majority|đa số)(?!\w)",
    re.IGNORECASE,
)
# A count from before the final result would draw the wrong chamber.
UNFINISHED_WORDS = re.compile(
    r"(?<!\w)(so far|projected|projection|exit polls?|forecasts?|predicted|expected|estimated|would win|could win|"
    r"tính đến|hiện tại|sơ bộ|dự kiến|dự đoán|thăm dò|có thể sẽ|được cho là)(?!\w)",
    re.IGNORECASE,
)


def is_election_claim(text: str, body: str) -> bool:
    """The model's choice must hold up in the claim's own words, so a stray guess draws nothing."""
    if not body.strip() or body.lower() not in text.lower():
        return False
    return bool(SEAT_WORDS.search(text) and ELECTION_WORDS.search(text))


def _is_seat_table_row(quote: str, source_text: str) -> bool:
    """A results table writes "Liberal 169" with no word for seats, so the page around it has to say what it counts."""
    return len(quote.split()) <= TABLE_ROW_WORDS and bool(SEAT_WORDS.search(source_text)) and not OTHER_COUNT_WORDS.search(quote)


def _states_count(quote: str, seats: int, source_text: str) -> bool:
    if not quote or not quote_in_text(quote, source_text) or UNFINISHED_WORDS.search(quote):
        return False
    if not SEAT_WORDS.search(quote) and not _is_seat_table_row(quote, source_text):
        return False
    return bool(re.search(rf"(?<![\d.,]){seats}(?![\d.,]*\d)", quote))


def _party_key(name: str) -> str:
    """Democrats, Democrat, Democratic and Democratic Party are one party, in a quote and in a list of counts."""
    return re.sub(r"(ic|s)$", "", _folded(name).removesuffix("party"))


def is_verified_seat(report: ReportedSeat, source_text: str) -> bool:
    """A model read this count, so it only counts if the source's own words show it. Anything doubtful is dropped."""
    key = _party_key(report.party)
    if report.seats <= 0 or not key:
        return False
    return _states_count(report.quote, report.seats, source_text) and key in _folded(report.quote)


def is_verified_total(report: ReportedTotal | None, source_text: str) -> bool:
    return report is not None and report.seats > 0 and _states_count(report.quote, report.seats, source_text)


def complete_chart(chart: dict | None, settings: Settings) -> dict | None:
    """A chart only appears when its parties account for every seat in the chamber."""
    if not chart or not settings.seat_chart_require_all_seats:
        return chart
    return chart if sum(party["seats"] for party in chart["parties"]) == chart["total"] else None


def _verified_chart(request: SeatChartRequest, answer: ReportedSeats, labels: dict[str, Source]) -> dict | None:
    """Only counts found in a source's own words are drawn."""
    total_source = labels.get(answer.total.evidence_id) if answer.total else None
    # Without the chamber's size, a partial list would look like the whole result.
    if total_source is None or not is_verified_total(answer.total, total_source.text):
        return None

    reports: dict[str, list[tuple[ReportedSeat, Source]]] = {}
    for report in answer.parties:
        source = labels.get(report.evidence_id)
        if source is not None and is_verified_seat(report, source.text):
            found = reports.setdefault(_party_key(report.party), [])
            # One article has one final count, so a second is from another election. It often gives the last one's too.
            if all(earlier is not source for _, earlier in found):
                found.append((report, source))

    parties = []
    for found in reports.values():
        counts = Counter(report.seats for report, _ in found)
        # The count most sources give, then the newest report. Other counts stay on screen.
        best = max(found, key=lambda pair: (counts[pair[0].seats], pair[1].published_at or ""))
        others = {}
        for report, source in found:
            if report.seats != best[0].seats:
                others.setdefault(report.seats, source)
        parties.append(
            {
                "name": best[0].party,
                "seats": best[0].seats,
                "publisher": best[1].publisher or best[1].title,
                "url": best[1].url,
                "others": [
                    {"seats": seats, "publisher": source.publisher or source.title, "url": source.url}
                    for seats, source in others.items()
                ],
            }
        )
    parties.sort(key=lambda party: party["seats"], reverse=True)
    # A sum above the chamber's size means something was misread, so nothing is drawn.
    if not parties or sum(party["seats"] for party in parties) > answer.total.seats:
        return None
    return {
        "body": request.body,
        "year": request.year,
        "total": answer.total.seats,
        "totalSource": {"publisher": total_source.publisher or total_source.title, "url": total_source.url},
        "retrievedAt": utcnow().isoformat(),
        "parties": parties,
    }

"""Builds a claim's price chart, only for a claim about the price of an asset we track.

A model names the asset and the dates. World prices come from market data. SJC gold has no such data, so its
prices are read from news articles by a model, and each one must be found in the article's own words to be kept.
Either way the prices are saved with the claim.
"""

import logging
import re
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, timedelta
from statistics import median

from ..core.config import Settings
from ..db.models import utcnow
from ..pipeline.passages import quote_in_text, top_passages
from ..pipeline.progress import NO_READABLE_SOURCE, NO_TASKS, NOT_ENOUGH_DATA, NOT_ENOUGH_VERIFIED, TaskLog
from ..pipeline.prompts import SJC_PRICES_SYSTEM, ExtractedClaim, ReportedPrice, ReportedPrices, tagged
from ..providers.llm import LLM, LLMError
from ..search.fetcher import Page
from ..search.tavily import SJC_DOMAINS, SJC_PAGES, Search, SearchError, SearchHit, read_hit, source_url_key, within_domains
from .data_sources import MARKET_SYMBOLS, MarketData, MarketError

logger = logging.getLogger(__name__)

ASSET_WORDS = {
    "bitcoin": r"bitcoin|btc",
    "ethereum": r"ethereum|ether|eth",
    "gold": r"gold|vàng",
    "silver": r"silver|bạc",
    "oil": r"oil|brent|dầu",
    "sjc_gold": r"sjc",
    "usd_vnd": r"usd|đô(?!\s*thị)|đô-la|dollars?",
}
PRICE_WORDS = re.compile(
    r"(?<!\w)(prices?|priced|worth|valued?|traded?|trading|usd|all-time high|record high|hit a record|at a record|record price"
    r"|giá|đô la|đỉnh|kỷ lục|dong|vnd|vnđ|tael|triệu đồng)(?!\w)|\$",
    re.IGNORECASE,
)
# These have their own prices, which a chart of the world price in dollars would misrepresent.
SJC_PRICE_WORDS = re.compile(r"(?<!\w)(sjc|vàng miếng|triệu đồng|lượng)(?!\w)", re.IGNORECASE)
# We have no prices for these at all, and SJC's would misrepresent them too.
UNTRACKED_PRICE_WORDS = re.compile(r"(?<!\w)(doji|pnj|vàng nhẫn|xăng|e5|ron ?95)(?!\w)", re.IGNORECASE)
# These dealers sell SJC bars too, at prices of their own.
OTHER_SELLERS = re.compile(r"(?<!\w)(mi hồng|bảo tín|phú quý|nhẫn)(?!\w)", re.IGNORECASE)
DONG_WORDS = re.compile(r"(?<!\w)(vnd|vnđ|đồng|dong)(?!\w)", re.IGNORECASE)
# A price in dollars and dong together isn't an exchange rate, so the claim must say it is one.
RATE_WORDS = re.compile(
    r"(?<!\w)(tỷ giá|tỉ giá|exchange rate|quy đổi|usd\s*[/-]\s*vnd|(?:1|một)\s+(?:usd|đô|dollar)"
    r"|(?:per|to the|against the|so với)\s+(?:us\s+)?(?:usd|đô|dollar))(?!\w)",
    re.IGNORECASE,
)
# These rates have figures of their own, which the market rate would misrepresent.
OTHER_RATE_WORDS = re.compile(
    r"(?<!\w)(chợ đen|thị trường tự do|trung tâm|black market|central rate|ngân hàng|banks?|mua vào|bán ra"
    r"|vietcombank|bidv|vietinbank|agribank|techcombank)(?!\w)",
    re.IGNORECASE,
)


def is_price_claim(text: str, asset: str) -> bool:
    """The model's choice must hold up in the claim's own words, so a stray guess draws no chart."""
    if asset not in ASSET_WORDS or UNTRACKED_PRICE_WORDS.search(text):
        return False
    named = re.search(rf"(?<!\w)({ASSET_WORDS[asset]})(?!\w)", text, re.IGNORECASE)
    if asset == "usd_vnd":
        return bool(named and DONG_WORDS.search(text) and RATE_WORDS.search(text) and not OTHER_RATE_WORDS.search(text))
    if asset != "sjc_gold" and SJC_PRICE_WORDS.search(text):
        return False
    return bool(named and PRICE_WORDS.search(text))


def drop_bad_rates(prices: list[list[float]], tolerance: float) -> list[list[float]]:
    """Yahoo's dong history has lone wrong days, such as 189 dong to the dollar. Judges read these, so they go.

    Each day is compared with the median of the week around it, which leaves a real devaluation in place.
    """
    closes = [close for _, close in prices]
    return [
        point
        for index, point in enumerate(prices)
        if abs(point[1] / median(closes[max(index - 3, 0) : index + 4]) - 1) <= tolerance
    ]


def _event_day(value: str, today: date) -> date | None:
    try:
        day = date.fromisoformat(value)
    except ValueError:
        return None
    return day if day <= today else None


def _events(item: ExtractedClaim, today: date, settings: Settings) -> list[tuple[date, object]]:
    events = item.price_events[: settings.price_chart_max_events]
    return [(day, event) for event in events if (day := _event_day(event.date, today))]


def _event_out(events: list[tuple[date, object]]) -> list[dict]:
    return [{"date": day.isoformat(), "title": event.title[:24], "text": event.text} for day, event in events]


def build_price_chart(
    item: ExtractedClaim, market: MarketData | None, settings: Settings, tasks: TaskLog = NO_TASKS
) -> dict | None:
    """World prices. A failure only costs the chart, so the check itself carries on."""
    if market is None or item.price_asset in (None, "sjc_gold"):
        return None
    if not is_price_claim(item.text, item.price_asset):
        tasks.chart_skipped("price")
        return None
    now = utcnow()
    today = now.date()
    events = _events(item, today, settings)
    earliest = min((day for day, _ in events), default=today)
    start = earliest - timedelta(days=settings.price_chart_days_before)
    symbol = MARKET_SYMBOLS[item.price_asset]
    task = tasks.chart_data("price", market.name)
    try:
        prices = market.daily_closes(symbol, start, today)
    except MarketError as error:
        logger.warning("%s: %s", market.name, error)
        task.fail(str(error))
        return None
    is_rate = item.price_asset == "usd_vnd"
    if is_rate:
        prices = drop_bad_rates(prices, settings.price_chart_rate_tolerance)
    if len(prices) < 2:
        task.finish(summary=NOT_ENOUGH_DATA)
        return None
    task.finish()
    return {
        "asset": item.price_asset,
        "currency": "VND" if is_rate else "USD",
        "source": market.name,
        "retrievedAt": now.isoformat(),
        "prices": prices,
        "events": _event_out(events),
    }


def _numbers(text: str) -> set[float]:
    """Every figure in the text, in millions of dong: 90,5 and 90.500.000 both give 90.5."""
    found = set()
    for raw in re.findall(r"\d[\d.,]*\d|\d", text):
        if re.fullmatch(r"\d{1,3}([.,]\d{3}){2,}", raw):
            found.add(int(re.sub(r"\D", "", raw)) / 1_000_000)
        elif re.fullmatch(r"\d+([.,]\d+)?", raw):
            found.add(float(raw.replace(",", ".")))
    return found


def _stated_day(day: date, quote: str) -> bool:
    dates = re.finditer(rf"(?<!\d)0?{day.day}[/.-]0?{day.month}(?:[/.-](\d{{4}}))?(?!\d)", quote)
    return any(not match[1] or int(match[1]) == day.year for match in dates)


def _is_buy_price_of_a_pair(price: float, quote: str) -> bool:
    """Articles write "mua vào - bán ra" as 79-81,5, with the buying price first."""
    for first, _ in re.findall(r"(\d[\d.,]*\d)\s*(?:triệu đồng|million)?\s*[-–]\s*[^\d\s]*(\d[\d.,]*\d)", quote):
        if any(abs(number - price) < 0.001 for number in _numbers(first)):
            return True
    return False


def is_verified_report(report: ReportedPrice, page: Page | None, today: date) -> bool:
    """A model read this price, so it only counts if the article's own words show it. Anything doubtful is dropped."""
    day = _event_day(report.date, today)
    quote = report.quote
    if day is None or page is None or not quote or not quote_in_text(quote, page.text):
        return False
    # A bare day/month cannot supply an unknown year, or silently move a price into another year.
    full_date = re.search(rf"(?<!\d)0?{day.day}[/.-]0?{day.month}[/.-]{day.year}(?!\d)", quote)
    if re.search(r"(?<!\d)\d{1,2}[/.-]\d{1,2}[/.-]\d{4}(?!\d)", quote) and not full_date:
        return False
    if not full_date and (not page.published_at or page.published_at[:4] != str(day.year)):
        return False
    lowered = quote.lower()
    if "sjc" not in lowered or not re.search(r"bán|sell", lowered) or UNTRACKED_PRICE_WORDS.search(quote):
        return False
    if OTHER_SELLERS.search(quote):
        return False
    if not any(abs(number - report.sell_price) < 0.001 for number in _numbers(quote)):
        return False
    if _is_buy_price_of_a_pair(report.sell_price, quote):
        return False
    return report.date == page.published_at or _stated_day(day, quote)


def _search_months(item: ExtractedClaim, today: date, settings: Settings) -> list[date]:
    """The months to search, ending shortly after the claim's date or at today, newest first."""
    events = _events(item, today, settings)
    anchor = min(today, max((day for day, _ in events), default=today) + timedelta(days=45))
    months: list[date] = []
    year, month = anchor.year, anchor.month
    for _ in range(settings.sjc_chart_search_months):
        months.append(date(year, month, 1))
        year, month = (year - 1, 12) if month == 1 else (year, month - 1)
    return months


def build_sjc_chart(
    item: ExtractedClaim,
    search: Search,
    fetch: Callable[[str], Page],
    llm: LLM,
    settings: Settings,
    pool: ThreadPoolExecutor,
    tasks: TaskLog = NO_TASKS,
) -> dict | None:
    """SJC's official page and dated reports, with a source behind each price. Never substitutes the world price."""
    if item.price_asset != "sjc_gold":
        return None
    if not is_price_claim(item.text, "sjc_gold"):
        tasks.chart_skipped("price")
        return None
    now = utcnow()
    today = now.date()

    def find(month: date) -> tuple[list[SearchHit], str | None]:
        try:
            query = f"giá vàng miếng SJC niêm yết bán ra triệu đồng lượng tháng {month.month}/{month.year}"
            search_hits = getattr(search, "search_hits", None)
            hits = search_hits(query, domains=list(SJC_DOMAINS), newest_first=False) if search_hits else [
                SearchHit(url) for url in search.search(query)
            ]
            return [hit for hit in hits if within_domains(hit.url, SJC_DOMAINS)], None
        except SearchError as error:
            logger.warning("SJC price search failed: %s", error)
            return [], str(error)

    def read(hit: SearchHit) -> Page | None:
        page = read_hit(hit, fetch, settings)
        # A redirect can leave both the green list and this chart's narrower source list.
        return page if page and within_domains(page.url, SJC_DOMAINS) else None

    search_task = tasks.search("sjc-search", "chart_sources")
    results = list(pool.map(find, _search_months(item, today, settings)))
    hits = {source_url_key(url): SearchHit(url) for url in SJC_PAGES}
    for found, _ in results:
        for hit in found[: settings.sjc_election_dates_per_month]:
            key = source_url_key(hit.url)
            # Keep Tavily's full-page text if it also found the official page and the direct reader is blocked.
            if key not in hits or hit.raw_content:
                hits[key] = hit
    pages = [page for page in pool.map(read, hits.values()) if page]
    if not pages:
        errors = [error for _, error in results if error]
        search_task.fail(errors[0] if errors else NO_READABLE_SOURCE)
        return None
    search_task.finish(sourceCount=len(pages), searchCount=len(results))

    labels = {f"E{index + 1}": page for index, page in enumerate(pages)}
    prompt = "\n\n".join(
        tagged(
            "passage",
            top_passages(page.text, "giá vàng SJC bán ra triệu đồng/lượng", settings.passages_per_source),
            evidence_id=label,
            published=page.published_at or "unknown",
        )
        for label, page in labels.items()
    )
    read_task = tasks.model("sjc-prices", "reading_prices", settings.research_model, settings)
    try:
        answer, model = llm.complete(settings.research_model, SJC_PRICES_SYSTEM, prompt, ReportedPrices)
    except LLMError as error:
        logger.warning("SJC price reading failed: %s", error)
        read_task.fail(error.public_message)
        return None

    # When reports disagree about a day, the first one kept stands, so a chart never shows two prices for a day.
    reports: dict[str, tuple[ReportedPrice, Page]] = {}
    for report in sorted(answer.prices, key=lambda report: not (
        labels.get(report.evidence_id) and within_domains(labels[report.evidence_id].url, ("sjc.com.vn",))
    )):
        page = labels.get(report.evidence_id)
        if is_verified_report(report, page, today):
            reports.setdefault(report.date, (report, page))
    if len(reports) < 2:
        read_task.finish_model(model, settings, summary=NOT_ENOUGH_VERIFIED)
        return None
    read_task.finish_model(model, settings)
    ordered = sorted(reports.items())
    return {
        "asset": "sjc_gold",
        "currency": "VND",
        "source": "news",
        "unit": "VND/tael",
        "priceType": "selling",
        "retrievedAt": now.isoformat(),
        "prices": [
            [
                int(datetime.fromisoformat(day).replace(tzinfo=UTC).timestamp() * 1000),
                round(report.sell_price * 1_000_000),
            ]
            for day, (report, _) in ordered
        ],
        "events": _event_out(_events(item, today, settings)),
        "reports": [
            {"date": day, "publisher": page.publisher or page.title, "title": page.title, "url": page.url,
             "quote": report.quote, "publishedAt": page.published_at}
            for day, (report, page) in ordered
        ],
    }


ASSET_NAMES = {
    "bitcoin": "Bitcoin",
    "ethereum": "Ethereum",
    "gold": "World gold price",
    "silver": "World silver price",
    "oil": "Brent crude oil",
    "sjc_gold": "SJC gold bar selling price in Vietnam",
    "usd_vnd": "US dollar in Vietnamese dong, market exchange rate (not a bank's or the State Bank's rate)",
}


def price_table(chart: dict | None, recent_days: int = 60) -> str | None:
    """The chart's prices as dated lines for the judges.

    Keep daily prices near the claim's events and in the recent window, plus monthly context elsewhere.
    """
    if not chart or len(chart.get("prices") or []) < 2:
        return None
    days = [(datetime.fromtimestamp(stamp / 1000, UTC).date(), price) for stamp, price in chart["prices"]]
    cutoff = days[-1][0] - timedelta(days=recent_days)
    event_days = [_event_day(event["date"], days[-1][0]) for event in chart.get("events", [])]
    seen_months: set[tuple[int, int]] = set()
    lines = []
    for day, price in days:
        month = (day.year, day.month)
        if day >= cutoff or month not in seen_months or any(event and abs((day - event).days) <= 7 for event in event_days):
            figure = f"{price:,.2f}"
            lines.append(f"{day.isoformat()}: {figure.removesuffix('.00')}")
        seen_months.add(month)
    unit = chart.get("unit") or f"{chart.get('currency', 'USD')}"
    kind = "selling prices reported in the news" if chart.get("source") == "news" else "daily closing prices"
    head = f"{ASSET_NAMES.get(chart.get('asset'), chart.get('asset'))}, {kind}, in {unit}. Source: {chart.get('source')}."
    return "\n".join([head, *lines])

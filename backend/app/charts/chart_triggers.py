"""Turns on a claim's chart when its own words clearly call for one and the extraction model left the field empty.

The chart's own checks and sources still decide what gets drawn. This only makes sure a clear claim gets the chance.
"""

import re

from ..pipeline.prompts import (
    CountryStatRequest,
    ElectionMapRequest,
    ExtractedClaim,
    MapPlace,
    PopulationPyramidRequest,
    SeatChartRequest,
)
from .country_map import STAT_WORDS, is_age_claim, is_stat_claim
from .election_map import is_us_election_claim
from .location_map import PLACES
from .price_chart import ASSET_WORDS, is_price_claim
from .seat_chart import is_election_claim

CHAMBER = re.compile(
    r"((?:[A-Z][\w'’.-]*\s+)*"
    r"(?:House of Representatives|House of Commons|Lok Sabha|Bundestag|National Assembly|Parliament|Senate)"
    r"|(?:Hạ viện|Thượng viện|Quốc hội)(?:\s+[A-ZĐ][\w'’-]*)*)"
)
YEAR = re.compile(r"(?<!\d)(?:19|20)\d{2}(?!\d)")
COUNTRY_ALIASES = {
    "Việt Nam": "vn",
    "United States": "us",
    "Mỹ": "us",
    "Hoa Kỳ": "us",
    "UK": "gb",
    "Britain": "gb",
    "Trung Quốc": "cn",
    "Ấn Độ": "in",
}


def _single_year(text: str) -> int | None:
    years = set(YEAR.findall(text))
    return int(years.pop()) if len(years) == 1 else None


def _named_countries(text: str) -> list[MapPlace]:
    names = {name: code for code, name in PLACES["countries"].items()} | COUNTRY_ALIASES
    found: dict[str, MapPlace] = {}
    for name, code in names.items():
        if re.search(rf"(?<!\w){re.escape(name)}(?!\w)", text):
            found.setdefault(code, MapPlace(name=name, country=code.upper()))
    return list(found.values())


def add_chart_requests(item: ExtractedClaim) -> ExtractedClaim:
    """Only fills empty fields, so the model's own choices always stand."""
    text = item.text
    year = _single_year(f"{text} {item.time_context or ''}")
    if item.price_asset is None:
        # SJC first, because it also says gold, and has a price of its own.
        assets = ("sjc_gold", *(name for name in ASSET_WORDS if name != "sjc_gold"))
        item.price_asset = next((asset for asset in assets if is_price_claim(text, asset)), None)
    if item.seat_chart is None and (chamber := CHAMBER.search(text)) and is_election_claim(text, chamber.group(1)):
        item.seat_chart = SeatChartRequest(body=chamber.group(1), year=year)
    if item.election_map is None and year:
        # Don't use the presidential year heuristic here. Prefer the House for a claim about both chambers.
        office = next(
            (name for name in ("house", "senate", "president") if is_us_election_claim(text, name, topic=item.topic)),
            None,
        )
        if office:
            item.election_map = ElectionMapRequest(office=office, year=year)
    if item.population_pyramid is None and item.heat_map is None and is_age_claim(text):
        # The chart shows one country, so a comparison gets none.
        countries = _named_countries(text)
        if len(countries) == 1:
            item.population_pyramid = PopulationPyramidRequest(name=countries[0].name, country=countries[0].country, year=year)
    if item.country_stat is None and item.heat_map is None and item.population_pyramid is None:
        indicator = next((name for name in STAT_WORDS if is_stat_claim(text, name)), None)
        countries = _named_countries(text) if indicator else []
        if countries:
            item.country_stat = CountryStatRequest(indicator=indicator, countries=countries, year=year)
    return item

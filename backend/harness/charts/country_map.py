"""Builds a claim's country map, only for a claim stating a national statistic of a place it names.

A model names the statistic, the countries and the year. The values come from the World Bank, and are saved with the
claim. The map is context, so judges never see it.
"""

import logging
import re

from config.settings import Settings
from database.models import utcnow

from ..pipeline.progress import NO_TASKS, NOT_ENOUGH_DATA, TaskLog
from ..pipeline.prompts import ExtractedClaim
from .data_sources import WORLD_BANK_INDICATORS, CountryData, CountryDataError, StateData, StateDataError
from .location_map import PLACES, STATE_BY_NAME, _folded

logger = logging.getLogger(__name__)

WORLD_CODE = "WLD"
WORLD_WORDS = re.compile(r"(?<!\w)(world|global|globally|earth|planet|thế giới|toàn cầu|trái đất|địa cầu)(?!\w)", re.IGNORECASE)
GDP_WORDS = r"gdp|gross domestic product|tổng sản phẩm|tổng sản phẩm quốc nội"
STAT_WORDS = {
    "population": re.compile(
        r"(?<!\w)(population|populous|inhabitants|dân số|triệu dân|đông dân|ít dân)(?!\w)"
        r"|\d\s*(million|billion|triệu|tỷ)\s*(people|residents|người|dân)(?!\w)",
        re.IGNORECASE,
    ),
    "gdp": re.compile(rf"(?<!\w)({GDP_WORDS})(?!\w)", re.IGNORECASE),
    "gdp_per_capita": re.compile(
        rf"(?<!\w)({GDP_WORDS}|income)(?!\w).*(?<!\w)(per capita|per person|bình quân đầu người)(?!\w)|"
        rf"(?<!\w)(per capita|per person|bình quân đầu người)(?!\w).*(?<!\w)({GDP_WORDS}|income)(?!\w)",
        re.IGNORECASE,
    ),
    "life_expectancy": re.compile(r"(?<!\w)(life expectancy|tuổi thọ)(?!\w)", re.IGNORECASE),
}
AGE_STRUCTURE_WORDS = re.compile(
    r"(?<!\w)(population pyramid|age structure|ag(?:e)?ing population|population (?:is )?ag(?:e)?ing|median age|sex ratio"
    r"|gender imbalance|working[- ]age|tháp dân số|cơ cấu (?:dân số|tuổi)|già hóa|già hoá|dân số già|dân số vàng"
    r"|tuổi trung vị|t[ỷỉ] số giới tính|mất cân bằng giới tính)(?!\w)",
    re.IGNORECASE,
)
# A group of people by age only describes the population when the claim also gives its size.
AGE_GROUP_WORDS = re.compile(
    r"(?<!\w)(elderly|older people|aged \d+|(?:over|under) (?:the age of )?\d+|people \d+ and over"
    r"|người cao tuổi|người già|(?:trên|dưới|từ) \d+ tuổi)(?!\w)",
    re.IGNORECASE,
)
AGE_SIZE_WORDS = re.compile(
    r"%|(?<!\w)(percent|per cent|share|proportion|million|billion|phần trăm|t[ỷỉ] lệ|chiếm|triệu|tỷ người)(?!\w)", re.IGNORECASE
)


def is_stat_claim(text: str, indicator: str) -> bool:
    """The model's choice must hold up in the claim's own words, so a stray guess draws nothing."""
    return indicator in STAT_WORDS and bool(STAT_WORDS[indicator].search(text))


def is_age_claim(text: str) -> bool:
    """Whether the claim is about how a population divides by age or sex."""
    return bool(AGE_STRUCTURE_WORDS.search(text) or (AGE_GROUP_WORDS.search(text) and AGE_SIZE_WORDS.search(text)))


def _named_countries(item: ExtractedClaim) -> list[dict]:
    """Only countries the claim itself names, and that the map and the data both have."""
    named: dict[str, dict] = {}
    for place in item.country_stat.countries:
        code = place.country.lower()
        if place.name.strip() and place.name.lower() in item.text.lower() and code in PLACES["iso3"]:
            named.setdefault(code, {"code": code, "name": PLACES["countries"][code], "named": place.name})
    return list(named.values())


def _rounded(indicator: str, value: float) -> float:
    return round(value) if indicator in ("population", "gdp") else round(value, 2)


def _named_states(item: ExtractedClaim) -> list[dict]:
    """US states the claim itself names, and that the map has."""
    named: dict[str, dict] = {}
    for place in item.country_stat.countries:
        region = (place.region or "").strip()
        code = STATE_BY_NAME.get(_folded(region)) if region and region.lower() in item.text.lower() else None
        if code:
            named.setdefault(code, {"code": code, "name": PLACES["us_states"][code], "named": region})
    return list(named.values())


def _build_state_map(item: ExtractedClaim, data: StateData | None, settings: Settings, tasks: TaskLog) -> dict | None:
    """Population by US state. Other statistics have no state data, and the whole country's figure would mislead."""
    request = item.country_stat
    selected = _named_states(item)
    if data is None or request.indicator != "population" or not selected:
        return None
    now = utcnow()
    task = tasks.chart_data("state", data.name)
    try:
        found = data.population_by_state()
    except StateDataError as error:
        logger.warning("%s: %s", data.name, error)
        task.fail(str(error))
        return None
    years = sorted({year for values in found.values() for year in values})
    values = {
        code: [round(found[name][year]) if year in found.get(name, {}) else None for year in years]
        for code, name in PLACES["us_states"].items()
        if name in found
    }
    selected = [place for place in selected if place["code"] in values]
    if not selected or len(values) < settings.state_map_min_states:
        task.finish(summary=NOT_ENOUGH_DATA)
        return None
    task.finish()
    return {
        "scope": "us-states",
        "indicator": "population",
        "source": data.name,
        "retrievedAt": now.isoformat(),
        "year": request.year if request.year in years else years[-1],
        "years": years,
        "values": values,
        "selected": selected,
    }


def build_population_pyramid(
    item: ExtractedClaim, data: CountryData | None, settings: Settings, tasks: TaskLog = NO_TASKS
) -> dict | None:
    """One country's people by age and sex. A failure only costs the chart, so the check itself carries on."""
    request = item.population_pyramid
    if data is None or request is None:
        return None
    code = request.country.lower()
    named = request.name.strip() and request.name.lower() in item.text.lower()
    if not is_age_claim(item.text) or not named or code not in PLACES["iso3"]:
        tasks.chart_skipped("pyramid")
        return None
    now = utcnow()
    end = request.year if request.year and 1960 <= request.year <= now.year else now.year
    task = tasks.chart_data("pyramid", data.name)
    try:
        # The latest years can still be missing, so a few before them are asked for too.
        found = data.population_by_age(PLACES["iso3"][code], end - settings.population_pyramid_years_back, end)
    except CountryDataError as error:
        logger.warning("%s: %s", data.name, error)
        task.fail(str(error))
        return None
    if not found:
        task.finish(summary=NOT_ENOUGH_DATA)
        return None
    task.finish()
    year = max(found)
    men, women = found[year]
    return {
        "country": code,
        "named": request.name,
        "year": year,
        "source": data.name,
        "retrievedAt": now.isoformat(),
        "men": [round(value) for value in men],
        "women": [round(value) for value in women],
    }


def build_country_map(
    item: ExtractedClaim,
    data: CountryData | None,
    settings: Settings,
    state_data: StateData | None = None,
    tasks: TaskLog = NO_TASKS,
) -> dict | None:
    """A failure only costs the map, so the check itself carries on."""
    request = item.country_stat
    if request is None:
        return None
    if not is_stat_claim(item.text, request.indicator):
        tasks.chart_skipped("country")
        return None
    # A claim about a US state is about that state, never the whole country's figure.
    if any(place.country.lower() == "us" and place.region for place in request.countries):
        return _build_state_map(item, state_data, settings, tasks)
    if data is None or request.indicator not in WORLD_BANK_INDICATORS:
        return None
    selected = _named_countries(item)
    if not selected and not WORLD_WORDS.search(item.text):
        tasks.chart_skipped("country")
        return None

    now = utcnow()
    asked = request.year if request.year and 1960 <= request.year <= now.year else None
    start = (asked or now.year) - settings.country_map_years
    task = tasks.chart_data("country", data.name)
    try:
        found = data.by_country(request.indicator, start, now.year)
    except CountryDataError as error:
        logger.warning("%s: %s", data.name, error)
        task.fail(str(error))
        return None
    years = sorted({year for values in found.values() for year in values})
    if not years:
        task.finish(summary=NOT_ENOUGH_DATA)
        return None
    values = {
        code: [_rounded(request.indicator, found[iso3][year]) if year in found.get(iso3, {}) else None for year in years]
        for code, iso3 in {**PLACES["iso3"], "world": WORLD_CODE}.items()
        if iso3 in found
    }
    selected = [place for place in selected if place["code"] in values]
    # A map with almost nothing on it, or nothing to point at, would mislead more than it helps.
    if len(values) < settings.country_map_min_countries or (not selected and not WORLD_WORDS.search(item.text)):
        task.finish(summary=NOT_ENOUGH_DATA)
        return None
    task.finish()
    return {
        "indicator": request.indicator,
        "source": data.name,
        "retrievedAt": now.isoformat(),
        "year": asked if asked in years else years[-1],
        "years": years,
        "values": values,
        "selected": selected,
    }

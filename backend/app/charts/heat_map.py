"""Builds a claim's heatmap, only for a claim about the temperature or rainfall over an area on certain days.

A model names the metric, the area and the dates. The values come from climate data, and are saved with the claim.
A heatmap is context from a weather model, not measurements at stations, so judges never see it.
"""

import logging
import math
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

from ..core.config import Settings
from ..db.models import utcnow
from ..pipeline.progress import NO_TASKS, NOT_ENOUGH_DATA, TaskLog
from ..pipeline.prompts import ExtractedClaim
from .data_sources import ClimateData, ClimateError
from .location_map import PLACES, VIETNAM

logger = logging.getLogger(__name__)

WORLD = "world"
HEAT_PERIOD_UNUSABLE = "Climate data doesn't cover these dates yet, or the period is too long to draw."
METRIC_WORDS = {
    "temperature": re.compile(
        r"(?<!\w)(temperatures?|heat ?waves?|hottest|warmest|coldest|hot|nhiệt độ|nắng nóng|nóng nhất|rét|độ c)(?!\w)|°c",
        re.IGNORECASE,
    ),
    "rainfall": re.compile(r"(?<!\w)(rain|rains|rainfall|downpours?|mưa|lượng mưa)(?!\w)", re.IGNORECASE),
}
WORLD_WORDS = re.compile(r"(?<!\w)(world|global|globally|earth|planet|thế giới|toàn cầu|trái đất|địa cầu)(?!\w)", re.IGNORECASE)
# Vietnam's view takes in the sea as far as Trường Sa, as the location map's does.
VIETNAM_AREA = (102.0, 7.0, 118.0, 24.0)
# How far around a country's middle the grid reaches, in degrees of longitude and latitude.
COUNTRY_MARGIN = (10.0, 7.5)


def is_heat_claim(text: str, metric: str, area: str, area_name: str) -> bool:
    """The model's choice must hold up in the claim's own words, so a stray guess draws nothing."""
    if metric not in METRIC_WORDS or not METRIC_WORDS[metric].search(text):
        return False
    if area == WORLD:
        return bool(WORLD_WORDS.search(text))
    return area in PLACES["centers"] and bool(area_name.strip()) and area_name.lower() in text.lower()


def _bounds(area: str) -> tuple[float, float, float, float]:
    if area == WORLD:
        return (-180.0, -72.0, 162.0, 72.0)
    if area == VIETNAM:
        return VIETNAM_AREA
    lon, lat = PLACES["centers"][area]
    return (
        max(lon - COUNTRY_MARGIN[0], -180),
        max(lat - COUNTRY_MARGIN[1], -85),
        min(lon + COUNTRY_MARGIN[0], 180),
        min(lat + COUNTRY_MARGIN[1], 85),
    )


def _grid(area: str, settings: Settings) -> tuple[float, list[float], list[float]]:
    step = settings.heat_map_step_world if area == WORLD else settings.heat_map_step_area
    west, south, east, north = _bounds(area)
    # Highcharts moves any point that isn't a whole number of steps from zero, which would draw values in the wrong place.
    west, south = math.ceil(west / step) * step, math.ceil(south / step) * step
    lats, lons = [], []
    for row in range(int((north - south) / step) + 1):
        for column in range(int((east - west) / step) + 1):
            lats.append(round(south + row * step, 2))
            lons.append(round(west + column * step, 2))
    return step, lats, lons


def sample_days(start: date, end: date, count: int) -> list[date]:
    """Up to `count` days, evenly across the period. Asking for every day of a month over a grid takes minutes."""
    length = (end - start).days
    if length < count:
        return [start + timedelta(days=index) for index in range(length + 1)]
    return [start + timedelta(days=round(index * length / (count - 1))) for index in range(count)]


def _period(start: str, end: str, today: date, settings: Settings) -> tuple[date, date] | None:
    try:
        first, last = date.fromisoformat(start), date.fromisoformat(end)
    except ValueError:
        return None
    # The reanalysis arrives some days late, so a very recent day has no data yet.
    if first > last or last > today - timedelta(days=settings.heat_map_delay_days) or first.year < 1950:
        return None
    return (first, last) if (last - first).days < settings.heat_map_max_days else None


def build_heat_map(
    item: ExtractedClaim, climate: ClimateData | None, settings: Settings, pool: ThreadPoolExecutor, tasks: TaskLog = NO_TASKS
) -> dict | None:
    """A failure only costs the heatmap, so the check itself carries on."""
    request = item.heat_map
    if climate is None or request is None:
        return None
    area = WORLD if request.area.upper() == "WORLD" else request.area.lower()
    if not is_heat_claim(item.text, request.metric, area, request.area_name):
        tasks.chart_skipped("heat")
        return None
    now = utcnow()
    period = _period(request.start, request.end, now.date(), settings)
    if period is None:
        tasks.chart_skipped("heat", HEAT_PERIOD_UNUSABLE)
        return None
    days = sample_days(*period, settings.heat_map_sample_days)
    step, lats, lons = _grid(area, settings)
    size = settings.heat_map_points_per_request
    parts = [(day, start) for day in days for start in range(0, len(lats), size)]

    def fetch(part: tuple[date, int]) -> list[float | None]:
        day, start = part
        return climate.day_values(request.metric, day, lats[start : start + size], lons[start : start + size])

    task = tasks.chart_data("heat", climate.name)
    try:
        answers = list(pool.map(fetch, parts))
    except ClimateError as error:
        logger.warning("%s: %s", climate.name, error)
        task.fail(str(error))
        return None
    per_day = len(answers) // len(days)
    by_day = [
        [value for answer in answers[index * per_day : (index + 1) * per_day] for value in answer] for index in range(len(days))
    ]
    points = []
    for index, (lat, lon) in enumerate(zip(lats, lons, strict=True)):
        values = [values_of_day[index] for values_of_day in by_day if values_of_day[index] is not None]
        if values:
            points.append([lon, lat, round(sum(values) / len(values), 1)])
    # A map that is mostly holes would mislead more than it helps.
    if len(points) < len(lats) * settings.heat_map_min_coverage:
        task.finish(summary=NOT_ENOUGH_DATA)
        return None
    task.finish()
    return {
        "metric": request.metric,
        "area": area,
        "areaName": request.area_name,
        "start": period[0].isoformat(),
        "end": period[1].isoformat(),
        "days": [day.isoformat() for day in days],
        "step": step,
        "source": climate.name,
        "retrievedAt": now.isoformat(),
        "points": points,
    }

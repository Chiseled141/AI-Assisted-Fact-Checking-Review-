"""Place source-confirmed route stops on the map and measure the connecting arcs."""

import logging
import re
from math import asin, cos, radians, sin, sqrt

import httpx

from ..core.config import Settings
from ..db.models import Evidence, Source
from ..pipeline.passages import quote_in_text, top_passages
from ..pipeline.progress import NOT_ENOUGH_DATA, NOT_ENOUGH_VERIFIED, TaskLog
from ..pipeline.prompts import ROUTE_MAP_SYSTEM, ReportedRoute, ReportedRouteMap, tagged
from ..providers.llm import LLM, LLMError
from .location_map import _folded, photon_features

logger = logging.getLogger(__name__)
Position = tuple[float, float]


def _stop_position(name: str, country: str | None, settings: Settings) -> Position | None:
    name_key = _folded(name)
    filters = {"countrycode": country} if country else {}
    matches = []
    settlements = []
    try:
        # Sources also use English names where the geocoder normally returns a local name.
        for language in ({}, {"lang": "en"}):
            for feature in photon_features(name, settings, limit=8, **filters, **language):
                props, geometry = feature["properties"], feature["geometry"]
                if country and props.get("countrycode") != country:
                    continue
                if _folded(props.get("name") or "") != name_key or geometry["type"] != "Point":
                    continue
                lon, lat = geometry["coordinates"]
                if -180 <= lon <= 180 and -90 <= lat <= 90:
                    matches.append((lon, lat))
                    if props.get("type") in ("city", "town", "village", "hamlet"):
                        settlements.append((lon, lat))
            if matches:
                break
    except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError) as error:
        logger.info("Route stop lookup failed (%s)", type(error).__name__)
        return None
    # A city and the surrounding county may have exactly the same name.
    matches = settlements or matches
    if not matches:
        return None
    lon, lat = matches[0]
    # Repeated OSM features in the same place are common. Distant same-name places are ambiguous.
    if any(max(abs(lon - x), abs(lat - y)) > 0.025 for x, y in matches):
        return None
    return lon, lat


def _arc_km(start: Position, end: Position) -> float:
    lon1, lat1 = map(radians, start)
    lon2, lat2 = map(radians, end)
    half_chord = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371.0088 * asin(sqrt(min(1, max(0, half_chord))))


def _verified_stops(report: ReportedRoute, source: Source) -> list[dict] | None:
    remaining = " ".join(report.quote.split())
    if not report.title.strip() or not quote_in_text(remaining, source.text):
        return None
    stops = []
    for stop in report.stops:
        name = " ".join(stop.name.split())
        label = rf"(?<!\w){re.escape(name)}(?!\w)"
        match = re.search(label, remaining, re.IGNORECASE) if name else None
        if not match:
            return None
        remaining = remaining[match.end():]
        entry = {"name": name, "country": stop.country}
        schedule = " ".join((stop.schedule or "").split())
        schedule_quote = " ".join((stop.schedule_quote or "").split())
        if schedule and quote_in_text(schedule_quote, source.text) and re.search(label, schedule_quote, re.IGNORECASE):
            if re.search(rf"(?<!\w){re.escape(schedule)}(?!\w)", schedule_quote):
                entry["schedule"] = schedule
        stops.append(entry)
    return stops


def build_route_map(claim: str, evidence: list[Evidence], llm: LLM, settings: Settings, tasks: TaskLog) -> dict | None:
    if not evidence or not settings.incident_map_photon_url:
        return None
    sources = {f"E{index + 1}": item.source for index, item in enumerate(evidence)}
    prompt = "\n\n".join([
        tagged("input", claim, type="claim"),
        *(tagged("passage", top_passages(source.text, claim, 4), evidence_id=key) for key, source in sources.items()),
    ])
    task = tasks.model("route-stops", "reading_route", settings.research_model, settings)
    try:
        answer, model = llm.complete(settings.research_model, ROUTE_MAP_SYSTEM, prompt, ReportedRouteMap)
    except LLMError as error:
        logger.warning("Reading route stops failed: %s", error)
        task.fail(error.public_message)
        return None
    report = answer.route
    source = sources.get(report.evidence_id) if report else None
    stops = _verified_stops(report, source) if report and source else None
    if not stops or not report or not source:
        task.finish_model(model, settings, summary=NOT_ENOUGH_VERIFIED)
        return None
    task.finish_model(model, settings)

    geocode = tasks.chart_data("route", "Photon / OpenStreetMap")
    resolved: dict[tuple[str, str | None], Position] = {}
    positions = []
    for stop in stops:
        key = stop["name"], stop.pop("country")
        position = resolved.get(key) or _stop_position(*key, settings)
        if position is None or (positions and position == positions[-1]):
            geocode.finish(summary=NOT_ENOUGH_DATA)
            return None
        resolved[key] = position
        positions.append(position)
        stop["position"] = position
    geocode.finish()
    return {
        "title": report.title.strip(),
        "stops": stops,
        "straightLineKm": round(sum(_arc_km(start, end) for start, end in zip(positions, positions[1:])), 1),
        "publisher": source.publisher or source.title,
        "url": source.url,
    }

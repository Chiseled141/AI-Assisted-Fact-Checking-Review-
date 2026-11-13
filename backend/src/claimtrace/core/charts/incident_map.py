"""Locate a reported traffic incident using source quotes and OpenStreetMap."""

import json
import logging
import re
from collections.abc import Sequence
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx

from claimtrace.config.settings import Settings
from claimtrace.db.models import Evidence

from ..pipeline.passages import quote_in_text, top_passages
from ..pipeline.progress import NO_TASKS, NOT_ENOUGH_DATA, TaskLog
from ..pipeline.prompts import INCIDENT_MAP_SYSTEM, IncidentLocations, ReportedIncidentArea, tagged
from ..providers.llm import LLM, LLMError
from .location_map import _folded, photon_features

logger = logging.getLogger(__name__)

TRAFFIC_INCIDENT = re.compile(
    r"\b(tai nạn|va chạm|tông nhau|tông vào|ùn tắc|kẹt xe|tắc đường|cấm đường|cấm xe|đóng đường|"
    r"hạn chế giao thông|phân luồng|phong tỏa|crash(?:es)?|collision|accident|traffic jam|road closure|road closed)\b",
    re.IGNORECASE,
)
REGIONAL_EVENT = re.compile(r"\b(ngập(?: lụt)?|cháy|lễ hội|sự kiện|flood(?:ing)?|fire|festival)\b", re.I)
LOCAL_AREA = re.compile(
    r"\b(hà nội|hanoi|sài gòn|saigon|hồ chí minh|tphcm|tp\.?\s*hcm|hồ|vành đai|phường|quận|huyện|xã|khu vực|ward|district)\b",
    re.I,
)
JUNCTION_WORDS = re.compile(r"\b(giao lộ|giao cắt|giao nhau|nút giao|ngã (ba|tư|năm|sáu)|intersection|junction)\b", re.I)
CITY_NAMES = {
    "hanoi": ("VN-HN", "Hà Nội"),
    "hochiminh": ("VN-SG", "Hồ Chí Minh"),
    "hochiminhcity": ("VN-SG", "Hồ Chí Minh"),
    "saigon": ("VN-SG", "Hồ Chí Minh"),
    "tphcm": ("VN-SG", "Hồ Chí Minh"),
    "hcm": ("VN-SG", "Hồ Chí Minh"),
}
ROAD_PREFIX = re.compile(r"^(đường|phố)\s+", re.IGNORECASE)
ROAD_NAME = re.compile(r"[\w ./'’()\-–]{1,100}")
DISTRICT_PREFIX = re.compile(r"^(phường|quận|huyện|xã)\s+", re.IGNORECASE)
RING_ROAD = re.compile(
    r"^(?:(?:đường\s+)?cao tốc\s+|đường\s+)?(vành đai\s+\d+(?:[.,]\d+)?)(?:\s+(?:tp\.?\s*)?hà nội)?$", re.I,
)
AREA_ALIASES = {"hoguom": "Hồ Hoàn Kiếm"}
WHOLE_ROAD = re.compile(r"\b(toàn (tuyến|bộ tuyến đường|bộ đường)|suốt chiều dài|entire (road|street)|full length)\b", re.I)
CARDINALS = {
    "north": (0, 1), "bac": (0, 1), "south": (0, -1), "nam": (0, -1),
    "east": (1, 0), "dong": (1, 0), "west": (-1, 0), "tay": (-1, 0),
    "northeast": (1, 1), "dongbac": (1, 1), "southeast": (1, -1), "dongnam": (1, -1),
    "northwest": (-1, 1), "taybac": (-1, 1), "southwest": (-1, -1), "taynam": (-1, -1),
}
HTTP_HEADERS = {"User-Agent": "ClaimTrace/0.1"}
Position = tuple[float, float]
Bounds = tuple[float, float, float, float]


def _coordinate(lon: float, lat: float) -> Position:
    lon, lat = float(lon), float(lat)
    if not (-180 <= lon <= 180 and -90 <= lat <= 90):
        raise ValueError("Invalid coordinates")
    return lon, lat


def _bounds(points: Sequence[Position]) -> Bounds:
    return min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points)


def _distance(a: Position, b: Position) -> float:
    # A small difference in degrees is enough to distinguish nearby map features within these cities.
    return max(abs(a[0] - b[0]), abs(a[1] - b[1]))


def _intersection(roads: list[str], city_code: str, settings: Settings) -> Position | None:
    if not settings.incident_map_overpass_url:
        return None
    # Intersect the node sets of two named roads. Separate levels of an interchange need a shared node to match.
    road_patterns = [
        json.dumps(r"^(Đường |Phố )?" + re.escape(ROAD_PREFIX.sub("", name)).replace(r"\ ", " ") + "$", ensure_ascii=False)
        for name in roads
    ]
    query = (
        '[out:json][timeout:4][maxsize:16777216];'
        f'area["ISO3166-2"="{city_code}"]["admin_level"="4"]->.city;'
        f'way(area.city)["highway"]["name"~{road_patterns[0]},i]->.a;'
        f'way(area.city)["highway"]["name"~{road_patterns[1]},i]->.b;'
        'node(w.a)->.an;node(w.b)->.bn;node.an.bn;out skel 32;'
    )
    try:
        response = httpx.get(
            settings.incident_map_overpass_url, params={"data": query}, headers=HTTP_HEADERS,
            timeout=settings.incident_map_timeout_seconds,
        )
        response.raise_for_status()
        data = response.json()
        if data.get("remark") or len(data["elements"]) >= 32:
            return None
        points = [_coordinate(node["lon"], node["lat"]) for node in data["elements"]]
    except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError) as error:
        logger.info("Incident junction lookup failed (%s)", type(error).__name__)
        return None
    if not points or any(_distance(points[0], point) > 0.001 for point in points):
        return None
    center = tuple(sum(point[axis] for point in points) / len(points) for axis in (0, 1))
    return min(points, key=lambda point: _distance(point, center))


def _photon(query: str, settings: Settings, **filters: str) -> list[dict]:
    return photon_features(query, settings, countrycode="VN", limit=15, **filters)


def _in_city(props: dict, city: tuple[str, str]) -> bool:
    return props.get("countrycode") == "VN" and any(
        CITY_NAMES.get(_folded(props.get(key) or "")) == city for key in ("city", "state")
    )


def _landmark(destination: str, city: tuple[str, str], settings: Settings) -> Position | None:
    names = {_folded(destination)}
    if re.match(r"^(ngã (ba|tư|năm|sáu)|nút giao)\b", destination, re.I):
        names.add(_folded(f"Cầu vượt {destination}"))
    try:
        points = [
            _coordinate(*feature["geometry"]["coordinates"])
            for feature in _photon(f"{destination}, {city[1]}", settings)
            if _in_city(feature["properties"], city)
            and _folded(feature["properties"].get("name") or "") in names
        ]
    except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError) as error:
        logger.info("Incident landmark lookup failed (%s)", type(error).__name__)
        return None
    if not points or any(_distance(points[0], point) > 0.005 for point in points):
        return None
    return sum(point[0] for point in points) / len(points), sum(point[1] for point in points) / len(points)


def _direction_target(destination: str, city: tuple[str, str], bounds: Bounds, settings: Settings) -> Position | None:
    center = ((bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2)
    if cardinal := CARDINALS.get(_folded(destination)):
        return center[0] + cardinal[0] * 0.02, center[1] + cardinal[1] * 0.02
    target = _landmark(destination, city, settings)
    return target if target and 0.00065 <= _distance(center, target) <= 0.4 else None


def _road_key(name: str) -> str:
    ring = RING_ROAD.fullmatch(name.strip())
    return _folded(ring[1] if ring else ROAD_PREFIX.sub("", name))


def _road_bounds(
    road: str, city: tuple[str, str], district: str | None, settings: Settings, *, approximate_corridor: bool = False,
) -> Bounds | None:
    try:
        matches: list[tuple[str, tuple[Position, Position]]] = []
        road_key = _road_key(road)
        for feature in _photon(", ".join(filter(None, (road, district, city[1]))), settings, layer="street"):
            props = feature["properties"]
            name = props.get("name", "")
            if props.get("type") != "street" or _road_key(name) != road_key:
                continue
            if not _in_city(props, city):
                continue
            if district and not any(
                _folded(DISTRICT_PREFIX.sub("", props.get(key) or "")) == _folded(district)
                for key in ("district", "locality", "county")
            ):
                continue
            if extent := props.get("extent"):
                segment = (_coordinate(*extent[:2]), _coordinate(*extent[2:]))
            else:
                point = _coordinate(*feature["geometry"]["coordinates"])
                segment = (point, point)
            matches.append((name, segment))
    except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError) as error:
        logger.info("Incident road lookup failed (%s)", type(error).__name__)
        return None
    if not matches:
        return None
    exact = [segment for name, segment in matches if _folded(name) == _folded(road)]
    segments = (exact if ROAD_PREFIX.match(road) else []) or [segment for _, segment in matches]
    if approximate_corridor and RING_ROAD.fullmatch(road):
        return _bounds([point for segment in segments for point in segment])

    # Photon can return multiple pieces of one road, or distinct roads with the same name.
    # Only use the result if all matching pieces are near each other or linked by other pieces.
    def near(a: tuple[Position, Position], b: tuple[Position, Position]) -> bool:
        left, bottom, right, top = _bounds(a)
        west, south, east, north = _bounds(b)
        return max(west - right, left - east, south - top, bottom - north) <= 0.015

    connected = [segments.pop()]
    for segment in connected:
        neighbors = [other for other in segments if near(segment, other)]
        connected.extend(neighbors)
        segments = [other for other in segments if other not in neighbors]
    return None if segments else _bounds([point for segment in connected for point in segment])


def _area_shape(name: str, city: tuple[str, str], settings: Settings) -> dict | None:
    lookup = AREA_ALIASES.get(_folded(name), name)
    try:
        matches = {}
        for feature in _photon(f"{lookup}, {city[1]}", settings):
            props, shape = feature["properties"], feature["geometry"]
            if not _in_city(props, city) or _folded(props.get("name") or "") != _folded(lookup):
                continue
            if DISTRICT_PREFIX.match(name) and props.get("osm_key") != "boundary":
                continue
            if lookup == "Hồ Hoàn Kiếm" and props.get("osm_key") not in ("natural", "water"):
                continue
            polygon = None
            if shape["type"] in ("Polygon", "MultiPolygon"):
                polygons = [shape["coordinates"]] if shape["type"] == "Polygon" else shape["coordinates"]
                if sum(len(ring) for poly in polygons for ring in poly) <= 6000:
                    polygon = [[[_coordinate(*point) for point in ring] for ring in poly] for poly in polygons]
            if polygon:
                bounds = _bounds([point for poly in polygon for ring in poly for point in ring])
            elif extent := props.get("extent"):
                bounds = _bounds([_coordinate(*extent[:2]), _coordinate(*extent[2:])])
            elif shape["type"] == "Point":
                lon, lat = _coordinate(*shape["coordinates"])
                bounds = lon - 0.0015, lat - 0.0015, lon + 0.0015, lat + 0.0015
            else:
                continue
            if polygon or bounds not in matches:
                matches[bounds] = polygon
    except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError) as error:
        logger.info("Incident area lookup failed (%s)", type(error).__name__)
        return None
    if len(matches) != 1:
        return None
    bounds, polygon = next(iter(matches.items()))
    return {
        "name": name, "bounds": bounds,
        **({"geometry": {"type": "MultiPolygon", "coordinates": polygon}} if polygon else {}),
    }


def _affected_area(area: ReportedIncidentArea, city: tuple[str, str], district: str | None, settings: Settings) -> dict | None:
    if area.kind == "area":
        return _area_shape(area.name, city, settings)
    if not area.start or not area.end:
        bounds = _road_bounds(area.name, city, district, settings, approximate_corridor=True)
        return {"name": area.name, "road": area.name, "bounds": bounds} if bounds else None
    start = _landmark(area.start, city, settings)
    end = _landmark(area.end, city, settings)
    if not start or not end or not 0.0004 <= _distance(start, end) <= 0.2:
        return None
    west, south, east, north = _bounds([start, end])
    return {
        "name": f"{area.name} ({area.start}, {area.end})", "road": area.name,
        "bounds": (west - 0.0006, south - 0.0006, east + 0.0006, north + 0.0006),
    }


def is_incident_claim(claim: str) -> bool:
    return bool(TRAFFIC_INCIDENT.search(claim) or (REGIONAL_EVENT.search(claim) and LOCAL_AREA.search(claim)))


def build_incident_map(
    claim: str, evidence: list[Evidence], llm: LLM, settings: Settings, tasks: TaskLog = NO_TASKS,
) -> dict | None:
    if not evidence or not is_incident_claim(claim):
        return None
    if not (settings.incident_map_photon_url or settings.incident_map_overpass_url):
        return None
    labels = {f"E{index + 1}": item.source for index, item in enumerate(evidence)}
    prompt = "\n\n".join([
        f"Local date in Vietnam: {datetime.now(ZoneInfo('Asia/Ho_Chi_Minh')).date().isoformat()}",
        tagged("input", claim, type="claim"),
        *(
            tagged(
                "passage",
                top_passages(source.text, claim, settings.location_map_passages_per_source),
                evidence_id=label, published=source.published_at or "unknown",
            )
            for label, source in labels.items()
        ),
    ])
    task = tasks.model("incident-location", "reading_incident_location", settings.research_model, settings)
    try:
        answer, model = llm.complete(settings.research_model, INCIDENT_MAP_SYSTEM, prompt, IncidentLocations)
    except LLMError as error:
        task.fail(error.public_message)
        return None

    locations = []
    area_options = []
    for location in answer.locations:
        source = labels.get(location.evidence_id)
        city = CITY_NAMES.get(_folded(location.city))
        roads = [road.strip() for road in location.roads]
        road_keys = {_road_key(road) for road in roads}
        if not source or not city or not quote_in_text(location.quote, source.text):
            continue
        named_city = any(quote_in_text(location.city, text) for text in (location.quote, claim))
        hanoi_landmark = city[0] == "VN-HN" and any(
            _folded(area.name) in ("hoguom", "hohoankiem") and quote_in_text(area.name, location.quote)
            for area in location.areas
        )
        if not (named_city or hanoi_landmark):
            continue
        district = location.district
        if district and not any(quote_in_text(district, text) for text in (location.quote, claim)):
            district = None
        if location.areas:
            verified = {}
            for area in location.areas:
                if not all(
                    ROAD_NAME.fullmatch(part) and quote_in_text(part, location.quote)
                    for part in (area.name, area.start, area.end) if part
                ):
                    continue
                if bool(area.start) != bool(area.end):
                    continue
                verified.setdefault((_folded(area.name), area.start, area.end), area)
            if verified:
                area_options.append((city, district, list(verified.values()), location.quote, source))
            continue
        if not roads:
            continue
        if len(road_keys) != len(roads) or not all(
            ROAD_NAME.fullmatch(road) and quote_in_text(road, location.quote) for road in roads
        ):
            continue
        if len(roads) == 2 and not JUNCTION_WORDS.search(location.quote):
            continue
        toward = (location.toward or "").strip()
        direction = toward if len(roads) == 1 and toward and re.search(
            r"\b(?:hướng\s+(?:(?:đi|về|ra|vào)\s+)?|towards?\s+)" + re.escape(toward) + r"(?!\w)",
            location.quote, re.I,
        ) else None
        whole_road = bool(len(roads) == 1 and location.whole_road and WHOLE_ROAD.search(location.quote))
        locations.append((city, roads, road_keys, district, location.quote, source, direction, whole_road))

    task.finish_model(model, settings, **({} if locations or area_options else {"summary": NOT_ENOUGH_DATA}))
    if area_options:
        city, district, areas, quote, source = max(area_options, key=lambda option: len(option[2]))
        if any(other_city != city for other_city, *_ in area_options):
            return None
        lookup = tasks.chart_data("incident-map", "OpenStreetMap")
        shown = [result for area in areas if (result := _affected_area(area, city, district, settings))]
        lookup.finish(**({} if shown else {"summary": NOT_ENOUGH_DATA}))
        if shown:
            bounds = _bounds([point for area in shown for point in (area["bounds"][:2], area["bounds"][2:])])
            return {
                "city": city[1], "roads": [], "position": None, "bounds": bounds, "areas": shown,
                "quote": quote, "publisher": source.publisher or source.title, "url": source.url,
            }
    if not locations:
        return None
    city, roads, road_keys, district, quote, source, direction, whole_road = max(
        locations, key=lambda location: (len(location[1]), bool(location[3]), bool(location[6] or location[7])),
    )
    if any(
        other_city != city or not other_roads <= road_keys or (
            district and other_district and _folded(district) != _folded(other_district)
        )
        for other_city, _, other_roads, other_district, *_ in locations
    ):
        return None

    lookup = tasks.chart_data("incident-map", "OpenStreetMap")
    position = _intersection(roads, city[0], settings) if len(roads) == 2 else None
    bounds = None
    shown_roads = roads
    if not position:
        for road in roads:
            bounds = _road_bounds(road, city, district, settings)
            if bounds:
                shown_roads = [road]
                break
    destinations = {_folded(location[6]) for location in locations if location[6]}
    toward = _direction_target(direction, city, bounds, settings) if direction and bounds and len(destinations) == 1 else None
    lookup.finish(**({} if position or bounds else {"summary": NOT_ENOUGH_DATA}))
    if not (position or bounds):
        return None
    return {
        "city": city[1],
        **({"district": district} if district else {}),
        "roads": shown_roads,
        "position": position,
        "bounds": bounds,
        **({"toward": toward} if toward else {}),
        **({"wholeRoad": True} if whole_road else {}),
        "quote": quote,
        "publisher": source.publisher or source.title,
        "url": source.url,
    }

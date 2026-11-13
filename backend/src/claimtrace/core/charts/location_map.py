"""Builds a claim's map, only when where something happened is part of what the claim says.

A model picks out the places. The shapes come from the Highcharts map collection, so a model never draws anything,
and each place must be written in the claim itself. A model also reads figures for the map from the claim's sources,
and each must be found in the source's own words to be kept. The map proves nothing, and judges never see it.
"""

import logging
import re
import unicodedata

import httpx

from claimtrace.config.settings import Settings, load_data
from claimtrace.db.models import Evidence

from ..pipeline.passages import quote_in_text, top_passages
from ..pipeline.progress import NO_TASKS, NOT_ENOUGH_VERIFIED, TaskLog
from ..pipeline.prompts import MAP_DETAILS_SYSTEM, ExtractedClaim, MapDetail, MapDetails, tagged
from ..providers.llm import LLM, LLMError

logger = logging.getLogger(__name__)

PLACES = load_data("map_places.json")
VIETNAM = "vn"
PROVINCE_PREFIX = re.compile(r"^(tinh|thanh pho|tp|province of|city of)\s+|\s+(province|city)$")


def _folded(name: str) -> str:
    """Hải Phòng, Hai Phong and Haiphong all give the same text."""
    plain = unicodedata.normalize("NFD", name.lower().replace("đ", "d").replace(".", " "))
    plain = " ".join("".join(char for char in plain if not unicodedata.combining(char)).split())
    return PROVINCE_PREFIX.sub("", plain).replace(" ", "").replace("-", "")


def photon_features(query: str, settings: Settings, **filters: str | int) -> list[dict]:
    if not settings.incident_map_photon_url:
        return []
    response = httpx.get(
        settings.incident_map_photon_url, params={"q": query, **filters},
        headers={"User-Agent": "ClaimTrace/0.1"}, timeout=settings.incident_map_timeout_seconds,
    )
    response.raise_for_status()
    return response.json()["features"]


PROVINCE_BY_NAME = {_folded(name): code for code, name in PLACES["provinces"].items()} | {
    _folded(alias): code
    for alias, code in {
        "Hanoi": "vn-318",
        "Sài Gòn": "vn-hc",
        "Saigon": "vn-hc",
        "TP.HCM": "vn-hc",
        "TPHCM": "vn-hc",
        "Ho Chi Minh City": "vn-hc",
        "Huế": "vn-tt",
        "Vũng Tàu": "vn-bv",
        "Dak Lak": "vn-723",
        "Daklak": "vn-723",
        "Dak Nong": "vn-6365",
    }.items()
}
VIETNAM_NAMES = {_folded(name) for name in ("Việt Nam", "Vietnam")}
STATE_BY_NAME = {_folded(name): code for code, name in PLACES["us_states"].items()}
# The map collection leaves these out, so frontend/public/maps/vn-islands.geo.json supplies their shapes.
ISLAND_NAMES = {"hoang-sa": "Hoàng Sa", "truong-sa": "Trường Sa"}
ISLAND_BY_NAME = {
    _folded(name): code
    for name, code in {
        "Hoàng Sa": "hoang-sa",
        "quần đảo Hoàng Sa": "hoang-sa",
        "huyện đảo Hoàng Sa": "hoang-sa",
        "Paracel": "hoang-sa",
        "Paracel Islands": "hoang-sa",
        "Hoang Sa Islands": "hoang-sa",
        "Trường Sa": "truong-sa",
        "quần đảo Trường Sa": "truong-sa",
        "huyện đảo Trường Sa": "truong-sa",
        "Spratly": "truong-sa",
        "Spratly Islands": "truong-sa",
        "Truong Sa Islands": "truong-sa",
    }.items()
}


def build_location_map(item: ExtractedClaim, settings: Settings) -> dict | None:
    """The map, opening as close as the model chose. The map itself still keeps the whole place in view."""
    found = _places_map(item, settings)
    return {**found, "zoom": item.map_zoom} if found and item.map_zoom else found


def _places_map(item: ExtractedClaim, settings: Settings) -> dict | None:
    """Vietnam's provinces get the Vietnam map, and US states the US map. Anything else gets the world map."""
    states: dict[str, str] = {}
    other_places = False
    provinces: dict[str, str] = {}
    countries: dict[str, str] = {}
    regions: dict[str, list[dict]] = {}
    for place in item.map_places[: settings.location_map_max_places]:
        code = place.country.lower()
        state_name = place.region or place.name
        state = STATE_BY_NAME.get(_folded(state_name)) if code == "us" else None
        if state and state_name.lower() in item.text.lower():
            states.setdefault(state, state_name)
            continue
        if place.name.lower() not in item.text.lower():
            continue  # Only a place the claim itself names.
        other_places = True
        # These are Vietnam's, whichever country code the model gave.
        if island := ISLAND_BY_NAME.get(_folded(place.name)):
            provinces.setdefault(island, place.name)
        elif code not in PLACES["countries"]:
            continue
        elif code != VIETNAM:
            countries.setdefault(code, place.name)
            # A region inside the country, only if the claim itself names it. Readers can drill down to it.
            if place.region and place.region.lower() in item.text.lower():
                regions.setdefault(code, []).append({"name": place.region})
        elif province := PROVINCE_BY_NAME.get(_folded(place.name)):
            provinces.setdefault(province, place.name)
        elif _folded(place.name) in VIETNAM_NAMES:
            countries.setdefault(VIETNAM, place.name)
    if states and not other_places:
        return {
            "map": "us",
            "places": [{"code": code, "name": PLACES["us_states"][code], "named": named} for code, named in states.items()],
        }
    # With places elsewhere, the states stay reachable by drilling down into the US.
    if states:
        countries.setdefault("us", next(iter(states.values())))
        regions["us"] = [{"name": named, "code": code} for code, named in states.items()]
    # Vietnam alone says nothing to readers in Vietnam, so it needs another country beside it.
    if countries.keys() <= {VIETNAM} and not provinces:
        return None
    if not countries:
        return {
            "map": "vietnam",
            "places": [
                {"code": code, "name": ISLAND_NAMES.get(code) or PLACES["provinces"][code], "named": named}
                for code, named in provinces.items()
            ],
        }
    if provinces:
        countries.setdefault(VIETNAM, next(iter(provinces.values())))
        regions[VIETNAM] = [{"name": named, "code": code} for code, named in provinces.items()]
    return {
        "map": "world",
        "places": [
            {
                "code": code,
                "name": PLACES["countries"][code],
                "named": named,
                **({"regions": regions[code]} if code in regions else {}),
            }
            for code, named in countries.items()
        ],
    }


def is_verified_detail(detail: MapDetail, source_text: str, places: dict[str, str]) -> bool:
    """A model read this figure, so it only counts if the source's own words show it. Anything doubtful is dropped."""
    quote = detail.quote
    if not quote or not quote_in_text(quote, source_text) or not detail.label.strip():
        return False
    if not re.search(r"\d", detail.value) or detail.value.lower() not in quote.lower():
        return False
    if detail.place is None:
        return True
    return detail.place in places and _folded(detail.place) in _folded(quote)


# The passages that hold a map's figures often don't repeat the claim's words, so the search asks for figures too.
FIGURE_WORDS = (
    "temperature maximum high rainfall wind magnitude deaths dead injured missing damage density "
    "nhiệt độ cao nhất lượng mưa gió cấp người chết bị thương mất tích thiệt hại mật độ"
)


def build_map_details(
    claim_text: str, location_map: dict, evidence: list[Evidence], llm: LLM, settings: Settings, tasks: TaskLog = NO_TASKS
) -> list[dict]:
    """The figures beside the map. A failure only costs the figures, so the map itself stays."""
    labels = {f"E{index + 1}": item.source for index, item in enumerate(evidence)}
    places = {place["named"]: place["code"] for place in location_map["places"]}
    if not labels:
        return []
    prompt = "\n\n".join(
        [tagged("input", claim_text, type="claim"), f"Places: {', '.join(places)}"]
        + [
            tagged(
                "passage",
                top_passages(source.text, f"{claim_text} {FIGURE_WORDS}", settings.location_map_passages_per_source),
                evidence_id=label,
                published=source.published_at or "unknown",
            )
            for label, source in labels.items()
        ]
    )
    task = tasks.model("map-figures", "reading_figures", settings.research_model, settings)
    try:
        answer, model = llm.complete(settings.research_model, MAP_DETAILS_SYSTEM, prompt, MapDetails)
    except LLMError as error:
        logger.warning("Map details failed: %s", error)
        task.fail(error.public_message)
        return []

    details: dict[tuple, dict] = {}
    for detail in answer.details:
        source = labels.get(detail.evidence_id)
        if source is None or not is_verified_detail(detail, source.text, places):
            continue
        details.setdefault(
            (detail.place, detail.label, detail.value),
            {
                "place": places.get(detail.place or ""),
                "label": detail.label[: settings.location_map_max_detail_label],
                "value": detail.value,
                "publisher": source.publisher or source.title,
                "url": source.url,
            },
        )
    task.finish_model(model, settings, **({} if details else {"summary": NOT_ENOUGH_VERIFIED}))
    return list(details.values())[: settings.location_map_max_details]

import httpx
import pytest

from harness.pipeline.prompts import IncidentLocations
from tests.helpers import run

CLAIM = "Một vụ tai nạn xảy ra trên đường Nguyễn Trãi, Hà Nội."
JUNCTION = "Một vụ tai nạn xảy ra tại giao lộ Nguyễn Trãi và Khuất Duy Tiến, Hà Nội."


@pytest.fixture
def incident_lookup(monkeypatch):
    calls = []

    def lookup(url, *, params, headers, timeout):
        calls.append(params)
        if "data" in params:
            body = {"elements": [{"lon": 105.8, "lat": 20.99}]}
        else:
            body = {"features": [{"properties": {
                "type": "street", "name": "Đường Nguyễn Trãi", "city": "Hà Nội", "countrycode": "VN",
                "extent": [105.79, 21, 105.81, 20.98],
            }}]}
        return httpx.Response(200, json=body, request=httpx.Request("GET", url))

    monkeypatch.setattr("harness.charts.incident_map.httpx.get", lookup)
    return calls


@pytest.mark.parametrize(
    ("quote", "roads", "position", "bounds"),
    [
        (CLAIM, ["đường Nguyễn Trãi"], None, [105.79, 20.98, 105.81, 21]),
        (JUNCTION, ["Nguyễn Trãi", "Khuất Duy Tiến"], [105.8, 20.99], None),
    ],
)
def test_reported_incident_is_saved_as_a_chart(client, fakes, incident_lookup, quote, roads, position, bounds):
    fakes.llm.claims = [CLAIM]
    fakes.llm.incident_locations = [{"evidence_id": "E1", "city": "Hà Nội", "roads": roads, "quote": quote}]
    fakes.fetch.text = (quote + " ") * 12
    result = run(client, {"inputType": "text", "text": CLAIM})
    claim = result["claims"][0]
    assert result["status"] == "completed"
    assert len(incident_lookup) == 1
    assert claim["incidentMap"] == {
        "city": "Hà Nội", "roads": roads, "position": position, "bounds": bounds, "quote": quote,
        "publisher": "Example News", "url": "https://reuters.com/a",
    }
    assert claim["current"]["verdict"] == "supported"


def test_a_road_missing_from_the_quote_does_not_trigger_a_lookup(client, fakes, incident_lookup):
    fakes.llm.claims = [CLAIM]
    fakes.fetch.text = (CLAIM + " ") * 12
    fakes.llm.incident_locations = [
        {"evidence_id": "E1", "city": "Hà Nội", "roads": ["Kim Mã"], "quote": CLAIM},
    ]
    result = run(client, {"inputType": "text", "text": CLAIM})
    assert result["claims"][0]["incidentMap"] is None
    assert not incident_lookup


def test_a_nontraffic_claim_does_not_start_location_research(client, fakes, incident_lookup):
    result = run(client)
    assert result["claims"][0]["incidentMap"] is None
    assert not any(schema is IncidentLocations for _, schema in fakes.llm.calls)
    assert not incident_lookup


def test_saves_an_explicit_direction_with_the_incident(client, fakes, incident_lookup):
    quote = f"{CLAIM[:-1]} theo hướng Đông."
    fakes.llm.claims = [CLAIM]
    fakes.llm.incident_locations = [
        {"evidence_id": "E1", "city": "Hà Nội", "roads": ["Nguyễn Trãi"], "quote": quote, "toward": "Đông"},
    ]
    fakes.fetch.text = (quote + " ") * 12
    result = run(client, {"inputType": "text", "text": CLAIM})
    assert result["claims"][0]["incidentMap"]["toward"] == pytest.approx([105.82, 20.99])
    assert len(incident_lookup) == 1


def test_saves_whole_road_scope_only_when_the_source_states_it(client, fakes, incident_lookup):
    quote = "Cấm xe trên toàn tuyến đường Nguyễn Trãi, Hà Nội."
    fakes.llm.claims = [quote]
    fakes.llm.incident_locations = [
        {"evidence_id": "E1", "city": "Hà Nội", "roads": ["Nguyễn Trãi"], "quote": quote, "whole_road": True},
    ]
    fakes.fetch.text = (quote + " ") * 12
    result = run(client, {"inputType": "text", "text": quote})
    assert result["claims"][0]["incidentMap"]["wholeRoad"] is True
    assert len(incident_lookup) == 1


def test_saves_multiple_quoted_areas_with_combined_bounds(client, fakes, monkeypatch):
    quote = "Mưa lớn gây ngập quanh Hồ Gươm và ở phường Khương Đình, Hà Nội."
    fakes.llm.claims = [quote]
    fakes.fetch.text = (quote + " ") * 12
    fakes.llm.incident_locations = [{
        "evidence_id": "E1", "city": "Hà Nội", "quote": quote,
        "areas": [{"name": name} for name in ("Hồ Gươm", "phường Khương Đình", "quận Ba Đình")],
    }]

    def lookup(query, settings):
        lake = query.startswith("Hồ Hoàn Kiếm")
        return [{
            "geometry": {"type": "Point", "coordinates": [105.85, 21.02]},
            "properties": {
                "name": "Hồ Hoàn Kiếm" if lake else "Phường Khương Đình",
                "osm_key": "water" if lake else "boundary", "city": "Hà Nội", "countrycode": "VN",
                "extent": [105.85, 21.03, 105.86, 21.02] if lake else [105.81, 21, 105.82, 20.98],
            },
        }]

    monkeypatch.setattr("harness.charts.incident_map._photon", lookup)
    result = run(client, {"inputType": "text", "text": quote})["claims"][0]["incidentMap"]
    assert result["roads"] == []
    assert result["bounds"] == [105.81, 20.98, 105.86, 21.03]
    assert [area["name"] for area in result["areas"]] == ["Hồ Gươm", "phường Khương Đình"]


def test_saves_the_scope_of_a_named_road_segment(client, fakes, monkeypatch):
    quote = "Hà Nội phân luồng Vành đai 3 đoạn từ Cầu Thanh Trì đến Nút giao Pháp Vân."
    fakes.llm.claims = [quote]
    fakes.fetch.text = (quote + " ") * 12
    fakes.llm.incident_locations = [{
        "evidence_id": "E1", "city": "Hà Nội", "quote": quote,
        "areas": [{
            "name": "Vành đai 3", "kind": "road_segment", "start": "Cầu Thanh Trì", "end": "Nút giao Pháp Vân",
        }],
    }]
    points = {"Cầu Thanh Trì": (105.90, 20.99), "Nút giao Pháp Vân": (105.85, 20.96)}
    monkeypatch.setattr("harness.charts.incident_map._landmark", lambda name, city, settings: points[name])
    area = run(client, {"inputType": "text", "text": quote})["claims"][0]["incidentMap"]["areas"][0]
    assert area["road"] == "Vành đai 3"
    assert area["bounds"] == pytest.approx([105.8494, 20.9594, 105.9006, 20.9906])


def test_ambiguous_junction_falls_back_to_the_reported_road(client, fakes, incident_lookup, monkeypatch):
    fakes.llm.claims = [JUNCTION]
    fakes.llm.incident_locations = [
        {"evidence_id": "E1", "city": "Hà Nội", "roads": ["Nguyễn Trãi", "Khuất Duy Tiến"], "quote": JUNCTION},
    ]
    fakes.fetch.text = (JUNCTION + " ") * 12
    lookup = httpx.get

    def unavailable_junction(url, **kwargs):
        if "data" in kwargs["params"]:
            raise httpx.ReadTimeout("no junction data")
        return lookup(url, **kwargs)

    monkeypatch.setattr("harness.charts.incident_map.httpx.get", unavailable_junction)
    result = run(client, {"inputType": "text", "text": JUNCTION})
    incident = result["claims"][0]["incidentMap"]
    assert incident["roads"] == ["Nguyễn Trãi"]
    assert incident["position"] is None
    assert incident["bounds"] == [105.79, 20.98, 105.81, 21]
    assert len(incident_lookup) == 1

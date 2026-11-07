from concurrent.futures import ThreadPoolExecutor
from datetime import date

import httpx
import pytest

from app.charts.data_sources import ClimateError, OpenMeteoClimate
from app.charts.heat_map import _grid, build_heat_map, is_heat_claim, sample_days
from app.core.config import Settings
from app.pipeline.prompts import ExtractedClaim, HeatMapRequest, MapPlace
from tests.helpers import run

HEAT = "Trạm Tương Dương ở Nghệ An đo được 44,2 độ C ngày 7/5/2023."
GLOBAL = "July 2023 was the hottest month on record for the world."
VN = HeatMapRequest(metric="temperature", area="VN", area_name="Nghệ An", start="2023-05-07", end="2023-05-07")


class Climate:
    name = "Test source"

    def __init__(self, fails=False, value=30.0):
        self.fails, self.value, self.days = fails, value, []

    def day_values(self, metric, day, lats, lons):
        self.days.append(day)
        if self.fails:
            raise ClimateError("down")
        return [self.value for _ in lats]


def _build(text=HEAT, request=VN, climate=None, **settings):
    item = ExtractedClaim(text=text, checkworthiness=0.9, heat_map=request)
    with ThreadPoolExecutor(4) as pool:
        return build_heat_map(item, climate or Climate(), Settings(**settings), pool)


@pytest.mark.parametrize(
    ("text", "metric", "area", "name", "expected"),
    [
        (HEAT, "temperature", "vn", "Nghệ An", True),
        (GLOBAL, "temperature", "world", "world", True),
        ("Mưa lớn ở Huế ngày 25/10/2020.", "rainfall", "vn", "Huế", True),
        # It names the area, but not the metric.
        ("Hà Nội mở tuyến metro mới năm 2021.", "temperature", "vn", "Hà Nội", False),
        ("Hanoi had a heat wave.", "rainfall", "vn", "Hanoi", False),
        # The claim doesn't name the area the model gave.
        ("It was 40°C on Monday.", "temperature", "vn", "Hanoi", False),
        ("Japan had its hottest July.", "temperature", "world", "world", False),
        ("Atlantis had its hottest July.", "temperature", "xx", "Atlantis", False),
        # A metric we have no data for.
        ("Vegetation fell across the world.", "ndvi", "world", "world", False),
    ],
)
def test_only_a_claim_about_the_weather_over_an_area_gets_a_heatmap(text, metric, area, name, expected):
    assert is_heat_claim(text, metric, area, name) is expected


def test_values_come_from_climate_data_and_are_averaged_over_the_days():
    calls = iter([20.0, 40.0])

    class Changing(Climate):
        def day_values(self, metric, day, lats, lons):
            value = next(calls)
            return [value for _ in lats]

    request = VN.model_copy(update={"start": "2023-05-06"})
    result = _build(request=request, climate=Changing(), heat_map_points_per_request=10_000)
    assert result["source"] == "Test source"
    assert result["days"] == ["2023-05-06", "2023-05-07"]
    assert {value for _, _, value in result["points"]} == {30.0}
    assert result["area"] == "vn"


@pytest.mark.parametrize("area", ["world", "vn", "jp", "nz"])
def test_a_grid_stays_on_the_globe_and_within_the_allowance(area):
    _, lats, lons = _grid(area, Settings())
    assert all(-90 <= lat <= 90 for lat in lats) and all(-180 <= lon <= 180 for lon in lons)
    assert len(lats) * Settings().heat_map_sample_days <= 600
    step = Settings().heat_map_step_world if area == "world" else Settings().heat_map_step_area
    assert all(lat % step == 0 for lat in lats) and all(lon % step == 0 for lon in lons)
    assert 90 % step == 0


def test_a_long_period_is_sampled_and_says_which_days():
    days = sample_days(date(2023, 7, 1), date(2023, 7, 31), 5)
    assert days[0] == date(2023, 7, 1) and days[-1] == date(2023, 7, 31) and len(days) == 5
    assert sample_days(date(2023, 7, 1), date(2023, 7, 2), 5) == [date(2023, 7, 1), date(2023, 7, 2)]


@pytest.mark.parametrize(
    ("start", "end"),
    [
        ("2023-05-07", "2023-05-01"),  # Backwards.
        ("2023-01-01", "2023-12-31"),  # Too long.
        ("7/5/2023", "7/5/2023"),  # Not a date.
        ("1900-01-01", "1900-01-02"),  # Before the data begins.
        ("2999-01-01", "2999-01-02"),  # Hasn't happened.
    ],
)
def test_a_period_the_data_cant_cover_draws_nothing(start, end):
    climate = Climate()
    assert _build(request=VN.model_copy(update={"start": start, "end": end}), climate=climate) is None
    assert climate.days == []


def test_a_big_grid_goes_in_parts_and_stays_in_order():
    class Numbered(Climate):
        def day_values(self, metric, day, lats, lons):
            assert len(lats) <= 10
            return [lat + lon for lat, lon in zip(lats, lons, strict=True)]

    result = _build(climate=Numbered(), heat_map_points_per_request=10)
    assert all(value == round(lat + lon, 1) for lon, lat, value in result["points"])


def test_a_failure_or_a_mostly_empty_grid_only_costs_the_heatmap():
    assert _build(climate=Climate(fails=True)) is None
    assert _build(climate=Climate(value=None)) is None


def test_a_check_saves_a_heatmap_instead_of_a_location_map(client, fakes):
    assert run(client)["claims"][0]["heatMap"] is None
    assert fakes.climate.days == []

    fakes.llm.claims = [HEAT]
    fakes.llm.heat_map = VN
    claim = run(client)["claims"][0]
    assert claim["heatMap"]["metric"] == "temperature"
    assert claim["status"] == "assessed"


def test_a_claim_about_the_last_few_days_gets_a_map_instead_of_a_heatmap(client, fakes):
    fakes.llm.claims = ["The temperature in Texas was over 40 degrees Celsius on 3 November 2026."]
    fakes.llm.heat_map = HeatMapRequest(metric="temperature", area="US", area_name="Texas", start="2026-11-03", end="2026-11-03")
    fakes.llm.map_places = [MapPlace(name="Texas", country="US")]
    claim = run(client)["claims"][0]
    assert claim["heatMap"] is None
    assert [place["named"] for place in claim["locationMap"]["places"]] == ["Texas"]


def test_open_meteo_answers_become_values_in_order(monkeypatch):
    body = [{"daily": {"temperature_2m_max": [31.5]}}, {"daily": {"temperature_2m_max": [None]}}]
    request = httpx.Request("GET", "https://x")
    monkeypatch.setattr(httpx, "get", lambda *a, **k: httpx.Response(200, json=body, request=request))
    climate = OpenMeteoClimate(Settings())
    assert climate.day_values("temperature", date(2023, 5, 7), [20.0, 21.0], [105.0, 105.0]) == [31.5, None]
    with pytest.raises(ClimateError):
        climate.day_values("temperature", date(2023, 5, 7), [20.0], [105.0])

    monkeypatch.setattr(httpx, "get", lambda *a, **k: httpx.Response(500, request=request))
    with pytest.raises(ClimateError):
        climate.day_values("temperature", date(2023, 5, 7), [20.0], [105.0])

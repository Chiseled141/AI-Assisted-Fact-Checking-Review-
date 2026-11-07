import httpx
import pytest

from app.charts.country_map import build_country_map, is_stat_claim
from app.charts.data_sources import CountryDataError, DataUsa, StateDataError, WorldBankData
from app.charts.location_map import PLACES
from app.core.config import Settings
from app.pipeline.prompts import CountryStatRequest, ExtractedClaim, MapPlace
from tests.conftest import FakeStateData, fake_country_rows
from tests.helpers import run

VIETNAM = "Dân số Việt Nam đạt 100 triệu người năm 2023."
RACE = "India overtook China as the most populous country in 2023."


class Data:
    name = "Test source"

    def __init__(self, fails=False, rows=None):
        self.fails, self.rows, self.asked = fails, fake_country_rows() if rows is None else rows, []

    def by_country(self, indicator, start, end):
        self.asked.append((indicator, start, end))
        if self.fails:
            raise CountryDataError("down")
        return self.rows


def _build(text=VIETNAM, indicator="population", places=(("Việt Nam", "VN"),), year=2023, data=None):
    request = CountryStatRequest(
        indicator=indicator, countries=[MapPlace(name=name, country=code) for name, code in places], year=year
    )
    item = ExtractedClaim(text=text, checkworthiness=0.9, country_stat=request)
    return build_country_map(item, data or Data(), Settings())


@pytest.mark.parametrize(
    ("text", "indicator", "expected"),
    [
        (VIETNAM, "population", True),
        (RACE, "population", True),
        ("Vietnam's GDP passed $400 billion in 2023.", "gdp", True),
        ("GDP per capita in Vietnam reached $4,300.", "gdp_per_capita", True),
        ("GDP bình quân đầu người của Việt Nam đạt 4.300 USD.", "gdp_per_capita", True),
        ("Tuổi thọ trung bình của người Việt đạt 74,5 tuổi.", "life_expectancy", True),
        # It names a country, but not this statistic.
        ("Vietnam opened a new metro line in 2021.", "population", False),
        ("Vietnam's GDP passed $400 billion in 2023.", "life_expectancy", False),
        ("Vietnam's GDP passed $400 billion in 2023.", "gdp_per_capita", False),
        # A statistic we have no data for.
        ("Vietnam's inflation was 3%.", "inflation", False),
    ],
)
def test_only_a_claim_stating_a_national_statistic_gets_a_country_map(text, indicator, expected):
    assert is_stat_claim(text, indicator) is expected


def test_values_come_from_the_data_and_the_named_countries_are_marked():
    result = _build(RACE, places=(("India", "IN"), ("China", "CN")))
    assert result["source"] == "Test source"
    assert [place["code"] for place in result["selected"]] == ["in", "cn"]
    assert result["year"] == 2023
    assert result["values"]["in"][result["years"].index(2023)] == 1_438_000_000
    assert "world" in result["values"]


def test_a_country_the_claim_doesnt_name_is_dropped():
    assert [p["code"] for p in _build(RACE, places=(("India", "IN"), ("Japan", "JP")))["selected"]] == ["in"]
    assert _build(RACE, places=(("Japan", "JP"),)) is None


def test_a_claim_about_the_world_needs_no_country():
    assert _build("The world population passed 8 billion in 2022.", places=(), year=2022)["selected"] == []


def test_a_year_with_no_data_opens_on_the_latest_year():
    assert _build(year=2999)["year"] == 2024
    assert _build(year=None)["year"] == 2024


def test_a_failure_or_too_little_data_only_costs_the_map():
    assert _build(data=Data(fails=True)) is None
    assert _build(data=Data(rows={"VNM": {2023: 100.0}})) is None
    assert _build(data=Data(rows={})) is None


def test_a_check_saves_a_country_map_instead_of_a_location_map(client, fakes):
    assert run(client)["claims"][0]["countryMap"] is None
    assert fakes.country_data.asked == []

    fakes.llm.claims = [VIETNAM]
    fakes.llm.country_stat = CountryStatRequest(
        indicator="population", countries=[MapPlace(name="Việt Nam", country="VN")], year=2023
    )
    fakes.llm.map_places = [MapPlace(name="Việt Nam", country="VN"), MapPlace(name="Dân số", country="JP")]
    claim = run(client)["claims"][0]
    assert claim["countryMap"]["indicator"] == "population"
    assert claim["locationMap"] is None
    assert claim["status"] == "assessed"


def test_every_map_code_has_a_world_bank_code():
    assert PLACES["iso3"]["vn"] == "VNM"
    assert PLACES["iso3"]["gz"] == "PSE"


def test_world_bank_answers_become_values_and_gaps_are_dropped(monkeypatch):
    body = [
        {"page": 1},
        [
            {"countryiso3code": "VNM", "date": "2023", "value": 100.0},
            {"countryiso3code": "VNM", "date": "2024", "value": None},
            {"countryiso3code": "", "date": "2023", "value": 5.0},
        ],
    ]
    request = httpx.Request("GET", "https://x")
    monkeypatch.setattr(httpx, "get", lambda *a, **k: httpx.Response(200, json=body, request=request))
    assert WorldBankData(Settings()).by_country("population", 2020, 2024) == {"VNM": {2023: 100.0}}

    monkeypatch.setattr(httpx, "get", lambda *a, **k: httpx.Response(200, json=[{"message": "bad"}], request=request))
    with pytest.raises(CountryDataError):
        WorldBankData(Settings()).by_country("population", 2020, 2024)


CALIFORNIA = "California is the most populous US state, with almost 40 million people and the largest population."


def _state_claim(text=CALIFORNIA, region="California", indicator="population", year=2024):
    return ExtractedClaim(
        text=text,
        checkworthiness=0.9,
        country_stat=CountryStatRequest(
            indicator=indicator, countries=[MapPlace(name="US", country="US", region=region)], year=year
        ),
    )


def _build_state(item, data=None):
    return build_country_map(item, Data(), Settings(), data if data is not None else FakeStateData())


def test_a_us_state_claim_gets_a_state_map_with_census_values():
    result = _build_state(_state_claim())
    assert result["scope"] == "us-states"
    assert result["selected"] == [{"code": "us-ca", "name": "California", "named": "California"}]
    assert result["values"]["us-ca"][result["years"].index(2024)] == 39_200_000
    assert result["source"] == "Test state data"


def test_a_vietnamese_population_ranking_keeps_the_state_map():
    result = _build_state(_state_claim(text="California là bang đông dân nhất Hoa Kỳ năm 2023.", year=2023))
    assert result["scope"] == "us-states"
    assert result["year"] == 2023
    assert result["selected"] == [{"code": "us-ca", "name": "California", "named": "California"}]


@pytest.mark.parametrize(
    "item",
    [
        # The claim doesn't name this state, or it isn't a state.
        _state_claim(region="Texas"),
        _state_claim(text="Atlantis has the largest population.", region="Atlantis"),
    ],
)
def test_a_state_the_claim_doesnt_name_draws_nothing(item):
    assert _build_state(item) is None


def test_a_state_never_falls_back_to_the_whole_countrys_figure():
    data = Data()
    gdp = _state_claim(text="California's GDP passed $3 trillion.", indicator="gdp")
    assert build_country_map(gdp, data, Settings(), FakeStateData()) is None
    assert data.asked == []


def test_a_state_data_failure_only_costs_the_map():
    class Down:
        name = "Down"

        def population_by_state(self):
            raise StateDataError("down")

    assert _build_state(_state_claim(), Down()) is None


def test_data_usa_answers_become_values(monkeypatch):
    body = {"data": [{"State": "Texas", "Year": 2023, "Population": 30.0}, {"State": "Texas", "Year": 2024, "Population": None}]}
    request = httpx.Request("GET", "https://x")
    monkeypatch.setattr(httpx, "get", lambda *a, **k: httpx.Response(200, json=body, request=request))
    assert DataUsa(Settings()).population_by_state() == {"Texas": {2023: 30.0}}

    monkeypatch.setattr(httpx, "get", lambda *a, **k: httpx.Response(500, request=request))
    with pytest.raises(StateDataError):
        DataUsa(Settings()).population_by_state()

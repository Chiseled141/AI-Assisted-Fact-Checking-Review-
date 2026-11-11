import pytest

from config.settings import Settings
from database.models import Claim
from database.session import SessionLocal
from harness.charts.location_map import PLACES, PROVINCE_BY_NAME, build_location_map, is_verified_detail
from harness.pipeline.prompts import ExtractedClaim, MapDetail, MapDetails, MapPlace
from tests.helpers import run

YAGI = "Bão Yagi đổ bộ vào khu vực Quảng Ninh - Hải Phòng ngày 7/9/2024."
QUAKE_REGIONS = "An earthquake struck near Mandalay, Myanmar, and was felt in Bangkok, Thailand."
QUAKE = "A magnitude 7.7 earthquake struck Myanmar on 28 March 2025 and damaged buildings in Thailand."


def test_saved_weather_grid_is_ignored_when_serving_a_check(client, fakes):
    weather = "The temperature in Texas was over 40 degrees Celsius on 3 November 2026."
    fakes.llm.claims = [weather]
    fakes.llm.map_places = [MapPlace(name="Texas", country="US")]
    check = run(client, {"inputType": "text", "text": weather})
    with SessionLocal() as session:
        claim = session.get(Claim, check["claims"][0]["id"])
        claim.heat_map = {"metric": "temperature", "points": [[-100, 30, 40]]}
        session.commit()

    result = client.get(f"/api/check/{check['id']}").json()["claims"][0]
    assert result["status"] == "assessed"
    assert "heatMap" not in result
    assert [place["named"] for place in result["locationMap"]["places"]] == ["Texas"]


def _map(text, *places):
    item = ExtractedClaim(
        text=text, checkworthiness=0.9, map_places=[MapPlace(name=name, country=country) for name, country in places]
    )
    return build_location_map(item, Settings())


def test_provinces_of_vietnam_get_the_vietnam_map_with_correct_names():
    result = _map(YAGI, ("Quảng Ninh", "VN"), ("Hải Phòng", "VN"))
    assert result["map"] == "vietnam"
    assert result["places"] == [
        {"code": "vn-qn", "name": "Quảng Ninh", "named": "Quảng Ninh"},
        {"code": "vn-3623", "name": "Hải Phòng", "named": "Hải Phòng"},
    ]


def test_other_countries_get_the_world_map():
    result = _map(QUAKE, ("Myanmar", "MM"), ("Thailand", "TH"))
    assert result["map"] == "world"
    assert [place["code"] for place in result["places"]] == ["mm", "th"]


def test_a_vietnamese_name_shows_the_maps_own_name_beside_it():
    result = _map("Động đất xảy ra tại Nhật Bản.", ("Nhật Bản", "JP"))
    assert result["places"] == [{"code": "jp", "name": "Japan", "named": "Nhật Bản"}]


def test_a_province_and_a_foreign_country_share_the_world_map():
    result = _map("Yagi đổ bộ Quảng Ninh và gây lũ ở Myanmar.", ("Quảng Ninh", "VN"), ("Myanmar", "MM"))
    assert result["map"] == "world"
    assert {place["code"] for place in result["places"]} == {"mm", "vn"}
    # The province stays reachable by drilling down into Vietnam.
    vietnam = next(place for place in result["places"] if place["code"] == "vn")
    assert vietnam["regions"] == [{"name": "Quảng Ninh", "code": "vn-qn"}]


def _with_regions(text, *places):
    item = ExtractedClaim(
        text=text,
        checkworthiness=0.9,
        map_places=[MapPlace(name=name, country=country, region=region) for name, country, region in places],
    )
    return build_location_map(item, Settings())


def test_a_region_the_claim_names_can_be_drilled_down_to():
    result = _with_regions(QUAKE_REGIONS, ("Myanmar", "MM", "Mandalay"), ("Thailand", "TH", "Bangkok"))
    assert [place["regions"] for place in result["places"]] == [[{"name": "Mandalay"}], [{"name": "Bangkok"}]]


def test_several_regions_of_one_country_stay_together():
    text = "Floods hit Mandalay and Sagaing in Myanmar."
    result = _with_regions(text, ("Myanmar", "MM", "Mandalay"), ("Myanmar", "MM", "Sagaing"))
    assert [region["name"] for region in result["places"][0]["regions"]] == ["Mandalay", "Sagaing"]


def test_a_region_the_claim_doesnt_name_gives_no_drilldown():
    result = _with_regions(QUAKE, ("Myanmar", "MM", "Mandalay"), ("Thailand", "TH", None))
    assert all("regions" not in place for place in result["places"])


@pytest.mark.parametrize(
    ("text", "place"),
    [
        # The model names a place the claim doesn't.
        ("The line opened on 6 November 2021.", ("Hanoi", "VN")),
        # Vietnam alone, which readers don't need a map of.
        ("Vietnam's economy grew 7% in 2024.", ("Vietnam", "VN")),
        # A place too small for the map, or a country code the map doesn't have.
        ("Gió mạnh tại Bãi Cháy.", ("Bãi Cháy", "VN")),
        ("Floods hit Atlantis.", ("Atlantis", "XX")),
    ],
)
def test_no_map_when_a_place_cant_be_shown_honestly(text, place):
    assert _map(text, place) is None


@pytest.mark.parametrize(
    ("name", "country", "code"),
    [
        ("Hoàng Sa", "VN", "hoang-sa"),
        ("quần đảo Trường Sa", "VN", "truong-sa"),
        ("Paracel Islands", "CN", "hoang-sa"),
        ("Spratly Islands", "PH", "truong-sa"),
    ],
)
def test_hoang_sa_and_truong_sa_are_always_vietnams(name, country, code):
    result = _map(f"Tàu cá gặp nạn gần {name}.", (name, country))
    assert result["map"] == "vietnam"
    assert result["places"][0]["code"] == code


def test_no_places_means_no_map():
    assert _map("The line opened on 6 November 2021.") is None


def test_every_spelling_of_a_province_finds_it():
    for name in ("Hải Phòng", "Hai Phong", "Haiphong", "thành phố Hải Phòng", "TP. Hải Phòng", "Hai Phong City"):
        assert _map(f"Bão vào {name}.", (name, "VN"))["places"][0]["code"] == "vn-3623", name
    for name in ("Hà Nội", "Hanoi", "Ha Noi"):
        assert _map(f"Mưa ở {name}.", (name, "VN"))["places"][0]["code"] == "vn-318", name


def test_every_province_on_the_map_can_be_found():
    assert len(PLACES["provinces"]) == 63
    assert set(PROVINCE_BY_NAME.values()) == set(PLACES["provinces"])


def test_a_check_saves_a_map_only_for_a_claim_with_places(client, fakes):
    assert run(client)["claims"][0]["locationMap"] is None

    fakes.llm.claims = [YAGI]
    fakes.llm.map_places = [MapPlace(name="Quảng Ninh", country="VN")]
    assert run(client)["claims"][0]["locationMap"]["map"] == "vietnam"


SOURCE = "78 người bị thương gồm 58 người ở Quảng Ninh, 20 người ở Hải Phòng. Gió mạnh cấp 12-13."
PLACES_ON_MAP = {"Quảng Ninh": "vn-qn", "Hải Phòng": "vn-3623"}
INJURED = "78 người bị thương gồm 58 người ở Quảng Ninh, 20 người ở Hải Phòng."


def _detail(value="58 người", quote=INJURED, place="Quảng Ninh", label="Người bị thương"):
    return MapDetail(evidence_id="E1", place=place, label=label, value=value, quote=quote)


@pytest.mark.parametrize(
    ("detail", "expected"),
    [
        (_detail(), True),
        (_detail("cấp 12-13", "Gió mạnh cấp 12-13.", None, "Sức gió"), True),
        # The figure isn't in the quote, or the quote isn't in the source.
        (_detail("99 người"), False),
        (_detail("99 người", "99 người ở Quảng Ninh."), False),
        # A figure must be a number, and needs something to say what it measures.
        (_detail("nhiều người", "nhiều người"), False),
        (_detail(label=" "), False),
        # The quote doesn't name this place, or the place isn't on the map.
        (_detail("cấp 12-13", "Gió mạnh cấp 12-13."), False),
        (_detail(place="Hà Nội"), False),
    ],
)
def test_a_figure_read_by_a_model_must_be_in_the_sources_own_words(detail, expected):
    assert is_verified_detail(detail, SOURCE, PLACES_ON_MAP) is expected


def test_a_map_saves_only_the_figures_that_pass(client, fakes):
    fakes.llm.claims = [YAGI]
    fakes.llm.map_places = [MapPlace(name="Quảng Ninh", country="VN")]
    fakes.fetch.text = SOURCE * 8
    fakes.llm.map_details = [_detail(), _detail("99 người"), _detail("58 người")]
    details = run(client)["claims"][0]["locationMap"]["details"]
    assert details == [
        {
            "place": "vn-qn",
            "label": "Người bị thương",
            "value": "58 người",
            "publisher": "Example News",
            "url": "https://reuters.com/a",
        }
    ]


def test_a_failure_reading_figures_keeps_the_map(client, fakes):
    fakes.llm.claims = [YAGI]
    fakes.llm.map_places = [MapPlace(name="Quảng Ninh", country="VN")]
    real_complete = fakes.llm.complete

    def complete(model, system, user, schema, check=None):
        if schema is MapDetails:
            from harness.providers.llm import LLMError

            raise LLMError("down")
        return real_complete(model, system, user, schema, check)

    fakes.llm.complete = complete
    result = run(client)["claims"][0]["locationMap"]
    assert result["map"] == "vietnam"
    assert "details" not in result


def test_claims_without_a_map_never_ask_for_figures(client, fakes):
    run(client)
    assert not any(schema is MapDetails for _, schema in fakes.llm.calls)


DENSITY = "New Jersey is the most densely populated US state, ahead of Rhode Island."


def test_us_states_get_the_us_map_highlighted():
    result = _with_regions(DENSITY, ("New Jersey", "US", "New Jersey"), ("Rhode Island", "US", "Rhode Island"))
    assert result["map"] == "us"
    assert result["places"][0] == {"code": "us-nj", "name": "New Jersey", "named": "New Jersey"}
    assert [place["code"] for place in result["places"]] == ["us-nj", "us-ri"]


def test_a_state_named_only_as_a_place_still_counts():
    assert _with_regions(DENSITY, ("New Jersey", "US", None))["places"][0]["code"] == "us-nj"


def test_a_state_the_claim_doesnt_name_is_dropped():
    assert _with_regions(DENSITY, ("Texas", "US", "Texas")) is None


def test_a_state_and_a_place_elsewhere_share_the_world_map():
    text = "A storm hit Florida and then Cuba."
    result = _with_regions(text, ("Florida", "US", "Florida"), ("Cuba", "CU", None))
    assert result["map"] == "world"
    usa = next(place for place in result["places"] if place["code"] == "us")
    assert usa["regions"] == [{"name": "Florida", "code": "us-fl"}]


def test_figures_about_density_come_from_the_news_and_must_be_in_its_words(client, fakes):
    fakes.llm.claims = [DENSITY]
    fakes.llm.map_places = [MapPlace(name="New Jersey", country="US", region="New Jersey")]
    quote = "New Jersey has 1,263 people per square mile."
    fakes.fetch.text = ((quote + " ") * 8 + " ") * 12
    fakes.llm.map_details = [
        MapDetail(evidence_id="E1", place="New Jersey", label="Density", value="1,263 people per square mile", quote=quote),
        MapDetail(evidence_id="E1", place="New Jersey", label="Density", value="9,999 people per square mile", quote=quote),
    ]
    result = run(client)["claims"][0]["locationMap"]
    assert result["map"] == "us"
    assert [detail["value"] for detail in result["details"]] == ["1,263 people per square mile"]
    assert result["details"][0]["place"] == "us-nj"


@pytest.mark.parametrize("zoom", ["close", "region", "wide"])
def test_the_map_opens_as_close_as_the_model_chose(zoom):
    item = ExtractedClaim(text=YAGI, checkworthiness=0.9, map_places=[MapPlace(name="Quảng Ninh", country="VN")], map_zoom=zoom)
    assert build_location_map(item, Settings())["zoom"] == zoom


def test_without_a_choice_the_map_has_no_zoom():
    item = ExtractedClaim(text=YAGI, checkworthiness=0.9, map_places=[MapPlace(name="Quảng Ninh", country="VN")])
    assert "zoom" not in build_location_map(item, Settings())


def test_the_figures_step_finds_passages_that_dont_repeat_the_claims_words(client, fakes):
    filler = " ".join(["The storm reached Quảng Ninh on Saturday and the coast was closed."] * 12)
    figures = " ".join(["Officials counted 58 injured and winds reached level 12 across the area."] * 12)
    fakes.fetch.text = "\n".join([filler] * 8 + [figures])
    fakes.llm.claims = [YAGI]
    fakes.llm.map_places = [MapPlace(name="Quảng Ninh", country="VN")]
    run(client)
    prompt = next(user for schema, _, user in fakes.llm.prompts if schema is MapDetails)
    assert "58 injured" in prompt

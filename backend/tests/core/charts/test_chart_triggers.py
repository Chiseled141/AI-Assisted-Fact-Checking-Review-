import httpx
import pytest

from claimtrace.core.charts.chart_triggers import add_chart_requests
from claimtrace.core.charts.country_map import is_stat_claim
from claimtrace.core.charts.election_map import is_us_election_claim
from claimtrace.core.charts.price_chart import is_price_claim
from claimtrace.core.charts.seat_chart import is_verified_seat, is_verified_total
from claimtrace.core.pipeline.prompts import ExtractedClaim, ReportedSeat
from claimtrace.core.providers.errors import get_with_retry
from tests.helpers import run


def _claim(text, **fields):
    return add_chart_requests(ExtractedClaim(text=text, checkworthiness=0.9, **fields))


@pytest.mark.parametrize(
    ("text", "asset"),
    [
        ("Brent crude oil fell below $20 per barrel in April 2020.", "oil"),
        ("Gold hit a record in 2020.", "gold"),
        ("Giá vàng SJC vượt 90 triệu đồng/lượng ngày 18/3/2024.", "sjc_gold"),
        ("Ethereum reached $4,800 in November 2021.", "ethereum"),
    ],
)
def test_a_clear_price_claim_gets_its_chart_even_if_the_model_left_it_out(text, asset):
    assert _claim(text).price_asset == asset


@pytest.mark.parametrize(
    "text",
    [
        "She won a gold medal in Paris.",
        "El Salvador holds more than 5,000 bitcoin.",
        "The line opened on 6 November 2021.",
        "Giá vàng nhẫn DOJI vượt 80 triệu đồng/lượng.",
    ],
)
def test_a_claim_that_is_not_about_a_price_gets_no_price_chart(text):
    assert _claim(text).price_asset is None


def test_a_clear_election_claim_gets_its_charts_and_the_models_choice_stands():
    claim = _claim("The Liberal Party won 169 seats in the 2025 election to the Canadian House of Commons.")
    assert (claim.seat_chart.body, claim.seat_chart.year) == ("Canadian House of Commons", 2025)
    assert claim.election_map is None
    us = _claim("Republicans won 220 seats in the 2024 election to the US House of Representatives.")
    assert us.seat_chart.body == "US House of Representatives"
    assert (us.election_map.office, us.election_map.year) == ("house", 2024)
    assert _claim("Trump carried Ohio in the 2024 US presidential election.").election_map.office == "president"
    assert _claim("Gold rose above $2,000.", price_asset="silver").price_asset == "silver"


def test_a_clear_exchange_rate_gets_a_price_chart_and_a_dollar_price_does_not():
    assert _claim("Tỷ giá USD/VND vượt 26.000 đồng ngày 2/4/2025.").price_asset == "usd_vnd"
    assert _claim("Bitcoin rose above 100,000 USD.").price_asset == "bitcoin"
    assert _claim("Apple shares rose to 200 USD.").price_asset is None


def test_an_age_claim_gets_a_pyramid_in_place_of_a_country_map():
    claim = _claim("Người từ 65 tuổi trở lên chiếm 9% dân số Việt Nam năm 2023.")
    assert (claim.population_pyramid.country, claim.population_pyramid.year) == ("VN", 2023)
    assert claim.country_stat is None
    assert _claim("Japan's population is ageing faster than Vietnam's.").population_pyramid is None


def test_a_clear_statistic_gets_a_country_map():
    claim = _claim("Vietnam has 100 million people in 2023.")
    assert claim.country_stat.indicator == "population"
    assert [place.country for place in claim.country_stat.countries] == ["VN"]
    assert claim.country_stat.year == 2023


def test_the_gates_let_clear_claims_through():
    assert is_price_claim("Gold hit a record in 2020.", "gold")
    assert is_stat_claim("Vietnam has 100 million people.", "population")
    assert is_us_election_claim("Biden won the 2020 election.", "president", 2020)
    assert not is_us_election_claim("Modi won the 2024 election to the Lok Sabha.", "president", 2024)
    assert not is_us_election_claim("Biden won the 2021 election.", "president", 2021)


PAGE = "Canada election results. Seats won by party. Liberal 169 Conservative 144 Bloc Québécois 22 NDP 7 Green 1."


@pytest.mark.parametrize(
    ("party", "seats", "quote", "page", "expected"),
    [
        ("Liberal", 169, "Liberal 169", PAGE, True),
        ("Green", 1, "Green 1", PAGE, True),
        # The figure is wrong, the page never talks about seats, or the row counts something else.
        ("Liberal", 170, "Liberal 169", PAGE, False),
        ("Liberal", 169, "Liberal 169", "Liberal 169 Conservative 144", False),
        ("Liberal", 169, "Liberal 169 votes", "Seats won. Liberal 169 votes", False),
        ("Liberal", 43, "Liberal 43.7%", "Seats won. Liberal 43.7%", False),
        # Not a row at all: a long sentence still has to say seats.
        ("Liberal", 169, "The Liberal leader spoke to 169 people for a long time about housing and the economy last night",
         "Seats. The Liberal leader spoke to 169 people for a long time about housing and the economy last night", False),
    ],
)
def test_a_results_table_row_counts_only_on_a_page_about_seats(party, seats, quote, page, expected):
    assert is_verified_seat(ReportedSeat(evidence_id="E1", party=party, seats=seats, quote=quote), page) is expected


def test_a_chambers_size_can_be_stated_as_members():
    from claimtrace.core.pipeline.prompts import ReportedTotal

    quote = "Voting was held for the 343-member House of Commons."
    assert is_verified_total(ReportedTotal(evidence_id="E1", seats=343, quote=quote), quote)


def test_a_skipped_chart_says_why_on_the_screen(client, fakes):
    fakes.llm.claims = ["The line opened on 6 November 2021."]
    fakes.llm.price_asset = "bitcoin"
    row = next(event for event in run(client)["progress"] if event["kind"] == "data")
    assert (row["chart"], row["service"], row["status"]) == ("price", "ClaimTrace", "completed")
    assert "did not fit" in row["summary"]


@pytest.mark.parametrize("first", [httpx.Response(429), httpx.Response(503), httpx.ConnectError("down"), httpx.ReadTimeout("slow")])
def test_a_temporary_failure_gets_a_second_try(monkeypatch, first):
    replies = [first, httpx.Response(200)]
    calls = []

    def get(url, **options):
        calls.append(url)
        reply = replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply

    monkeypatch.setattr(httpx, "get", get)
    assert get_with_retry("https://x", 2, 0).status_code == 200
    assert len(calls) == 2


def test_a_lasting_or_final_failure_is_not_retried_forever(monkeypatch):
    calls = []

    def get(url, **options):
        calls.append(url)
        return httpx.Response(404)

    monkeypatch.setattr(httpx, "get", get)
    assert get_with_retry("https://x", 3, 0).status_code == 404
    assert len(calls) == 1

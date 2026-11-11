import pytest

from harness.charts.seat_chart import is_election_claim, is_verified_seat, is_verified_total
from harness.pipeline.passages import page_for_reading
from harness.pipeline.prompts import ReportedSeat, ReportedSeats, ReportedTotal, SeatChartRequest
from tests.helpers import run

CLAIM = "Labour won 412 seats in the 2024 election to the House of Commons."
LABOUR = "Labour had won 412 seats with a 33.8% share of the vote."
TORIES = "The Conservatives had 121 seats from a 23.7% vote share."
TOTAL = "Labour won nearly two-thirds of the seats in the 650-seat House of Commons."
PAGE = f"{LABOUR} {TORIES} {TOTAL} "
US_HOUSE = "A win for Democratic candidate Adam Gray leaves his party on 215 seats, compared with the Republicans' 220."


def _seat(party="Labour", seats=412, quote=LABOUR, evidence_id="E1"):
    return ReportedSeat(evidence_id=evidence_id, party=party, seats=seats, quote=quote)


@pytest.mark.parametrize(
    ("text", "body", "expected"),
    [
        (CLAIM, "House of Commons", True),
        ("Công đảng giành 412 ghế tại Hạ viện Anh trong tổng tuyển cử 2024.", "Hạ viện Anh", True),
        # It names the chamber, but says nothing about seats.
        ("The House of Commons voted to pass the budget.", "House of Commons", False),
        # The claim doesn't name the chamber the model gave.
        (CLAIM, "Bundestag", False),
        # Seats, but not in an election.
        ("The stadium in Hanoi has 40,000 seats.", "stadium", False),
    ],
)
def test_only_a_claim_about_seats_in_an_election_gets_a_chart(text, body, expected):
    assert is_election_claim(text, body) is expected


@pytest.mark.parametrize(
    ("report", "text", "expected"),
    [
        (_seat(), PAGE, True),
        (_seat("Conservatives", 121, TORIES), PAGE, True),
        (
            _seat("Đảng Xanh", 4, "Đảng Xanh và đảng Cải cách đều giành được 4 ghế."),
            "Đảng Xanh và đảng Cải cách đều giành được 4 ghế.",
            True,
        ),
        # Sources and models write a party's name in different forms.
        (_seat("Democrats", 215, US_HOUSE), US_HOUSE, True),
        (_seat("Democratic Party", 215, US_HOUSE), US_HOUSE, True),
        (_seat("Republican", 220, US_HOUSE), US_HOUSE, True),
        # A different party that only starts the same way still fails.
        (_seat("Democratic Unionist Party", 215, US_HOUSE), US_HOUSE, False),
        # The number isn't in the quote, or the quote isn't in the article.
        (_seat(seats=500), PAGE, False),
        (_seat(quote="Labour had won 500 seats."), PAGE, False),
        # Part of a bigger number isn't the number.
        (_seat(seats=12), PAGE, False),
        # The quote is about another party, or isn't about seats.
        (_seat("Reform"), PAGE, False),
        (_seat(quote="Labour had 412 votes."), "Labour had 412 votes.", False),
    ],
)
def test_a_count_read_by_a_model_must_be_in_the_articles_own_words(report, text, expected):
    assert is_verified_seat(report, text) is expected


@pytest.mark.parametrize(
    "quote",
    [
        "Công đảng đã giành được 410 ghế tính đến thời điểm hiện tại.",
        "Theo kết quả sơ bộ, Công đảng có 410 ghế.",
        "Labour is projected to win 410 seats.",
        "The exit poll gave Labour 410 seats.",
        "So far Labour has 410 seats.",
    ],
)
def test_a_count_from_before_the_final_result_is_dropped(quote):
    assert not is_verified_seat(_seat("Labour" if "Labour" in quote else "Công đảng", 410, quote), quote)


def test_the_chambers_size_must_be_stated_too():
    assert is_verified_total(ReportedTotal(evidence_id="E1", seats=650, quote=TOTAL), PAGE)
    assert not is_verified_total(ReportedTotal(evidence_id="E1", seats=600, quote=TOTAL), PAGE)
    assert not is_verified_total(None, PAGE)


def _run(client, fakes, parties, total=650, url_count=1):
    fakes.llm.claims = [CLAIM]
    fakes.llm.seat_chart = SeatChartRequest(body="House of Commons", year=2024)
    fakes.fetch.published_at = "2024-07-05"
    fakes.fetch.text = PAGE * 8
    fakes.search.results = ["https://reuters.com/a", "https://bbc.com/b"][:url_count]
    fakes.llm.reported_seats = ReportedSeats(
        total=ReportedTotal(evidence_id="E1", seats=total, quote=TOTAL) if total else None, parties=parties
    )
    return run(client)["claims"][0]


def test_a_check_saves_the_counts_that_pass_biggest_first(client, fakes):
    chart = _run(client, fakes, [_seat("Conservatives", 121, TORIES), _seat(), _seat("Reform", 5, TORIES)])["seatChart"]
    assert chart["total"] == 650
    assert [(party["name"], party["seats"]) for party in chart["parties"]] == [("Labour", 412), ("Conservatives", 121)]
    assert chart["parties"][0]["url"] == "https://reuters.com/a"


def test_when_sources_disagree_the_common_count_is_drawn_and_the_other_stays(client, fakes):
    fakes.fetch.text = ""
    other = "Labour won 411 seats."
    chart = _run(client, fakes, [])
    assert chart["seatChart"] is None

    fakes.llm.reported_seats = None
    fakes.fetch.text = (PAGE + other + " ") * 8
    fakes.llm.claims = [CLAIM]
    fakes.llm.reported_seats = ReportedSeats(
        total=ReportedTotal(evidence_id="E1", seats=650, quote=TOTAL),
        parties=[
            _seat(),
            _seat(evidence_id="E2"),
            _seat(seats=411, quote=other, evidence_id="E3"),
            _seat("Conservatives", 121, TORIES),
        ],
    )
    fakes.search.results = ["https://reuters.com/a", "https://bbc.com/b", "https://apnews.com/c"]
    labour = run(client)["claims"][0]["seatChart"]["parties"][0]
    assert labour["seats"] == 412
    assert [other_count["seats"] for other_count in labour["others"]] == [411]


def test_a_second_count_from_one_article_is_another_elections(client, fakes):
    last_time = "The Conservatives won 365 seats, with Labour returning just 203."
    fakes.fetch.text = f"{PAGE}{last_time} " * 4
    fakes.llm.claims = [CLAIM]
    fakes.llm.seat_chart = SeatChartRequest(body="House of Commons", year=2024)
    fakes.fetch.published_at = "2024-07-05"
    fakes.llm.reported_seats = ReportedSeats(
        total=ReportedTotal(evidence_id="E1", seats=650, quote=TOTAL),
        parties=[_seat(), _seat("Conservatives", 121, TORIES), _seat("Labour", 203, last_time)],
    )
    labour = run(client)["claims"][0]["seatChart"]["parties"][0]
    assert (labour["seats"], labour["others"]) == (412, [])


@pytest.mark.parametrize(
    "parties",
    [
        [_seat()],  # A verified partial chamber can show its unreported remainder in grey.
        [_seat(), _seat("Conservatives", 121, TOTAL)],  # The number isn't in that quote.
    ],
)
def test_verified_partial_results_are_kept_without_inventing_other_parties(client, fakes, parties):
    chart = _run(client, fakes, parties)["seatChart"]
    assert chart["total"] == 650
    assert [(party['name'], party['seats']) for party in chart['parties']] == [('Labour', 412)]


def test_no_verified_party_draws_nothing(client, fakes):
    assert _run(client, fakes, [_seat('Conservatives', 121, TOTAL)])["seatChart"] is None


def test_no_stated_size_or_a_sum_above_it_draws_nothing(client, fakes):
    assert _run(client, fakes, [_seat(), _seat("Conservatives", 121, TORIES)], total=None)["seatChart"] is None
    fakes.fetch.text = (PAGE + "The chamber has 500 seats. ") * 8
    fakes.llm.reported_seats = ReportedSeats(
        total=ReportedTotal(evidence_id="E1", seats=500, quote="The chamber has 500 seats."),
        parties=[_seat(), _seat("Conservatives", 121, TORIES)],
    )
    assert run(client)["claims"][0]["seatChart"] is None


def test_other_claims_never_ask_for_seats_and_a_failure_keeps_the_check(client, fakes):
    assert run(client)["claims"][0]["seatChart"] is None
    assert not any(schema is ReportedSeats for _, schema in fakes.llm.calls)

    fakes.llm.claims = [CLAIM]
    fakes.llm.seat_chart = SeatChartRequest(body="House of Commons", year=2024)
    fakes.fetch.published_at = "2024-07-05"
    real = fakes.llm.complete

    def complete(model, system, user, schema, check=None):
        if schema is ReportedSeats:
            from harness.providers.llm import LLMError

            raise LLMError("down")
        return real(model, system, user, schema, check)

    fakes.llm.complete = complete
    claim = run(client)["claims"][0]
    assert claim["seatChart"] is None
    assert claim["status"] == "assessed"


def test_two_spellings_of_one_party_are_one_party_on_the_chart(client, fakes):
    fakes.llm.claims = ["Republicans won 220 seats in the 2024 election to the House of Representatives."]
    fakes.llm.seat_chart = SeatChartRequest(body="House of Representatives", year=2024)
    fakes.fetch.published_at = "2024-12-05"
    sentence = "Republicans won 220 seats in the 435-seat House. Democrats won 215 seats in the House."
    fakes.fetch.text = f"{sentence} " * 20
    fakes.search.results = ["https://reuters.com/a", "https://bbc.com/b"]
    fakes.llm.reported_seats = ReportedSeats(
        total=ReportedTotal(evidence_id="E1", seats=435, quote="Republicans won 220 seats in the 435-seat House."),
        parties=[
            _seat("Republicans", 220, "Republicans won 220 seats in the 435-seat House."),
            _seat("Republican", 220, "Republicans won 220 seats in the 435-seat House.", "E2"),
            _seat("Democrats", 215, "Democrats won 215 seats in the House."),
        ],
    )
    chart = run(client)["claims"][0]["seatChart"]
    assert [(party["name"], party["seats"]) for party in chart["parties"]] == [("Republicans", 220), ("Democrats", 215)]


def _seat_check(fakes):
    fakes.llm.claims = [CLAIM]
    fakes.llm.seat_chart = SeatChartRequest(body="House of Commons", year=2024)
    fakes.fetch.published_at = "2024-07-05"
    fakes.fetch.text = PAGE * 8
    fakes.llm.reported_seats = ReportedSeats(total=ReportedTotal(evidence_id="E1", seats=650, quote=TOTAL), parties=[_seat()])


def _seat_prompt(fakes):
    return next(user for schema, _, user in fakes.llm.prompts if schema is ReportedSeats)


def test_the_chart_model_reads_a_whole_page_not_just_the_passages_nearest_the_claim(client, fakes):
    _seat_check(fakes)
    far_away = "Unrelated reporting about the weather and the economy. " * 60
    fakes.fetch.text = f"{PAGE}{far_away}The Liberal Democrats finished with 72 seats overall."
    run(client)
    assert "The Liberal Democrats finished with 72 seats overall." in _seat_prompt(fakes)


def test_a_very_long_page_is_cut_to_its_most_relevant_passages():
    page = "Unrelated reporting about the weather and the economy here. " * 2000 + LABOUR
    text = page_for_reading(page, "Labour seats", 1500)
    assert len(text) <= 1500
    assert LABOUR in text

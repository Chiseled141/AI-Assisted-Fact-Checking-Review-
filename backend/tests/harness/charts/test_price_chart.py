from concurrent.futures import ThreadPoolExecutor
from datetime import date
from types import SimpleNamespace

import httpx
import pytest

from config.settings import Settings
from harness.charts.data_sources import MarketError, YahooMarketData
from harness.charts.price_chart import (
    _search_months,
    build_price_chart,
    build_sjc_chart,
    drop_bad_rates,
    is_price_claim,
    is_verified_report,
    price_table,
)
from harness.pipeline.prompts import ExtractedClaim, PriceEvent, ReportedPrice, ReportedPrices
from harness.search.fetcher import FetchError, Page
from harness.search.tavily import SJC_DOMAINS, SJC_PAGES, SearchHit
from tests.helpers import run

BITCOIN = "Bitcoin's price rose above $100,000 on 5 December 2024."
SJC = "Giá vàng SJC vượt 90 triệu đồng/lượng ngày 18/3/2024."


@pytest.mark.parametrize(
    ("text", "asset", "expected"),
    [
        (BITCOIN, "bitcoin", True),
        ("Giá vàng thế giới đạt đỉnh 2.700 USD/ounce vào tháng 10/2024.", "gold", True),
        ("Brent oil traded near $80 in March 2024.", "oil", True),
        # It names the asset, but not its price.
        ("El Salvador holds more than 5,000 bitcoin.", "bitcoin", False),
        ("Vietnam won a gold medal at the 2024 Games.", "gold", False),
        # It states a price, but the asset isn't in the claim, or isn't one we track.
        ("The metro ticket price is VND8,000.", "gold", False),
        ("The price of rice rose in 2024.", "rice", False),
        # SJC gold has its own price, and is never charted as the world price.
        ("Giá vàng SJC vượt 90 triệu đồng/lượng ngày 18/3/2024.", "gold", False),
        ("Giá vàng SJC vượt 90 triệu đồng/lượng ngày 18/3/2024.", "sjc_gold", True),
        ("SJC opened a new shop in Hanoi.", "sjc_gold", False),
        # Local prices we have no data for.
        ("Giá vàng nhẫn DOJI vượt 80 triệu đồng/lượng.", "gold", False),
        ("Giá vàng nhẫn SJC vượt 80 triệu đồng/lượng.", "sjc_gold", False),
        # The market exchange rate, and only when the claim says it is a rate.
        ("Tỷ giá USD/VND vượt 26.000 đồng ngày 2/4/2025.", "usd_vnd", True),
        ("1 USD đổi được 25.000 đồng vào tháng 6/2024.", "usd_vnd", True),
        ("The dong weakened to 25,000 against the dollar in 2024.", "usd_vnd", True),
        ("A Tesla costs 30,000 USD, about 750 million VND.", "usd_vnd", False),
        ("Apple shares rose to 200 USD.", "usd_vnd", False),
        # Rates with figures of their own.
        ("Vietcombank bán ra 26.300 đồng/USD, theo tỷ giá hôm nay.", "usd_vnd", False),
        ("Tỷ giá USD chợ đen vượt 27.000 đồng.", "usd_vnd", False),
        ("Tỷ giá trung tâm USD/VND là 24.000 đồng.", "usd_vnd", False),
    ],
)
def test_only_a_claim_about_the_price_of_a_tracked_asset_gets_a_chart(text, asset, expected):
    assert is_price_claim(text, asset) is expected


def test_wrong_days_in_the_exchange_rate_go_and_a_real_devaluation_stays():
    rates = [19_000, 19_010, 189, 19_020, 19_030, 19_040, 20_500, 20_510, 20_520, 20_530, 20_540]
    kept = [close for _, close in drop_bad_rates([[index, close] for index, close in enumerate(rates)], 0.015)]
    assert 189 not in kept
    assert kept == [close for close in rates if close != 189]


def test_an_exchange_rate_chart_is_in_dong():
    class Market:
        name = "Test market"

        def daily_closes(self, symbol, start, end):
            assert symbol == "VND=X"
            return [[1, 25_000.0], [2, 25_010.0], [3, 25_020.0]]

    item = ExtractedClaim(text="Tỷ giá USD/VND vượt 25.000 đồng.", checkworthiness=0.9, price_asset="usd_vnd")
    chart = build_price_chart(item, Market(), Settings())
    assert (chart["asset"], chart["currency"]) == ("usd_vnd", "VND")
    assert "not a bank's" in price_table(chart)


def test_a_price_claim_saves_market_prices_and_its_events(client, fakes):
    fakes.llm.claims = [BITCOIN]
    fakes.llm.price_asset = "bitcoin"
    chart = run(client)["claims"][0]["priceChart"]
    assert fakes.market.calls == ["BTC-USD"]
    assert chart["asset"] == "bitcoin"
    assert chart["source"] == "Yahoo Finance"
    assert chart["prices"] == [[1733356800000, 98000.5], [1733443200000, 101000.25]]
    assert chart["events"] == [{"date": "2024-12-05", "title": "Passed $100,000", "text": "It passed $100,000."}]


def test_other_claims_get_no_chart_and_no_market_call(client, fakes):
    claim = run(client)["claims"][0]
    assert claim["priceChart"] is None
    assert fakes.market.calls == []


def test_a_wrong_guess_from_the_model_draws_no_chart(client, fakes):
    fakes.llm.price_asset = "gold"
    assert run(client)["claims"][0]["priceChart"] is None
    assert fakes.market.calls == []


QUOTE_MARCH = "Ngày 18/3, vàng miếng SJC bán ra 81,5 triệu đồng/lượng."
QUOTE_APRIL = "Vàng SJC có giá bán 90.500.000 đồng/lượng."


def _report(quote=QUOTE_MARCH, day="2024-03-18", price=81.5, evidence_id="E1"):
    return ReportedPrice(evidence_id=evidence_id, date=day, sell_price=price, quote=quote)


def _page(published="2024-04-02"):
    return Page(url="https://vnexpress.net/a", title="Giá vàng", text=f"{QUOTE_MARCH} {QUOTE_APRIL}", published_at=published)


@pytest.mark.parametrize(
    ("report", "expected"),
    [
        (_report(), True),
        (_report(QUOTE_APRIL, "2024-04-02", 90.5), True),
        # The figure isn't in the quote, or the quote isn't in the article.
        (_report(price=99.0), False),
        (_report("Ngày 18/3, vàng miếng SJC bán ra 99 triệu đồng/lượng.", price=99.0), False),
        # The day is neither stated in the quote nor the day the article came out.
        (_report(QUOTE_APRIL, "2024-03-30", 90.5), False),
        (_report(day="2024-03-19"), False),
        # A date that hasn't happened yet, or isn't a date.
        (_report(QUOTE_APRIL, "2999-04-02", 90.5), False),
        (_report(day="18/3/2024"), False),
    ],
)
def test_a_price_read_by_a_model_must_be_in_the_articles_own_words(report, expected):
    assert is_verified_report(report, _page(), date(2026, 11, 3)) is expected


@pytest.mark.parametrize(
    "quote",
    [
        "Ngày 18/3, vàng SJC mua vào 81,5 triệu đồng/lượng.",  # Not the selling price.
        "Ngày 18/3, vàng nhẫn SJC bán ra 81,5 triệu đồng/lượng.",  # Ring gold.
        "Ngày 18/3, vàng DOJI bán ra 81,5 triệu đồng/lượng.",  # Another brand.
        "Ngày 18/3, tại Mi Hồng, vàng SJC bán ra 81,5 triệu đồng/lượng.",  # A dealer's own price.
    ],
)
def test_other_gold_prices_are_not_read_as_sjc(quote):
    page = Page(url="https://x", title="t", text=quote, published_at="2024-03-18")
    assert not is_verified_report(_report(quote), page, date(2026, 11, 3))


def test_the_buying_price_of_a_pair_is_not_read_as_the_selling_price():
    quote = "Ngày 3/4, SJC niêm yết vàng miếng mua vào-bán ra ở mức 171-174,5 triệu đồng/lượng."
    page = Page(url="https://x", title="t", text=quote, published_at="2026-04-03")
    assert is_verified_report(_report(quote, "2026-04-03", 174.5), page, date(2026, 11, 3))
    assert not is_verified_report(_report(quote, "2026-04-03", 171.0), page, date(2026, 11, 3))

    quote = "SJC niêm yết ở mức 88,8 triệu đồng-91,3 triệu đồng/lượng (mua vào-bán ra)."
    page = Page(url="https://x", title="t", text=quote, published_at="2024-05-13")
    assert is_verified_report(_report(quote, "2024-05-13", 91.3), page, date(2026, 11, 3))
    assert not is_verified_report(_report(quote, "2024-05-13", 88.8), page, date(2026, 11, 3))


def test_a_date_in_an_articles_own_style_counts():
    for quote, day in (
        ("Chiều 5.6, SJC bán ra 77,98 triệu đồng.", "2024-06-05"),
        ("SJC bán trưa 11-5 ở mức 77,98 triệu.", "2024-05-11"),
    ):
        page = Page(url="https://x", title="t", text=quote, published_at="2024-07-01")
        assert is_verified_report(_report(quote, day, 77.98), page, date(2026, 11, 3))


def _sjc_run(client, fakes, reports):
    fakes.llm.claims = [SJC]
    fakes.llm.price_asset = "sjc_gold"
    fakes.llm.reported_prices = reports
    fakes.fetch.text = f"{QUOTE_MARCH} {QUOTE_APRIL} " * 8
    return run(client)["claims"][0]


def test_sjc_prices_come_from_the_news_with_a_source_for_each(client, fakes):
    fakes.fetch.published_at = "2024-04-02"
    chart = _sjc_run(client, fakes, [_report(QUOTE_APRIL, "2024-04-02", 90.5), _report(), _report(price=99.0)])["priceChart"]
    assert chart["currency"] == "VND"
    assert chart["source"] == "news"
    assert [price for _, price in chart["prices"]] == [81_500_000, 90_500_000]
    assert [report["date"] for report in chart["reports"]] == ["2024-03-18", "2024-04-02"]
    assert chart["reports"][0]["url"] == "https://sjc.com.vn/bieu-do-gia-vang"
    assert chart["reports"][0]["quote"] == QUOTE_MARCH
    assert chart["unit"] == "VND/tael"
    assert chart["priceType"] == "selling"
    assert fakes.market.calls == []


def test_sjc_gets_no_chart_from_a_single_price_and_never_the_world_price(client, fakes):
    claim = _sjc_run(client, fakes, [_report()])
    assert claim["priceChart"] is None
    assert claim["status"] == "assessed"
    assert fakes.market.calls == []


def test_an_sjc_price_failure_only_costs_the_chart(client, fakes):
    fakes.llm.failing = {"anthropic/claude-haiku-5.5"}
    fakes.llm.claims = [SJC]
    assert (
        build_sjc_chart(
            ExtractedClaim(text=SJC, checkworthiness=0.9, price_asset="sjc_gold"),
            fakes.search,
            fakes.fetch,
            fakes.llm,
            Settings(),
            ThreadPoolExecutor(2),
        )
        is None
    )


def test_other_claims_never_search_for_sjc_prices(client, fakes):
    run(client)
    assert not any(schema is ReportedPrices for _, schema in fakes.llm.calls)


def test_sjc_uses_its_own_domains_and_full_tavily_text_when_the_reader_is_blocked(fakes):
    asked, fetched = [], []
    url = "https://vnexpress.net/gia-vang"
    march = "Ngày 18/3/2024, vàng miếng SJC bán ra 81,5 triệu đồng/lượng."
    april = "Ngày 2/4/2024, SJC bán ra 90,5 triệu đồng/lượng."
    raw = f"{march} {april} " * 8

    def search_hits(query, **options):
        asked.append(options)
        return [SearchHit("https://nasa.gov/unrelated"), SearchHit(url, raw_content=raw)]

    def fetch(url):
        fetched.append(url)
        raise FetchError("blocked")

    fakes.llm.reported_prices = [_report(march), _report(april, "2024-04-02", 90.5)]
    # With no article publication date, the quote itself must state the price's day.
    with ThreadPoolExecutor(2) as pool:
        chart = build_sjc_chart(
            ExtractedClaim(text=SJC, checkworthiness=0.9, price_asset="sjc_gold"),
            SimpleNamespace(search_hits=search_hits), fetch, fakes.llm, Settings(sjc_chart_search_months=1), pool,
        )
    assert chart and all(report["url"] == url for report in chart["reports"])
    assert asked[0]["domains"] == list(SJC_DOMAINS)
    assert asked[0]["newest_first"] is False
    assert "https://nasa.gov/unrelated" not in fetched
    assert set(SJC_PAGES) <= set(fetched)


def test_sjc_never_invents_the_year_of_a_historical_price():
    assert not is_verified_report(_report(), _page(published=None), date(2026, 11, 3))
    assert not is_verified_report(_report(), _page(published="2025-04-02"), date(2026, 11, 3))
    quote = "Ngày 18/3/2024, SJC bán ra 81,5 triệu đồng/lượng."
    page = Page(url="https://sjc.com.vn/report", title="SJC", text=quote)
    assert is_verified_report(_report(quote), page, date(2026, 11, 3))
    wrong_year = quote.replace("2024", "2023")
    page = Page(url="https://sjc.com.vn/report", title="SJC", text=wrong_year, published_at="2024-04-02")
    assert not is_verified_report(_report(wrong_year), page, date(2026, 11, 3))
    page = Page(url="https://sjc.com.vn/report", title="SJC", text=wrong_year, published_at="2024-03-18")
    assert not is_verified_report(_report(wrong_year), page, date(2026, 11, 3))


def test_sjc_rejects_redirects_outside_its_source_list(fakes):
    def fetch(url):
        return Page(url="https://bbc.com/redirected", title="Other source", text=QUOTE_MARCH * 8)

    with ThreadPoolExecutor(2) as pool:
        chart = build_sjc_chart(
            ExtractedClaim(text=SJC, checkworthiness=0.9, price_asset="sjc_gold"),
            fakes.search, fetch, fakes.llm, Settings(sjc_chart_search_months=1), pool,
        )
    assert chart is None
    assert not fakes.llm.calls


def test_the_search_covers_the_months_around_the_claim():
    item = ExtractedClaim(
        text=SJC, checkworthiness=0.9, price_asset="sjc_gold", price_events=[PriceEvent(date="2024-03-18", title="t", text="t")]
    )
    months = _search_months(item, date(2026, 11, 3), Settings(sjc_chart_search_months=3))
    assert months == [date(2024, 5, 1), date(2024, 4, 1), date(2024, 3, 1)]


def test_a_market_failure_only_costs_the_chart(client, fakes):
    fakes.llm.claims = [BITCOIN]
    fakes.llm.price_asset = "bitcoin"
    fakes.market.fails = True
    claim = run(client)["claims"][0]
    assert claim["priceChart"] is None
    assert claim["status"] == "assessed"


def test_yahoo_answers_become_daily_closes_and_gaps_are_dropped(monkeypatch):
    body = {
        "chart": {
            "result": [
                {
                    "timestamp": [1733374800, 1733461200, 1733547600],
                    "indicators": {"quote": [{"close": [2650.123, None, 2660.0]}]},
                }
            ]
        }
    }
    request = httpx.Request("GET", "https://x")
    monkeypatch.setattr(httpx, "get", lambda *a, **k: httpx.Response(200, json=body, request=request))
    closes = YahooMarketData(Settings()).daily_closes("GC=F", date(2024, 12, 1), date(2024, 12, 9))
    assert closes == [[1733356800000, 2650.12], [1733529600000, 2660.0]]

    monkeypatch.setattr(httpx, "get", lambda *a, **k: httpx.Response(200, json={"chart": {"result": None}}, request=request))
    with pytest.raises(MarketError):
        YahooMarketData(Settings()).daily_closes("GC=F", date(2024, 12, 1), date(2024, 12, 9))


def test_the_price_table_keeps_recent_days_and_one_day_a_month_before():
    from datetime import UTC, datetime, timedelta

    from harness.charts.price_chart import price_table

    start = datetime(2026, 1, 1, tzinfo=UTC)
    prices = [[int((start + timedelta(days=offset)).timestamp() * 1000), 2000 + offset] for offset in range(300)]
    table = price_table({"asset": "gold", "currency": "USD", "source": "Yahoo Finance", "prices": prices})
    lines = table.splitlines()
    assert lines[0] == "World gold price, daily closing prices, in USD. Source: Yahoo Finance."
    assert "2026-02-01: 2,031" in lines and "2026-02-02: 2,032" not in table
    dated_table = price_table({"asset": "gold", "prices": prices, "events": [{"date": "2026-02-02"}]})
    assert "2026-02-02: 2,032" in dated_table
    assert lines[-1] == "2026-10-27: 2,299"
    assert len(lines) < 80
    assert price_table(None) is None
    assert price_table({"prices": prices[:1]}) is None

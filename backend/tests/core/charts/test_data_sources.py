from datetime import date

import httpx
import pytest

from claimtrace.config.settings import Settings
from claimtrace.core.charts.data_sources import (
    CountryDataError,
    DataUsa,
    MarketError,
    StateDataError,
    WorldBankData,
    YahooMarketData,
)


def reply(monkeypatch, body):
    # A fake response can contain NaN/Infinity to cover malformed provider payloads without network access.
    class Response:
        def raise_for_status(self):
            pass
        def json(self):
            return body
        status_code = 200
    monkeypatch.setattr(httpx, 'get', lambda *args, **kwargs: Response())


@pytest.mark.parametrize('value', ['bad', True, float('nan'), float('inf')])
def test_invalid_numeric_provider_data_is_rejected_before_it_reaches_a_visual(monkeypatch, value):
    reply(monkeypatch, {'chart': {'result': [{'timestamp': [1700000000], 'indicators': {'quote': [{'close': [value]}]}}]}})
    with pytest.raises(MarketError):
        YahooMarketData(Settings()).daily_closes('GC=F', date(2024, 1, 1), date(2024, 2, 1))
    reply(monkeypatch, [{}, [{'countryiso3code': 'VNM', 'date': '2023', 'value': value}]])
    with pytest.raises(CountryDataError):
        WorldBankData(Settings()).by_country('population', 2023, 2024)
    reply(monkeypatch, {'data': [{'State': 'Texas', 'Year': 2023, 'Population': value}]})
    with pytest.raises(StateDataError):
        DataUsa(Settings()).population_by_state()


def test_mismatched_price_arrays_raise_the_handled_provider_error(monkeypatch):
    reply(monkeypatch, {'chart': {'result': [{'timestamp': [1700000000, 1700086400], 'indicators': {'quote': [{'close': [100]}]}}]}})
    with pytest.raises(MarketError):
        YahooMarketData(Settings()).daily_closes('GC=F', date(2024, 1, 1), date(2024, 2, 1))

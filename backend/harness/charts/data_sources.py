"""Where chart numbers come from. Every value on a price chart, country map or state map comes from one of these
services, never from a model. One section per service.
"""

from datetime import UTC, date, datetime
from math import isfinite
from typing import Literal, Protocol, get_args

import httpx

from config.settings import Settings

from ..providers.errors import get_with_retry, service_failure

# ---------------------------------------------------------------------------------------------------------------------
# Daily market prices. The numbers on a price chart only ever come from here, never from a model.
# ---------------------------------------------------------------------------------------------------------------------

MarketAsset = Literal["bitcoin", "ethereum", "gold", "silver", "oil", "usd_vnd", "sjc_gold"]

# Each asset's symbol on Yahoo Finance. All are priced in US dollars, except the exchange rate, which is in dong.
MARKET_SYMBOLS: dict[str, str] = {
    "bitcoin": "BTC-USD",
    "ethereum": "ETH-USD",
    "gold": "GC=F",
    "silver": "SI=F",
    "oil": "BZ=F",
    "usd_vnd": "VND=X",
}
# SJC gold has its own price in dong, which Yahoo Finance does not carry.
assert set(MARKET_SYMBOLS) | {"sjc_gold"} == set(get_args(MarketAsset))


class MarketError(Exception):
    pass


class MarketData(Protocol):
    name: str

    def daily_closes(self, symbol: str, start: date, end: date) -> list[list[float]]:
        """Returns [timestamp in ms at UTC midnight, closing price] pairs, oldest first."""
        ...


def _epoch(day: date) -> int:
    return int(datetime(day.year, day.month, day.day, tzinfo=UTC).timestamp())


class YahooMarketData:
    name = "Yahoo Finance"

    def __init__(self, settings: Settings):
        self.timeout = settings.price_chart_timeout_seconds
        self.attempts, self.retry_seconds = settings.data_service_attempts, settings.data_service_retry_seconds

    def daily_closes(self, symbol: str, start: date, end: date) -> list[list[float]]:
        try:
            response = get_with_retry(
                f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
                self.attempts,
                self.retry_seconds,
                params={"period1": _epoch(start), "period2": _epoch(end), "interval": "1d"},
                headers={"User-Agent": "ClaimTrace/0.1 (non-commercial course project)"},
                timeout=self.timeout,
            )
            response.raise_for_status()
            result = response.json()["chart"]["result"][0]
            closes = zip(result["timestamp"], result["indicators"]["quote"][0]["close"], strict=True)
            prices = []
            for timestamp, close in closes:
                if close is None:
                    continue
                if any(isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value)
                       for value in (timestamp, close)):
                    raise ValueError("Invalid price point")
                prices.append([timestamp // 86400 * 86_400_000, round(close, 2)])
        except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as error:
            raise MarketError(service_failure(error)) from error
        # Markets open at different hours, so each close is filed under its day. Yahoo leaves gaps as null.
        return prices


# ---------------------------------------------------------------------------------------------------------------------
# National statistics by year. The numbers on a country map only ever come from here, never from a model.
# ---------------------------------------------------------------------------------------------------------------------

# Each statistic's indicator at the World Bank.
WORLD_BANK_INDICATORS = {
    "population": "SP.POP.TOTL",
    "gdp": "NY.GDP.MKTP.CD",
    "gdp_per_capita": "NY.GDP.PCAP.CD",
    "life_expectancy": "SP.DYN.LE00.IN",
}
# The World Bank's five-year age bands, youngest first. Each has one count for men and one for women.
AGE_BANDS = (
    "0004", "0509", "1014", "1519", "2024", "2529", "3034", "3539", "4044",
    "4549", "5054", "5559", "6064", "6569", "7074", "7579", "80UP",
)


class CountryDataError(Exception):
    pass


class CountryData(Protocol):
    name: str

    def by_country(self, indicator: str, start: int, end: int) -> dict[str, dict[int, float]]:
        """Returns {three-letter code: {year: value}}. Years with no value are left out."""
        ...

    def population_by_age(self, iso3: str, start: int, end: int) -> dict[int, tuple[list[float], list[float]]]:
        """Returns {year: (men, women)}, each with one count for every age band. A year missing any band is left out."""
        ...


class WorldBankData:
    """Their licence, CC BY 4.0, requires the credit on screen."""

    name = "World Bank"

    def __init__(self, settings: Settings):
        self.timeout = settings.country_map_timeout_seconds
        self.attempts, self.retry_seconds = settings.data_service_attempts, settings.data_service_retry_seconds

    def by_country(self, indicator: str, start: int, end: int) -> dict[str, dict[int, float]]:
        try:
            response = get_with_retry(
                f"https://api.worldbank.org/v2/country/all/indicator/{WORLD_BANK_INDICATORS[indicator]}",
                self.attempts,
                self.retry_seconds,
                params={"format": "json", "date": f"{start}:{end}", "per_page": 20000},
                headers={"User-Agent": "ClaimTrace/0.1 (non-commercial course project)"},
                timeout=self.timeout,
            )
            response.raise_for_status()
            rows = response.json()[1]
            found: dict[str, dict[int, float]] = {}
            for row in rows:
                if row["countryiso3code"] and row["value"] is not None:
                    value = row["value"]
                    if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value) or value < 0:
                        raise ValueError("Invalid country statistic")
                    found.setdefault(row["countryiso3code"], {})[int(row["date"])] = row["value"]
        except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as error:
            raise CountryDataError(service_failure(error)) from error
        return found

    def population_by_age(self, iso3: str, start: int, end: int) -> dict[int, tuple[list[float], list[float]]]:
        men = [f"SP.POP.{band}.MA" for band in AGE_BANDS]
        women = [f"SP.POP.{band}.FE" for band in AGE_BANDS]
        try:
            response = get_with_retry(
                f"https://api.worldbank.org/v2/country/{iso3}/indicator/{';'.join(men + women)}",
                self.attempts,
                self.retry_seconds,
                # These counts are in the Health Nutrition and Population database, not the default one.
                params={"source": 16, "format": "json", "date": f"{start}:{end}", "per_page": 2000},
                headers={"User-Agent": "ClaimTrace/0.1 (non-commercial course project)"},
                timeout=self.timeout,
            )
            response.raise_for_status()
            found: dict[int, dict[str, float]] = {}
            # A country with no figures comes back as null, which is no data rather than a failure.
            for row in response.json()[1] or []:
                value = row["value"]
                if value is None:
                    continue
                if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value) or value < 0:
                    raise ValueError("Invalid population figure")
                found.setdefault(int(row["date"]), {})[row["indicator"]["id"]] = value
        except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as error:
            raise CountryDataError(service_failure(error)) from error
        return {
            year: ([values[code] for code in men], [values[code] for code in women])
            for year, values in found.items()
            if all(code in values for code in men + women)
        }


# ---------------------------------------------------------------------------------------------------------------------
# US states by year. The numbers on a state map only ever come from here, never from a model.
# ---------------------------------------------------------------------------------------------------------------------

class StateDataError(Exception):
    pass


class StateData(Protocol):
    name: str

    def population_by_state(self) -> dict[str, dict[int, float]]:
        """Returns {state name: {year: population}}."""
        ...


class DataUsa:
    """Census Bureau estimates through Data USA, which needs no key. The Bureau's own API needs one and blocks some networks."""

    name = "Data USA (US Census Bureau)"

    def __init__(self, settings: Settings):
        self.timeout = settings.state_map_timeout_seconds
        self.attempts, self.retry_seconds = settings.data_service_attempts, settings.data_service_retry_seconds

    def population_by_state(self) -> dict[str, dict[int, float]]:
        try:
            response = get_with_retry(
                "https://api.datausa.io/tesseract/data.jsonrecords",
                self.attempts,
                self.retry_seconds,
                params={
                    "cube": "acs_yg_total_population_5",
                    "drilldowns": "State,Year",
                    "measures": "Population",
                    "limit": "2000,0",
                },
                headers={"User-Agent": "ClaimTrace/0.1 (non-commercial course project)"},
                timeout=self.timeout,
            )
            response.raise_for_status()
            found: dict[str, dict[int, float]] = {}
            for row in response.json()["data"]:
                if row["Population"] is not None:
                    value = row["Population"]
                    if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value) or value < 0:
                        raise ValueError("Invalid state population")
                    found.setdefault(row["State"], {})[int(row["Year"])] = row["Population"]
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as error:
            raise StateDataError(service_failure(error)) from error
        return found

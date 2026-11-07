"""Where chart numbers come from. Every value on a price chart, heatmap, country map or state map comes from one of these
services, never from a model. One section per service.
"""

import time
from datetime import UTC, date, datetime
from math import isfinite
from typing import Literal, Protocol, get_args

import httpx

from ..core.config import Settings
from ..providers.errors import get_with_retry, service_failure

# ---------------------------------------------------------------------------------------------------------------------
# Daily market prices. The numbers on a price chart only ever come from here, never from a model.
# ---------------------------------------------------------------------------------------------------------------------

MarketAsset = Literal["bitcoin", "ethereum", "gold", "silver", "oil", "sjc_gold"]

# Each asset's symbol on Yahoo Finance. All are priced in US dollars.
MARKET_SYMBOLS: dict[str, str] = {
    "bitcoin": "BTC-USD",
    "ethereum": "ETH-USD",
    "gold": "GC=F",
    "silver": "SI=F",
    "oil": "BZ=F",
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
# Weather over a grid of points, for one day. The numbers on a heatmap only ever come from here, never from a model.
# ---------------------------------------------------------------------------------------------------------------------

# Each metric's daily variable on Open-Meteo.
CLIMATE_VARIABLES = {"temperature": "temperature_2m_max", "rainfall": "precipitation_sum"}


class ClimateError(Exception):
    pass


class ClimateData(Protocol):
    name: str

    def day_values(self, metric: str, day: date, lats: list[float], lons: list[float]) -> list[float | None]:
        """Returns one value for each point, in the order given. A point with no data gives None."""
        ...


class OpenMeteoClimate:
    """The ERA5 reanalysis from Copernicus, through Open-Meteo. Their licence, CC BY 4.0, requires the credit on screen."""

    name = "Open-Meteo, ERA5 (Copernicus)"

    def __init__(self, settings: Settings):
        self.timeout = settings.heat_map_timeout_seconds
        self.attempts = settings.heat_map_attempts
        self.retry_seconds = settings.heat_map_retry_seconds

    def day_values(self, metric: str, day: date, lats: list[float], lons: list[float]) -> list[float | None]:
        variable = CLIMATE_VARIABLES[metric]
        try:
            for _ in range(self.attempts):
                response = httpx.get(
                    "https://archive-api.open-meteo.com/v1/archive",
                    params={
                        "latitude": ",".join(map(str, lats)),
                        "longitude": ",".join(map(str, lons)),
                        "start_date": day.isoformat(),
                        "end_date": day.isoformat(),
                        "daily": variable,
                        "timezone": "UTC",
                    },
                    headers={"User-Agent": "ClaimTrace/0.1 (non-commercial course project)"},
                    timeout=self.timeout,
                )
                if response.status_code != 429:
                    break
                time.sleep(self.retry_seconds)  # The free service limits bursts, so it asks us to slow down.
            response.raise_for_status()
            body = response.json()
            # A single point comes back as one object rather than a list.
            places = body if isinstance(body, list) else [body]
            values = [place["daily"][variable][0] for place in places]
            if any(value is not None and (isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value))
                   for value in values):
                raise ValueError("Invalid climate value")
        except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as error:
            raise ClimateError(service_failure(error)) from error
        if len(values) != len(lats):
            raise ClimateError("The service returned invalid data.")
        return values


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


class CountryDataError(Exception):
    pass


class CountryData(Protocol):
    name: str

    def by_country(self, indicator: str, start: int, end: int) -> dict[str, dict[int, float]]:
        """Returns {three-letter code: {year: value}}. Years with no value are left out."""
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

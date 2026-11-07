"""Plain descriptions of a data service's failure, safe to save and show. They never contain an address or a key."""

import time

import httpx


def service_failure(error: Exception) -> str:
    if isinstance(error, httpx.TimeoutException):
        return "The service timed out."
    if isinstance(error, httpx.HTTPStatusError):
        if error.response.status_code == 429:
            return "The service is rate-limited."
        return "The service returned an error."
    if isinstance(error, httpx.HTTPError):
        return "The service could not be reached."
    return "The service returned invalid data."


def get_with_retry(url: str, attempts: int, delay: float, **options) -> httpx.Response:
    """A second try after a temporary failure. These services are free and keyless, so a retry costs nothing."""
    for attempt in range(1, attempts + 1):
        try:
            response = httpx.get(url, **options)
        except (httpx.TimeoutException, httpx.TransportError):
            if attempt == attempts:
                raise
        else:
            if response.status_code != 429 and response.status_code < 500 or attempt == attempts:
                return response
        time.sleep(delay)
    raise httpx.TransportError("No attempts were made.")

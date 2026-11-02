"""Cache for published fact-check lookups: Redis when configured, otherwise this process's memory."""

import hashlib
import json
import logging
import time
from typing import Protocol

import redis

from ..core.config import Settings
from .search import FactChecks

logger = logging.getLogger(__name__)


class Cache(Protocol):
    def get(self, key: str) -> str | None: ...
    def set(self, key: str, value: str, ttl_seconds: int) -> None: ...


class MemoryCache:
    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self.items: dict[str, tuple[float, str]] = {}

    def get(self, key):
        item = self.items.get(key)
        if item is None or item[0] <= self.clock():
            self.items.pop(key, None)
            return None
        return item[1]

    def set(self, key, value, ttl_seconds):
        self.items[key] = (self.clock() + ttl_seconds, value)


class RedisCache:
    """A cache outage must never fail a check, so errors count as a miss."""

    def __init__(self, url: str):
        self.client = redis.Redis.from_url(url, socket_timeout=1, socket_connect_timeout=1, decode_responses=True)

    def get(self, key):
        try:
            return self.client.get(key)
        except redis.RedisError as error:
            logger.warning("Cache read failed: %s", type(error).__name__)
            return None

    def set(self, key, value, ttl_seconds):
        try:
            self.client.set(key, value, ex=ttl_seconds)
        except redis.RedisError as error:
            logger.warning("Cache write failed: %s", type(error).__name__)


def make_cache(settings: Settings) -> Cache:
    return RedisCache(settings.redis_url) if settings.redis_url else MemoryCache()


class CachedFactChecks:
    """Remembers misses too: most claims have no published fact-check."""

    def __init__(self, inner: FactChecks, cache: Cache, ttl_seconds: int):
        self.inner, self.cache, self.ttl_seconds = inner, cache, ttl_seconds

    def lookup(self, claim: str) -> dict | None:
        key = "factcheck:" + hashlib.sha256(" ".join(claim.lower().split()).encode()).hexdigest()
        saved = self.cache.get(key)
        if saved is not None:
            return json.loads(saved)
        match = self.inner.lookup(claim)
        self.cache.set(key, json.dumps(match), self.ttl_seconds)
        return match

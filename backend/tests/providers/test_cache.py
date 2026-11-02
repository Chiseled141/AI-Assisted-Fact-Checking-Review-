import redis

from app.core.config import get_settings
from app.providers.cache import CachedFactChecks, MemoryCache, RedisCache, make_cache


class CountingLookup:
    def __init__(self, match):
        self.match, self.calls = match, 0

    def lookup(self, claim):
        self.calls += 1
        return self.match


def test_lookups_are_cached_including_misses_and_expire():
    now = [0.0]
    cache = MemoryCache(clock=lambda: now[0])
    for match in ({"publisher": "A", "rating": "False", "url": "u"}, None):
        inner = CountingLookup(match)
        cached = CachedFactChecks(inner, cache, ttl_seconds=10)
        claim = f"Claim for {match}"
        assert cached.lookup(claim) == match
        assert cached.lookup(f"  {claim.upper()} ") == match  # Same claim, differently typed.
        assert inner.calls == 1
    now[0] = 11
    assert cached.lookup(claim) is None
    assert inner.calls == 2


def test_a_redis_outage_counts_as_a_miss(monkeypatch):
    def down(*args, **kwargs):
        raise redis.ConnectionError("down")

    cache = RedisCache("redis://localhost:1/0")
    monkeypatch.setattr(cache.client, "get", down)
    monkeypatch.setattr(cache.client, "set", down)
    assert cache.get("k") is None
    cache.set("k", "v", 1)
    inner = CountingLookup(None)
    assert CachedFactChecks(inner, cache, 10).lookup("Claim") is None


def test_redis_is_only_used_when_configured():
    settings = get_settings()
    assert isinstance(make_cache(settings.model_copy(update={"redis_url": ""})), MemoryCache)
    assert isinstance(make_cache(settings.model_copy(update={"redis_url": "redis://x:1/0"})), RedisCache)

from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import pytest

from app.core.config import Settings
from app.db.models import Claim
from app.pipeline.people import names_person, person_query
from app.pipeline.prompts import ExtractedClaim, ExtractedClaims
from app.pipeline.run import _retrieve
from app.search.fetcher import Page
from app.search.tavily import SearchHit
from tests.helpers import run


def test_person_names_match_as_whole_phrases_with_case_accent_and_punctuation_normalized():
    assert names_person("Profile: Álex Example won an award.", "Alex Example")
    assert names_person("Alex-Example won.", "Alex Example")
    assert not names_person("Alex Exampleton won.", "Alex Example")
    assert not names_person("Alex Different won.", "Alex Example")
    assert not names_person("Anyone", None)


def test_a_search_keeps_the_name_but_cannot_add_a_person_the_claim_does_not_name():
    claim = "Alex Example won an award."
    assert person_query("award record", "Alex Example", claim) == '"Alex Example" award record'
    assert person_query("Alex Example award record", "Alex Example", claim) == "Alex Example award record"
    assert person_query("award record", "Someone Else", claim) == "award record"


def test_generic_topic_pages_are_dropped_even_when_their_publisher_is_green():
    asked = []
    good, unrelated = "https://reuters.com/person", "https://bbc.com/topic"
    person_text = "Alex Example received the Aurora award in 2024. " * 15
    generic_text = "Awards are given to artists and recognize work across different disciplines and categories. " * 15

    def search_hits(query, **options):
        asked.append(query)
        return [SearchHit(unrelated), SearchHit(good)]

    def fetch(url):
        return Page(url=url, title="Alex Example" if url == unrelated else "Award", text=person_text if url == good else generic_text)

    claim = Claim(id="c", position=1, text="Alex Example received an award in 2024.")
    with ThreadPoolExecutor(2) as pool:
        pages, selected, failed = _retrieve(
            [claim], None, SimpleNamespace(search=SimpleNamespace(search_hits=search_hits), fetch=fetch),
            Settings(), pool, queries={"c": "award 2024"}, people={"c": "Alex Example"},
        )
    assert selected == {"c": [good]}
    assert set(pages) == {good}
    assert not failed
    assert asked == ['"Alex Example" award 2024']


@pytest.mark.parametrize("blocked", [False, True])
def test_a_person_claim_with_only_generic_sources_skips_judges_instead_of_using_them(client, fakes, blocked):
    text = "Alex Example received the Aurora award in 2024."

    def complete(model, system, user, schema, check=None):
        assert schema is ExtractedClaims, "No judge should be called for unrelated sources."
        return ExtractedClaims(claims=[ExtractedClaim(text=text, person_name="Alex Example", checkworthiness=0.9)]), model

    fakes.llm.complete = complete
    if blocked:
        fakes.fetch.unreadable.add("https://bbc.com/b")
    check = run(client, {"inputType": "text", "text": text})
    claim = check["claims"][0]
    assert check["status"] == "completed"
    if blocked:
        assert claim["status"] == "unavailable" and claim["current"] is None
    else:
        assert claim["current"]["verdict"] == "insufficient_evidence"
    assert client.get(f"/api/claims/{claim['id']}/evidence").json() == []

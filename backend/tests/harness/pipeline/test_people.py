from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import pytest

from config.settings import Settings
from database.models import Check, Claim
from harness.pipeline.people import names_person, person_query
from harness.pipeline.prompts import ClaimReview, ContextNote, ExtractedClaim, ExtractedClaims
from harness.pipeline.run import NO_CLAIM_SOURCE, _person_sources, _retrieve
from harness.providers.llm import LLMError
from harness.search.fetcher import Page
from harness.search.tavily import SearchHit
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
        if schema is ClaimReview:
            return ClaimReview(), model
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


def test_a_person_source_is_context_that_names_the_person_and_can_be_unrated():
    asked = []
    unrated = "https://news.yahoo.com/brandon-barber-212137087.html"
    unrelated = "https://reuters.com/barbers"
    person_text = "Brandon the Barber runs a studio in Los Angeles and talks about his mental health. " * 10

    def search_hits(query, **options):
        asked.append((query, options))
        return [
            SearchHit(unrelated, title="Barber trends", snippet="Barbers in 2024"),
            SearchHit(unrated, title="Who Is Brandon The Barber?", snippet="Brandon the Barber"),
        ]

    def fetch(url):
        return Page(url=url, title="Who Is Brandon The Barber?", text=person_text if url == unrated else "Barbers " * 50)

    providers = SimpleNamespace(search=SimpleNamespace(search_hits=search_hits), fetch=fetch)
    sources = _person_sources(Check(id="chk_people"), "Brandon the Barber", providers, Settings())

    assert [source.url for source in sources] == [unrated]
    assert sources[0].check_id == "chk_people"
    assert asked == [('"Brandon the Barber"', {"discover": True, "newest_first": False, "max_results": 8, "include_images": False})]


@pytest.mark.parametrize("note_fails", [False, True])
def test_a_claim_no_source_supports_keeps_the_person_source_beside_its_explanation(client, fakes, note_fails):
    text = "Alex Example received the Aurora award in 2024."
    person_url = "https://news.example.org/alex-example"

    def search_hits(query, **options):
        if query.startswith('"Alex Example"'):
            return [SearchHit(person_url, title="Who is Alex Example?", snippet="Alex Example, a designer")]
        return []

    def complete(model, system, user, schema, check=None):
        if schema is ClaimReview:
            return ClaimReview(), model
        if schema is ContextNote:
            if note_fails:
                raise LLMError("The note model is down.")
            return ContextNote(en="The sources are about Alex Example's career.", vi="Các nguồn nói về sự nghiệp của Alex Example."), model
        assert schema is ExtractedClaims, "No judge should be called without a source that addresses the claim."
        return ExtractedClaims(claims=[ExtractedClaim(text=text, person_name="Alex Example", checkworthiness=0.9)]), model

    fakes.llm.complete = complete
    fakes.search.results = []
    fakes.search.search_hits = search_hits
    fakes.fetch.text = "Alex Example is a designer who talks about his career and studio in Hanoi. " * 10
    check = run(client, {"inputType": "text", "text": text})
    claim = check["claims"][0]

    assert claim["current"]["verdict"] == "insufficient_evidence"
    if note_fails:
        assert claim["current"]["rationale"] == NO_CLAIM_SOURCE and claim["current"]["translations"] is None
    else:
        assert claim["current"]["rationale"] == "The sources are about Alex Example's career."
        assert claim["current"]["translations"] == {
            "en": "The sources are about Alex Example's career.", "vi": "Các nguồn nói về sự nghiệp của Alex Example.",
        }
    evidence = client.get(f"/api/claims/{claim['id']}/evidence").json()
    assert [item["url"] for item in evidence] == [person_url]
    assert [item["relation"] for item in evidence] == ["contextual"]
    assert claim["current"]["citedEvidenceIds"] == [evidence[0]["id"]]

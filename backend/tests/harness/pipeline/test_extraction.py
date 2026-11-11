from types import SimpleNamespace

from config.settings import Settings
from harness.pipeline.prompts import ExtractedClaim, ExtractedClaims, SeatChartRequest
from harness.pipeline.run import _extract_claims, _search_query


def extract(claims, text, settings=None):
    def complete(model, system, user, schema):
        assert schema is ExtractedClaims
        assert text in user
        return ExtractedClaims(claims=claims), model

    providers = SimpleNamespace(llm=SimpleNamespace(complete=complete))
    return _extract_claims(text, None, providers, settings or Settings())[0]


def test_low_ranked_factual_assertion_still_reaches_verification():
    claim = ExtractedClaim(text="Texas is a Democratic state.", checkworthiness=0.2)
    assert extract([claim], "texas is a democrat state") == [claim]


def test_checkworthiness_ranks_claims_and_still_respects_the_check_limit():
    claims = [
        ExtractedClaim(text=f"Claim number {index}.", checkworthiness=score)
        for index, score in enumerate([0.1, 0.9, 0.3, 0.8, 0.2, 0.7])
    ]
    kept = extract(claims, "Several factual assertions.")
    assert [claim.checkworthiness for claim in kept] == [0.9, 0.8, 0.7, 0.3, 0.2]


def test_empty_extraction_stays_empty_without_inventing_a_claim():
    assert extract([], "Have a nice day, everyone.") == []


def test_election_query_keeps_critical_counts_and_targets_final_results():
    item = ExtractedClaim(
        text='BJP won 240 of 543 seats in the 2024 Lok Sabha election.', checkworthiness=0.9,
        search_query='India BJP Lok Sabha election', seat_chart=SeatChartRequest(body='Lok Sabha', year=2024),
    )
    query = _search_query(item)
    assert all(value in query for value in ('240', '543', '2024', 'BJP', 'Lok Sabha', 'final election results'))
    assert len(query) <= 400

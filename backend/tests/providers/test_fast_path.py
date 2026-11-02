import pytest

from app.providers.search import fast_path_verdict


@pytest.mark.parametrize(
    ("claim", "rating", "reviewed", "expected"),
    [
        ("The metro line opened in Hanoi in 2021", "False", "The metro line opened in Hanoi in 2021", "contradicted"),
        ("The metro line opened in Hanoi in 2021", "True.", "the metro line opened in hanoi in 2021!", "supported"),
        ("The metro line opened in Hanoi in 2021", "Misleading", "The metro line opened in Hanoi in 2021", None),
        ("The metro line opened in Hanoi in 2021", "False", "A different claim about the Hanoi metro budget", None),
        ("The metro line did not open in 2021", "False", "The metro line did open in 2021", None),
        ("The metro line opened in Hanoi in 2021", "False", "", None),
    ],
)
def test_fast_path_only_for_a_plain_rating_on_the_same_claim(claim, rating, reviewed, expected):
    assert fast_path_verdict(claim, {"rating": rating, "claim_reviewed": reviewed}) == expected

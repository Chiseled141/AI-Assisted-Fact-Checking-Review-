"""Earlier checks of the same claim, found by text alone so no model is called."""

from app.pipeline.memory import similarity
from tests.helpers import run


def similar(client, **body):
    reply = client.post("/api/checks/similar", json=body)
    assert reply.status_code == 200, reply.text
    return reply.json()


def test_a_saved_claim_is_found_again_without_calling_a_model(client, fakes):
    check = run(client)
    calls = len(fakes.llm.calls)
    found = similar(client, text="the line opened on 6 November 2021")
    assert len(fakes.llm.calls) == calls
    [match] = found["claims"]
    assert match["checkId"] == check["id"]
    assert match["text"] == "The line opened on 6 November 2021."
    assert match["verdict"] == "supported"
    assert match["checkedAt"].endswith("+00:00")


def test_one_sentence_of_a_longer_input_is_enough(client):
    run(client)
    found = similar(client, text="Something unrelated about trams. The line opened on 6 November 2021!")
    assert [item["text"] for item in found["claims"]] == ["The line opened on 6 November 2021."]


def test_different_figures_are_a_different_claim(client):
    run(client)
    assert similar(client, text="The line opened on 7 November 2021.")["claims"] == []
    assert similar(client, text="Short")["claims"] == []


def test_numbers_are_compared_without_separators_or_accents():
    assert similarity("Bitcoin vượt 100.000 USD năm 2024", "bitcoin vuot 100,000 USD nam 2024") > 0.9
    assert similarity("Bitcoin vượt 100.000 USD", "Bitcoin vượt 90.000 USD") == 0


def test_a_link_checked_before_is_found(client, fakes):
    check = run(client, {"inputType": "url", "url": "https://example.org/story"})
    found = similar(client, url="https://example.org/story/")
    assert found["link"]["checkId"] == check["id"]
    assert found["link"]["claimCount"] == 1
    assert similar(client, url="https://example.org/other")["link"] is None

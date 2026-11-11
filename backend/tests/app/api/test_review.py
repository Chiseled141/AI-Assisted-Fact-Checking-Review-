"""What a check asks the reader before it searches, and how it goes on afterwards."""

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from database.models import Check
from database.session import SessionLocal
from harness.pipeline.prompts import ClaimQuestion, ClaimReview, ExtractedClaims, JudgeAnswer
from harness.pipeline.run import stop_requests
from harness.providers.llm import LLMError
from tests.helpers import run

URL = {"inputType": "url", "url": "https://reuters.com/a"}
TWO_CLAIMS = ["The line opened on 6 November 2021.", "The line has 12 stations."]


def question(claim=1):
    return ClaimQuestion(claim=claim, question="Which line?", options=["Cát Linh", "Nhổn"])


def answer(client, check, body):
    return client.post(f"/api/check/{check['id']}/review", json=body)


def latest(client, check):
    return client.get(f"/api/check/{check['id']}").json()


def judged(fakes):
    return [call for call in fakes.llm.calls if call[1] is JudgeAnswer]


def test_a_link_with_several_claims_waits_before_any_search(client, fakes):
    fakes.llm.claims = TWO_CLAIMS
    check = run(client, URL)
    assert check["status"] == "awaiting_input"
    assert check["claims"] == [] and not judged(fakes)
    assert fakes.fetch.fetched == ["https://reuters.com/a"]  # Only the link itself has been read.
    assert check["review"]["choose"] is True
    assert [item["text"] for item in check["review"]["claims"]] == TWO_CLAIMS
    assert "extracted" not in check["review"]


def test_picking_one_claim_checks_only_that_claim_and_keeps_the_answer(client, fakes):
    fakes.llm.claims = TWO_CLAIMS
    check = run(client, URL)
    assert answer(client, check, {"claim": 2, "answers": []}).status_code == 202
    done = latest(client, check)
    assert done["status"] == "completed"
    assert [(claim["position"], claim["text"]) for claim in done["claims"]] == [(1, TWO_CLAIMS[1])]
    assert done["review"]["answer"] == {"claim": 2, "answers": [], "typedClaim": None}
    assert sum(schema is ExtractedClaims for _, schema in fakes.llm.calls) == 1  # Extraction is not repeated.


def test_picking_all_checks_every_claim(client, fakes):
    fakes.llm.claims = TWO_CLAIMS
    check = run(client, URL)
    answer(client, check, {"claim": None})
    assert [claim["text"] for claim in latest(client, check)["claims"]] == TWO_CLAIMS


def test_picking_a_subset_checks_only_those_claims_in_the_original_order(client, fakes):
    fakes.llm.claims = [*TWO_CLAIMS, "The line is 13 km long."]
    fakes.llm.review_questions = [question(2), question(3)]
    check = run(client, URL)
    assert answer(client, check, {"selectedClaims": [3, 1], "answers": [{"claim": 3, "answer": None}]}).status_code == 202
    done = latest(client, check)
    assert done["status"] == "completed"
    assert [claim["text"] for claim in done["claims"]] == [fakes.llm.claims[0], fakes.llm.claims[2]]
    assert done["review"]["answer"]["selectedClaims"] == [1, 3]
    assert sum(schema is ExtractedClaims for _, schema in fakes.llm.calls) == 1


def test_a_file_or_a_long_paste_also_asks_but_typed_claims_do_not(client, fakes):
    fakes.llm.claims = TWO_CLAIMS
    typed = run(client, {"inputType": "text", "text": "The line opened, and it has 12 stations."})
    assert typed["status"] == "completed"
    assert len(typed["claims"]) == 2
    pasted = run(client, {"inputType": "text", "text": "The line opened. " * 30})
    assert pasted["status"] == "awaiting_input"
    filed = run(client, {"inputType": "text", "files": [{"name": "a.txt", "size": 4, "text": "text"}]})
    assert filed["status"] == "awaiting_input"


def test_a_clear_single_claim_is_never_paused(client):
    assert run(client, URL)["status"] == "completed"


def test_an_unclear_claim_is_rewritten_with_the_readers_answer(client, fakes):
    fakes.llm.review_questions = [question()]
    check = run(client)
    assert check["status"] == "awaiting_input" and check["review"]["choose"] is False
    assert answer(client, check, {"selectedClaims": [1]}).status_code == 422
    assert check["review"]["questions"] == [{"claim": 1, "question": "Which line?", "options": ["Cát Linh", "Nhổn"]}]
    fakes.llm.claims = ["The Cát Linh line opened on 6 November 2021."]
    assert answer(client, check, {"answers": [{"claim": 1, "answer": " Cát Linh "}]}).status_code == 202
    done = latest(client, check)
    assert done["status"] == "completed"
    assert done["claims"][0]["text"] == "The Cát Linh line opened on 6 November 2021."
    _, _, prompt = [item for item in fakes.llm.prompts if item[0] is ExtractedClaims][-1]
    assert "<clarification>" in prompt and "Which line?" in prompt and "Cát Linh" in prompt
    assert next(event for event in done["progress"] if event["task"] == "clarifying")["status"] == "completed"
    assert done["review"]["answer"]["answers"] == [{"claim": 1, "answer": "Cát Linh"}]


def test_checking_as_written_asks_no_model_to_rewrite_it(client, fakes):
    fakes.llm.review_questions = [question()]
    check = run(client)
    answer(client, check, {"answers": [{"claim": 1, "answer": None}]})
    assert latest(client, check)["claims"][0]["text"] == fakes.llm.claims[0]
    assert sum(schema is ExtractedClaims for _, schema in fakes.llm.calls) == 1


def test_a_failed_rewrite_ends_the_check_instead_of_ignoring_the_answer(client, fakes):
    fakes.llm.review_questions = [question()]
    check = run(client)
    fakes.llm.failing.add(get_extraction_model())
    answer(client, check, {"answers": [{"claim": 1, "answer": "Cát Linh"}]})
    done = latest(client, check)
    assert done["status"] == "failed" and done["errorMessage"] == "The claims could not be extracted."
    assert not any(event["status"] == "running" for event in done["progress"])


def get_extraction_model():
    from config.settings import get_settings

    return get_settings().extraction_model


def test_a_failed_review_lets_the_check_go_on_and_stays_visible(client, fakes):
    complete = fakes.llm.complete

    def failing_review(model, system, user, schema, check=None):
        if schema is ClaimReview:
            raise LLMError("detail", "The model timed out.")
        return complete(model, system, user, schema, check)

    fakes.llm.complete = failing_review
    check = run(client)
    assert check["status"] == "completed" and check["review"] is None
    row = next(event for event in check["progress"] if event["task"] == "reviewing")
    assert (row["status"], row["summary"]) == ("failed", "The model timed out.")


def test_the_review_is_capped_at_one_question_for_each_claim(client, fakes):
    fakes.llm.claims = [f"The line has {number} stations." for number in range(1, 6)]
    fakes.llm.review_questions = [question(1), question(1), *(question(number) for number in range(2, 6))]
    check = run(client)
    assert [item["claim"] for item in check["review"]["questions"]] == [1, 2, 3]


def test_a_question_about_a_claim_that_does_not_exist_never_reaches_the_reader(client, fakes):
    complete = fakes.llm.complete

    def no_repair_helps(model, system, user, schema, check=None):
        try:
            return complete(model, system, user, schema, check)
        except ValueError as error:  # What the real client raises once its one repair has failed too.
            raise LLMError(str(error), "The model gave an invalid answer.") from error

    fakes.llm.complete = no_repair_helps
    fakes.llm.review_questions = [question(9)]
    check = run(client)
    assert check["status"] == "completed" and check["review"] is None


def test_only_one_answer_counts_and_bad_answers_are_refused(client, fakes):
    fakes.llm.claims = TWO_CLAIMS
    fakes.llm.review_questions = [question(1)]
    check = run(client, URL)
    assert answer(client, check, {"claim": 3}).status_code == 422
    for body in (
        {"selectedClaims": []}, {"selectedClaims": [1, 1]}, {"selectedClaims": [1, 3]}, {"selectedClaims": [True]},
        {"selectedClaims": [1], "claim": 2}, {"selectedClaims": [1], "typedClaim": "x"},
        {"selectedClaims": [2], "answers": [{"claim": 1, "answer": "x"}]},
    ):
        assert answer(client, check, body).status_code == 422, body
    assert answer(client, check, {"answers": [{"claim": 2, "answer": "x"}]}).status_code == 422
    assert answer(client, check, {"claim": 2, "answers": [{"claim": 1, "answer": "x"}]}).status_code == 422
    assert answer(client, check, {"answers": [{"claim": 1, "answer": "a"}, {"claim": 1, "answer": "b"}]}).status_code == 422
    assert latest(client, check)["status"] == "awaiting_input"
    assert answer(client, check, {"claim": 2}).status_code == 202
    assert answer(client, check, {"claim": 1}).status_code == 422


def test_someone_elses_check_answers_404(client, other_client, fakes):
    fakes.llm.claims = TWO_CLAIMS
    check = run(client, URL)
    assert other_client.post(f"/api/check/{check['id']}/review", json={"claim": 1}).status_code == 404


def test_missing_keys_refuse_the_answer_without_using_it_up(client, fakes):
    fakes.llm.claims = TWO_CLAIMS
    check = run(client, URL)
    start, app.state.start_check = app.state.start_check, None
    try:
        assert answer(client, check, {"claim": 1}).status_code == 503
    finally:
        app.state.start_check = start
    assert latest(client, check)["status"] == "awaiting_input"


def test_a_restart_leaves_a_waiting_check_waiting(client, fakes):
    fakes.llm.claims = TWO_CLAIMS
    check = run(client, URL)
    with TestClient(app):
        pass
    with SessionLocal() as session:
        assert session.get(Check, check["id"]).status == "awaiting_input"
    assert answer(client, check, {"claim": 1}).status_code == 202
    assert latest(client, check)["status"] == "completed"


def test_history_counts_a_waiting_check_as_in_progress(client, fakes):
    fakes.llm.claims = TWO_CLAIMS
    check = run(client, URL)
    assert [item["id"] for item in client.get("/api/checks?status=processing").json()["items"]] == [check["id"]]


def stop(client, check):
    return client.post(f"/api/check/{check['id']}/stop")


def test_stopping_a_waiting_check_ends_it_and_refuses_a_late_answer(client, fakes):
    fakes.llm.claims = TWO_CLAIMS
    check = run(client, URL)
    assert stop(client, check).status_code == 202
    stopped = latest(client, check)
    assert stopped["status"] == "stopped" and stopped["errorMessage"] == "You stopped this check."
    assert answer(client, check, {"claim": 1}).status_code == 422
    assert client.get("/api/checks?status=processing").json()["items"] == []


def test_stopping_mid_run_makes_no_later_calls(client, fakes):
    complete = fakes.llm.complete

    def stop_during_review(model, system, user, schema, check=None):
        if schema is ClaimReview:
            with SessionLocal() as session:
                stop_requests.add(session.scalars(select(Check.id)).one())
        return complete(model, system, user, schema, check)

    fakes.llm.complete = stop_during_review
    check = run(client)
    assert check["status"] == "stopped"
    assert check["claims"] == [] and not judged(fakes) and not fakes.fetch.fetched
    assert not any(event["status"] == "running" for event in check["progress"])
    assert not stop_requests


def test_stopping_a_finished_check_changes_nothing(client):
    check = run(client)
    assert stop(client, check).status_code == 202
    assert latest(client, check)["status"] == "completed"
    assert not stop_requests


def test_only_the_owner_can_stop_a_check(client, other_client, fakes):
    fakes.llm.claims = TWO_CLAIMS
    check = run(client, URL)
    assert other_client.post(f"/api/check/{check['id']}/stop").status_code == 404
    assert latest(client, check)["status"] == "awaiting_input"


def test_a_restart_leaves_a_stopped_check_stopped(client, fakes):
    fakes.llm.claims = TWO_CLAIMS
    check = run(client, URL)
    stop(client, check)
    with TestClient(app):
        pass
    assert latest(client, check)["status"] == "stopped"


def test_a_typed_claim_replaces_the_list_and_is_written_as_one_claim(client, fakes):
    fakes.llm.claims = TWO_CLAIMS
    check = run(client, URL)
    fakes.llm.claims = ["The line cost one billion dollars."]
    assert answer(client, check, {"typedClaim": "  the cost of the line  "}).status_code == 202
    done = latest(client, check)
    assert [claim["text"] for claim in done["claims"]] == ["The line cost one billion dollars."]
    assert done["review"]["answer"]["typedClaim"] == "the cost of the line"
    _, _, prompt = [item for item in fakes.llm.prompts if item[0] is ExtractedClaims][-1]
    assert "the cost of the line" in prompt and TWO_CLAIMS[0] in prompt and "<clarification>" in prompt


def test_a_typed_claim_is_refused_when_blank_or_mixed_with_a_pick(client, fakes):
    fakes.llm.claims = TWO_CLAIMS
    fakes.llm.review_questions = [question(1)]
    check = run(client, URL)
    assert answer(client, check, {"typedClaim": "   "}).status_code == 422
    assert answer(client, check, {"claim": 1, "typedClaim": "x"}).status_code == 422
    assert answer(client, check, {"typedClaim": "x", "answers": [{"claim": 1, "answer": "y"}]}).status_code == 422
    assert latest(client, check)["status"] == "awaiting_input"


def test_a_typed_claim_needs_a_claim_choice_to_answer(client, fakes):
    fakes.llm.review_questions = [question()]
    check = run(client)
    assert answer(client, check, {"typedClaim": "x"}).status_code == 422

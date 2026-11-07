from types import SimpleNamespace

from sqlalchemy.orm import sessionmaker

from app.core.config import Settings
from app.db.models import Check, Claim
from app.db.session import Base, make_engine
from app.pipeline.prompts import ExtractedClaim, ExtractedClaims, JudgeAnswer
from app.pipeline.run import Providers, run_check
from app.providers.llm import TIMED_OUT, LLMError

QUESTION = "hay ngứa buổi sáng có bị sỏi thận không"
CLAIM = "Ngứa vào buổi sáng là dấu hiệu của sỏi thận."


def _check(tmp_path, fakes, text, written=(CLAIM,), fails=False):
    settings = Settings(research_model="third/model", extraction_model="extractor/model")
    complete = fakes.llm.complete
    asked = []

    def answer(model, system, user, schema, check=None):
        if schema is ExtractedClaims and model == "extractor/model":
            return ExtractedClaims(claims=[]), model
        if schema is ExtractedClaims:
            asked.append((model, user))
            if fails:
                raise LLMError("detail", TIMED_OUT)
            return ExtractedClaims(claims=[ExtractedClaim(text=item, checkworthiness=0.7) for item in written]), model
        return complete(model, system, user, schema, check)

    llm = SimpleNamespace(complete=answer)
    engine = make_engine(f"sqlite:///{tmp_path}/question.db")
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    with sessions() as session:
        check = Check(title="Check", input_type="text", input_text=text, judge_ids=settings.default_judge_ids)
        session.add(check)
        session.commit()
        check_id = check.id
    run_check(check_id, sessions, Providers(llm=llm, search=fakes.search, fetch=fakes.fetch), settings)
    with sessions() as session:
        check = session.get(Check, check_id)
        return check.status, check.progress, session.query(Claim).filter_by(check_id=check_id).all(), asked


def test_a_question_becomes_a_claim_written_by_the_third_model_and_is_judged(tmp_path, fakes):
    status, progress, claims, asked = _check(tmp_path, fakes, QUESTION)
    assert status == "completed"
    assert [claim.text for claim in claims] == [CLAIM]
    assert claims[0].rephrased_from == QUESTION
    assert asked[0][0] == "third/model"
    assert QUESTION in asked[0][1]
    row = next(event for event in progress if event["task"] == "rephrasing")
    assert (row["requestedModel"], row["status"], row["claimCount"]) == ("third/model", "completed", 1)
    assert sum(schema is JudgeAnswer for _, schema in fakes.llm.calls) == 2


def test_input_that_asks_nothing_checkable_still_has_no_claims(tmp_path, fakes):
    status, _, claims, asked = _check(tmp_path, fakes, "should I drink more water?", written=())
    assert status == "completed"
    assert claims == []
    assert len(asked) == 1


def test_a_long_input_with_no_claims_spends_no_extra_model_call(tmp_path, fakes):
    status, progress, claims, asked = _check(tmp_path, fakes, "An opinion piece about nothing in particular. " * 20)
    assert status == "completed"
    assert claims == []
    assert asked == []
    assert not any(event["task"] == "rephrasing" for event in progress)


def test_a_failed_rephrase_is_shown_and_the_check_ends_with_no_claims(tmp_path, fakes):
    status, progress, claims, _ = _check(tmp_path, fakes, QUESTION, fails=True)
    assert status == "completed"
    assert claims == []
    row = next(event for event in progress if event["task"] == "rephrasing")
    assert (row["status"], row["summary"]) == ("failed", TIMED_OUT)


def test_a_claim_the_input_really_states_is_not_marked_as_rephrased(client, fakes):
    from tests.helpers import run

    claim = run(client)["claims"][0]
    assert claim["rephrasedFrom"] is None

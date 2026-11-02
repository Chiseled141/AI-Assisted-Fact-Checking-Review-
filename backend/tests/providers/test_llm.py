import json
from types import SimpleNamespace

import pytest

from app.core.config import Settings
from app.pipeline.prompts import JudgeAnswer
from app.providers.llm import LLMError, OpenRouterLLM


def _llm_with_replies(replies):
    llm = OpenRouterLLM(Settings(openrouter_api_key="test"))
    calls = []

    def create(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(
            model="answered/model", choices=[SimpleNamespace(message=SimpleNamespace(content=replies[len(calls) - 1]))]
        )

    llm.client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    return llm, calls


GOOD = json.dumps({"verdict": "insufficient_evidence", "confidence": 0.5, "review": "Unclear."})


def test_llm_records_the_model_that_answered_and_accepts_fenced_json():
    llm, calls = _llm_with_replies([f"```json\n{GOOD}\n```"])
    answer, model = llm.complete("wanted/model", "system", "user", JudgeAnswer)
    assert answer.verdict == "insufficient_evidence"
    assert model == "answered/model"
    assert calls[0]["extra_body"]["models"] == ["wanted/model", Settings().fallback_model]


def test_llm_gets_one_repair_attempt_then_fails():
    llm, calls = _llm_with_replies(["not json", GOOD])
    assert llm.complete("m", "s", "u", JudgeAnswer)[0].review == "Unclear."
    assert len(calls) == 2
    assert "not valid" in calls[1]["messages"][-1]["content"]

    llm, calls = _llm_with_replies(["not json", "still not json", GOOD])
    with pytest.raises(LLMError):
        llm.complete("m", "s", "u", JudgeAnswer)
    assert len(calls) == 2


def test_llm_rejects_answers_that_fail_the_extra_check():
    def check(answer):
        raise ValueError("Unknown evidence ids")

    llm, calls = _llm_with_replies([GOOD, GOOD])
    with pytest.raises(LLMError, match="Unknown evidence ids"):
        llm.complete("m", "s", "u", JudgeAnswer, check)
    assert len(calls) == 2

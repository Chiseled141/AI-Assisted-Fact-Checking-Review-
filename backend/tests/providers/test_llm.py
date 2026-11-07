import json
from types import SimpleNamespace

import httpx
import pytest
from openai import NOT_GIVEN, APITimeoutError, RateLimitError

from app.core.config import Settings
from app.pipeline.prompts import JudgeAnswer
from app.providers.llm import NEVER_CHOSE, RATE_LIMITED, TIMED_OUT, LLMError, OpenRouterLLM


def _llm_with_replies(replies):
    llm = OpenRouterLLM(Settings(openrouter_api_key="test"))
    calls = []

    def create(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(
            model="answered/model", choices=[SimpleNamespace(message=SimpleNamespace(content=replies[len(calls) - 1]))]
        )

    llm.client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    llm.client.with_options = lambda **_: llm.client
    return llm, calls


GOOD = json.dumps({"verdict": "insufficient_evidence", "confidence": 0.5, "review": "Unclear."})


def test_llm_records_the_model_that_answered_and_accepts_fenced_json():
    llm, calls = _llm_with_replies([f"```json\n{GOOD}\n```"])
    answer, model = llm.complete("wanted/model", "system", "user", JudgeAnswer)
    assert answer.verdict == "insufficient_evidence"
    assert model == "answered/model"
    assert calls[0]["model"] == "wanted/model"
    assert "extra_body" not in calls[0]
    assert calls[0]["response_format"] == {"type": "json_object"}


def test_nemotron_omits_unsupported_json_mode_but_still_validates_and_repairs():
    model = Settings().judges["nemotron-ultra"].model
    llm, calls = _llm_with_replies(["not json", GOOD])
    answer, _ = llm.complete(model, "system", "user", JudgeAnswer)
    assert answer.review == "Unclear."
    assert len(calls) == 2
    assert all(call["response_format"] is NOT_GIVEN for call in calls)
    assert "matching this schema" in calls[0]["messages"][0]["content"]
    assert all(call["model"] == model and "extra_body" not in call for call in calls)

    llm, _ = _llm_with_replies(["not json", "still not json"])
    with pytest.raises(LLMError):
        llm.complete(model, "system", "user", JudgeAnswer)


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


def test_rate_limit_is_reported_without_retry_or_model_substitution():
    llm, calls = _llm_with_replies([])
    def fail(**kwargs):
        calls.append(kwargs)
        raise RateLimitError('Provider rate limit', response=httpx.Response(429, request=httpx.Request('POST', 'https://x')), body=None)
    llm.client.chat.completions.create = fail
    with pytest.raises(LLMError, match='temporarily rate-limited'):
        llm.complete('chosen/model', 'system', 'user', JudgeAnswer)
    assert len(calls) == 1
    assert calls[0]['model'] == 'chosen/model'
    assert 'extra_body' not in calls[0]


def test_timeout_is_reported_as_a_timeout_without_retry():
    llm, calls = _llm_with_replies([])
    def fail(**kwargs):
        calls.append(kwargs)
        raise APITimeoutError(request=httpx.Request('POST', 'https://x'))
    llm.client.chat.completions.create = fail
    with pytest.raises(LLMError) as raised:
        llm.complete('chosen/model', 'system', 'user', JudgeAnswer)
    assert raised.value.public_message == TIMED_OUT
    assert 'chosen/model' in str(raised.value)
    assert len(calls) == 1


@pytest.mark.parametrize(('code', 'message'), [(429, RATE_LIMITED), (408, TIMED_OUT)])
def test_an_upstream_error_inside_a_normal_response_keeps_its_cause(code, message):
    llm, calls = _llm_with_replies([])
    def create(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(model='chosen/model', choices=None, error={'code': code, 'message': 'Provider returned error'})
    llm.client.chat.completions.create = create
    with pytest.raises(LLMError) as raised:
        llm.complete('chosen/model', 'system', 'user', JudgeAnswer)
    assert raised.value.public_message == message
    assert len(calls) == 1


def test_a_missing_model_report_stays_empty_rather_than_crediting_the_requested_model():
    llm, _ = _llm_with_replies([GOOD])
    llm.client.chat.completions.create = lambda **kwargs: SimpleNamespace(
        model=None, choices=[SimpleNamespace(message=SimpleNamespace(content=GOOD))]
    )
    assert llm.complete('wanted/model', 'system', 'user', JudgeAnswer)[1] == ''


def test_an_invalid_answer_shows_no_raw_model_text_on_screen():
    llm, _ = _llm_with_replies(['private words', 'more private words'])
    with pytest.raises(LLMError) as raised:
        llm.complete('m', 's', 'u', JudgeAnswer)
    assert 'private' not in raised.value.public_message


def _tool_call(query, call_id="c1"):
    return SimpleNamespace(id=call_id, function=SimpleNamespace(name="search_sources", arguments=json.dumps({"query": query})))


def _llm_replying(messages):
    llm, calls = _llm_with_replies([])

    def create(**kwargs):
        calls.append(kwargs)
        reply = messages[len(calls) - 1]
        return SimpleNamespace(model="answered/model", choices=[SimpleNamespace(message=reply)])

    llm.client.chat.completions.create = create
    return llm, calls


def test_research_searches_until_the_model_answers_and_reports_who_answered():
    from app.pipeline.prompts import ResearchPicks

    answer = SimpleNamespace(content=json.dumps({"urls": ["https://a"]}), tool_calls=None)
    llm, calls = _llm_replying([SimpleNamespace(content=None, tool_calls=[_tool_call("first")]), answer])
    searched = []

    def run_search(query, results_only):
        searched.append(query)
        return "results"

    picks, model = llm.research("chosen/model", "s", "u", ResearchPicks, run_search, 3)
    assert picks.urls == ["https://a"]
    assert model == "answered/model"
    assert searched == ["first"]
    assert all(call["model"] == "chosen/model" for call in calls)
    assert calls[1]["messages"][-1] == {"role": "tool", "tool_call_id": "c1", "content": "results"}


def test_research_cannot_search_past_its_limit():
    from app.pipeline.prompts import ResearchPicks

    many = SimpleNamespace(content=None, tool_calls=[_tool_call("a", "1"), _tool_call("b", "2"), _tool_call("c", "3")])
    answer = SimpleNamespace(content=json.dumps({"urls": []}), tool_calls=None)
    llm, calls = _llm_replying([many, answer])
    searched = []

    def run_search(query, results_only):
        searched.append(query)
        return "results"

    llm.research("m", "s", "u", ResearchPicks, run_search, 2)
    assert searched == ["a", "b"]
    assert "limit" in calls[1]["messages"][-1]["content"]


def test_research_that_never_answers_stops_and_fails():
    from app.pipeline.prompts import ResearchPicks

    llm, calls = _llm_replying([SimpleNamespace(content=None, tool_calls=[_tool_call("a")])] * 10)
    with pytest.raises(LLMError) as raised:
        llm.research("m", "s", "u", ResearchPicks, lambda query, results_only: "results", 2)
    assert raised.value.public_message == NEVER_CHOSE
    assert len(calls) == 4


def test_a_model_out_of_searches_is_made_to_answer():
    from app.pipeline.prompts import ResearchPicks

    answer = SimpleNamespace(content=json.dumps({"urls": ["https://a"]}), tool_calls=None)
    search = SimpleNamespace(content=None, tool_calls=[_tool_call("a")])
    llm, calls = _llm_replying([search, search, search, answer])
    picks, _ = llm.research("m", "s", "u", ResearchPicks, lambda query, results_only: "results", 3)
    assert picks.urls == ["https://a"]
    assert [call["tool_choice"] for call in calls] == ["auto", "auto", "auto", "none"]


def test_research_timeouts_name_the_cause():
    from app.pipeline.prompts import ResearchPicks

    llm, _ = _llm_with_replies([])

    def fail(**kwargs):
        raise APITimeoutError(request=httpx.Request("POST", "https://x"))

    llm.client.chat.completions.create = fail
    with pytest.raises(LLMError) as raised:
        llm.research("m", "s", "u", ResearchPicks, lambda query, results_only: "results", 2)
    assert raised.value.public_message == TIMED_OUT

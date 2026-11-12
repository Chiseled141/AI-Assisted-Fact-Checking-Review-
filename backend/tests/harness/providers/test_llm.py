import json
from types import SimpleNamespace

import httpx
import pytest
from openai import NOT_GIVEN, APITimeoutError, RateLimitError

from config.settings import JudgeOption, Settings
from harness.pipeline.prompts import JudgeAnswer
from harness.providers.llm import NEVER_CHOSE, RATE_LIMITED, TIMED_OUT, LLMError, OpenRouterLLM


def _llm_with_replies(replies, settings=None):
    llm = OpenRouterLLM(settings or Settings(openrouter_api_key="test"))
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


def test_custom_endpoint_uses_chat_completions_without_openrouter_metadata_or_redirects():
    from harness.pipeline.prompts import FollowUpAnswer

    calls = []

    def handle(request):
        calls.append(request)
        return httpx.Response(200, json={
            "id": "reply", "object": "chat.completion", "created": 0, "model": "custom-model",
            "choices": [{"index": 0, "finish_reason": "stop", "message": {
                "role": "assistant", "content": '{"answer":"Saved evidence explains it."}',
            }}],
        })

    llm = OpenRouterLLM(Settings(), base_url="https://provider.example/v1", api_key="private-key")
    assert llm.client._client.follow_redirects is False
    llm.client.close()
    from openai import OpenAI

    llm.client = OpenAI(
        api_key="private-key", base_url="https://provider.example/v1", max_retries=0,
        http_client=httpx.Client(transport=httpx.MockTransport(handle)),
    )
    try:
        answer, model, sources = llm.followup("custom-model", "system", "question", FollowUpAnswer, lambda *args: "sources")
        assert answer.answer == "Saved evidence explains it."
        assert model == "custom-model" and sources == []
        assert len(calls) == 1
        assert str(calls[0].url) == "https://provider.example/v1/chat/completions"
        assert calls[0].headers["authorization"] == "Bearer private-key"
        body = json.loads(calls[0].content)
        assert body["tools"][0]["function"]["name"] == "search_sources"
        assert "provider" not in body and "plugins" not in body
    finally:
        llm.client.close()


def test_llm_records_the_model_that_answered_and_accepts_fenced_json():
    llm, calls = _llm_with_replies([f"```json\n{GOOD}\n```"])
    answer, model = llm.complete("wanted/model", "system", "user", JudgeAnswer)
    assert answer.verdict == "insufficient_evidence"
    assert model == "answered/model"
    assert calls[0]["model"] == "wanted/model"
    assert "extra_body" not in calls[0]
    assert calls[0]["response_format"] == {"type": "json_object"}


def test_a_model_without_json_mode_still_gets_validated_and_repaired():
    model = "lab/no-json-model"
    settings = Settings(
        openrouter_api_key="test",
        judges={"no-json": JudgeOption(name="No JSON", model=model, supports_json_mode=False)},
    )
    llm, calls = _llm_with_replies(["not json", GOOD], settings)
    answer, _ = llm.complete(model, "system", "user", JudgeAnswer)
    assert answer.review == "Unclear."
    assert len(calls) == 2
    assert all(call["response_format"] is NOT_GIVEN for call in calls)
    assert "matching this schema" in calls[0]["messages"][0]["content"]
    assert all(call["model"] == model and "extra_body" not in call for call in calls)

    llm, _ = _llm_with_replies(["not json", "still not json"], settings)
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
    from harness.pipeline.prompts import ResearchPicks

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
    from harness.pipeline.prompts import ResearchPicks

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
    from harness.pipeline.prompts import ResearchPicks

    llm, calls = _llm_replying([SimpleNamespace(content=None, tool_calls=[_tool_call("a")])] * 10)
    with pytest.raises(LLMError) as raised:
        llm.research("m", "s", "u", ResearchPicks, lambda query, results_only: "results", 2)
    assert raised.value.public_message == NEVER_CHOSE
    assert len(calls) == 6


def test_a_small_search_limit_still_leaves_room_for_the_answer_and_its_repair():
    from harness.pipeline.prompts import ResearchPicks

    search = SimpleNamespace(content=None, tool_calls=[_tool_call("a")])
    invalid = SimpleNamespace(content="not json", tool_calls=None)
    answer = SimpleNamespace(content=json.dumps({"urls": ["https://a"]}), tool_calls=None)
    # One search, one more the limit refuses, a broken answer, then the repaired one.
    llm, calls = _llm_replying([search, search, invalid, answer])
    searched = []

    def run_search(query, results_only):
        searched.append(query)
        return "results"

    picks, _ = llm.research("m", "s", "u", ResearchPicks, run_search, 1)
    assert picks.urls == ["https://a"]
    assert searched == ["a"]
    assert len(calls) == 4


def test_a_model_out_of_searches_is_made_to_answer():
    from harness.pipeline.prompts import ResearchPicks

    answer = SimpleNamespace(content=json.dumps({"urls": ["https://a"]}), tool_calls=None)
    search = SimpleNamespace(content=None, tool_calls=[_tool_call("a")])
    llm, calls = _llm_replying([search, search, search, answer])
    picks, _ = llm.research("m", "s", "u", ResearchPicks, lambda query, results_only: "results", 3)
    assert picks.urls == ["https://a"]
    assert [call["tool_choice"] for call in calls] == ["auto", "auto", "auto", "none"]


def test_research_timeouts_name_the_cause():
    from harness.pipeline.prompts import ResearchPicks

    llm, _ = _llm_with_replies([])

    def fail(**kwargs):
        raise APITimeoutError(request=httpx.Request("POST", "https://x"))

    llm.client.chat.completions.create = fail
    with pytest.raises(LLMError) as raised:
        llm.research("m", "s", "u", ResearchPicks, lambda query, results_only: "results", 2)
    assert raised.value.public_message == TIMED_OUT


def _endpoints(monkeypatch, rows):
    monkeypatch.setattr('harness.providers.llm.httpx.get', lambda *args, **kwargs: httpx.Response(
        200, json={'data': {'endpoints': rows}}, request=httpx.Request('GET', 'https://openrouter.ai/models/m/endpoints'),
    ))


def test_followup_native_routes_only_to_capable_endpoints_and_keeps_selected_model(monkeypatch):
    from harness.pipeline.prompts import FollowUpAnswer

    _endpoints(monkeypatch, [
        {'tag': 'anthropic', 'native_tools': {'openrouter:web_search': {'type': 'web_search_20260209'}}},
        {'tag': 'other-provider', 'native_tools': {}},
    ])
    llm, calls = _llm_with_replies([json.dumps({'answer': 'The answer.'})])
    searches = []
    answer, _, sources = llm.followup('chosen/model', 'system', 'question', FollowUpAnswer, searches.append)
    assert answer.answer == 'The answer.' and sources == [] and searches == []
    assert calls[0]['model'] == 'chosen/model'
    body = calls[0]['extra_body']
    assert body['tools'] == [{'type': 'openrouter:web_search', 'parameters': {'engine': 'native', 'max_uses': 1}}]
    assert body['provider'] == {'only': ['anthropic'], 'allow_fallbacks': False, 'require_parameters': True}
    assert body['max_tool_calls'] == 1


def test_followup_without_native_search_gives_the_same_model_optional_tavily_tool(monkeypatch):
    from harness.pipeline.prompts import FollowUpAnswer

    _endpoints(monkeypatch, [{'tag': 'lab', 'native_tools': {}}])
    llm, calls = _llm_with_replies([json.dumps({'answer': 'Known without searching.'})])
    searches = []
    answer, _, _ = llm.followup('chosen/model', 'system', 'question', FollowUpAnswer, searches.append)
    assert answer.answer == 'Known without searching.'
    assert searches == []  # A tool is offered; there is no compulsory search.
    assert calls[0]['model'] == 'chosen/model'
    assert calls[0]['tool_choice'] == 'auto'
    assert calls[0]['tools'][0]['function']['name'] == 'search_sources'


def test_followup_selected_model_decides_tavily_query_and_reads_results(monkeypatch):
    from harness.pipeline.prompts import FollowUpAnswer

    _endpoints(monkeypatch, [])
    llm, _ = _llm_with_replies([])
    queries, calls = [], []

    def create(**kwargs):
        calls.append(kwargs)
        if len(calls) == 1:
            message = SimpleNamespace(content=None, tool_calls=[SimpleNamespace(
                id='search-1', function=SimpleNamespace(name='search_sources', arguments='{"query":"party founding date"}'),
            )])
        else:
            assert 'Founded in 1867' in kwargs['messages'][-1]['content']
            message = SimpleNamespace(content='{"answer":"Founded in 1867.","source_urls":["https://example.org/history"]}')
        return SimpleNamespace(model=kwargs['model'], choices=[SimpleNamespace(message=message)])

    llm.client.chat.completions.create = create

    def search(query, *args, **kwargs):
        queries.append(query)
        return 'Founded in 1867: https://example.org/history'

    answer, reported, _ = llm.followup('chosen/model', 'system', 'question', FollowUpAnswer, search)
    assert queries == ['party founding date']
    assert answer.source_urls == ['https://example.org/history']
    assert reported == 'chosen/model' and all(c['model'] == 'chosen/model' for c in calls)


def test_native_search_citations_come_from_annotations_not_invented_urls(monkeypatch):
    from harness.pipeline.prompts import FollowUpAnswer

    _endpoints(monkeypatch, [{'tag': 'provider', 'native_tools': {'openrouter:web_search': {"type": "web"}}}])
    llm, _ = _llm_with_replies([])
    llm.client.chat.completions.create = lambda **kwargs: SimpleNamespace(
        model='chosen/model', choices=[SimpleNamespace(message=SimpleNamespace(
            content='{"answer":"Answer.","source_urls":["https://invented.example"]}',
            annotations=[
                {'type': 'url_citation', 'url_citation': {'url': 'https://real.example/history', 'title': 'Party history'}},
                {'type': 'url_citation', 'url_citation': {'url': 'https://real.example/history', 'title': 'Duplicate'}},
                {'type': 'url_citation', 'url_citation': {'url': 'javascript:alert(1)', 'title': 'Unsafe'}},
            ],
        ))],
    )
    _, _, sources = llm.followup('chosen/model', 'system', 'question', FollowUpAnswer, lambda *_: pytest.fail('No Tavily'))
    assert sources == [{'url': 'https://real.example/history', 'title': 'Party history'}]


def test_native_capability_lookup_failure_does_not_guess_or_make_a_paid_call(monkeypatch):
    from harness.pipeline.prompts import FollowUpAnswer

    def fail(*args, **kwargs):
        raise httpx.ConnectError('offline')

    monkeypatch.setattr('harness.providers.llm.httpx.get', fail)
    llm, calls = _llm_with_replies([])
    with pytest.raises(LLMError, match='Could not verify'):
        llm.followup('chosen/model', 'system', 'question', FollowUpAnswer, lambda *_: pytest.fail('No search'))
    assert calls == []


def test_quick_followup_cannot_fan_out_into_multiple_searches(monkeypatch):
    from harness.pipeline.prompts import FollowUpAnswer

    _endpoints(monkeypatch, [])
    many = SimpleNamespace(content=None, tool_calls=[_tool_call('needed', '1'), _tool_call('unnecessary', '2')])
    answer = SimpleNamespace(content='{"answer":"A short answer."}', tool_calls=None)
    llm, calls = _llm_replying([many, answer])
    searches = []
    llm.followup('chosen/model', 'system', 'question', FollowUpAnswer,
                 lambda query, results_only: searches.append(query) or 'results')
    assert searches == ['needed']
    assert calls[-1]['tool_choice'] == 'none'

"""Follow-up questions about a finished check, answered by a fake model from the saved sources."""

from app.core.config import get_settings
from app.pipeline.prompts import FollowUpAnswer
from tests.helpers import run


def ask(client, check_id, question):
    return client.post(f"/api/check/{check_id}/messages", json={"question": question})


def test_a_question_is_answered_from_the_saved_check_and_kept(client, fakes):
    check = run(client)
    reply = ask(client, check["id"], "  Which source is the most direct?  ")
    assert reply.status_code == 201, reply.text
    message = reply.json()
    assert message["question"] == "Which source is the most direct?"
    assert message["answer"].endswith("from the saved sources.")
    assert message["modelName"] == "Claude Haiku 5.5"

    schema, system, user = fakes.llm.prompts[-1]
    assert schema is FollowUpAnswer
    assert "# Task: answer a question about a finished check" in system
    # The model gets the claim, its verdict, the judges' reviews and the saved passage, then the question.
    assert "Claim 1: The line opened on 6 November 2021." in user
    assert "Verdict: supported" in user
    assert "<passage" in user and "opened to passengers" in user
    assert user.rstrip().endswith("Which source is the most direct?\n</question>")

    saved = client.get(f"/api/check/{check['id']}").json()
    assert [item["question"] for item in saved["messages"]] == ["Which source is the most direct?"]


def test_earlier_answers_are_sent_with_the_next_question(client, fakes):
    check = run(client)
    ask(client, check["id"], "First question?")
    ask(client, check["id"], "And the second?")
    _, _, user = fakes.llm.prompts[-1]
    assert "<earlier>" in user and "First question?" in user


def test_reply_points_to_the_selected_exchange_in_this_check(client, fakes):
    check_id = run(client)["id"]
    earlier = ask(client, check_id, "First question?").json()
    ask(client, check_id, "A later question?")
    path = f"/api/check/{check_id}/messages"

    assert client.post(path, json={"question": "Why?", "replyToId": "msg_missing"}).status_code == 422
    response = client.post(path, json={"question": "Why?", "replyToId": earlier["id"], "modelId": "gpt-luna"})
    assert response.status_code == 201
    reference = response.json()["reference"]
    assert reference["kind"] == "answer"
    assert reference["title"] == earlier["answer"]
    assert reference["modelName"] == earlier["modelName"]
    _, _, prompt = fakes.llm.prompts[-1]
    assert f"<reply_to>\nQuestion: First question?\nAnswer: {earlier['answer']}\n</reply_to>" in prompt
    assert prompt.count("First question?") == 1
    assert fakes.llm.calls[-1][0] == "openai/gpt-6-luna"


def test_legacy_reply_shows_the_original_answer_instead_of_the_question(client):
    from app.db.models import CheckMessage
    from app.db.session import SessionLocal

    check_id = run(client)["id"]
    earlier = ask(client, check_id, "How about this?").json()
    later = ask(client, check_id, "Review that answer.").json()
    with SessionLocal() as session:
        session.get(CheckMessage, later["id"]).reference = {"kind": "message", "title": earlier["question"]}
        session.commit()

    saved = client.get(f"/api/check/{check_id}").json()["messages"][-1]
    assert saved["reference"]["kind"] == "answer"
    assert saved["reference"]["title"] == earlier["answer"]
    assert saved["reference"]["modelName"] == earlier["modelName"]


def test_followups_target_a_saved_source_chart_or_judge(client, fakes):
    from app.db.models import Claim
    from app.db.session import SessionLocal

    check = run(client)
    claim = check["claims"][0]
    with SessionLocal() as session:
        session.get(Claim, claim["id"]).price_chart = {"asset": "bitcoin", "prices": [[1, 100]]}
        session.commit()

    path = f"/api/check/{check['id']}/messages"
    evidence = client.get(f"/api/claims/{claim['id']}/evidence").json()[0]
    references = []
    for kind, key, title, url, expected in (
        ("source", evidence["id"], evidence["sourceTitle"], evidence["url"], '"passage": "opened to passengers"'),
        ("judge", "GPT Luna", "GPT Luna", None, '"judge": "GPT Luna"'),
        ("chart", "priceChart", "Bitcoin price", None, '"prices": [[1, 100]]'),
    ):
        target = {"claimId": claim["id"], "kind": kind, "key": key}
        if kind == "chart":
            target["label"] = title
        response = client.post(path, json={"question": "What does this show?", "target": target})
        assert response.status_code == 201
        reference = {"kind": kind, "title": title, "url": url, "modelName": None}
        assert response.json()["reference"] == reference
        references.append(reference)
        prompt = fakes.llm.prompts[-1][2]
        selected = prompt.split(f'<selected_result kind="{kind}"', 1)[1].split("</selected_result>", 1)[0]
        assert expected in selected

    saved = client.get(f"/api/check/{check['id']}").json()["messages"]
    assert [message["reference"] for message in saved] == references

    assert client.post(path, json={
        "question": "Why?", "target": {"claimId": claim["id"], "kind": "source", "key": "evd_missing"},
    }).status_code == 422


def test_questions_wait_for_the_check_and_stay_within_limits(client, fakes, monkeypatch):
    check = run(client)
    assert ask(client, check["id"], "   ").status_code == 422
    assert ask(client, check["id"], "x" * 1001).status_code == 422
    assert ask(client, "chk_missing", "Why?").status_code == 404

    monkeypatch.setattr(get_settings(), "max_followups_per_check", 1)
    assert ask(client, check["id"], "Why?").status_code == 201
    limited = ask(client, check["id"], "And again?")
    assert limited.status_code == 429
    assert "limit" in limited.json()["detail"]


def test_clearing_chat_removes_saved_context_without_resetting_the_limit(client, fakes, monkeypatch):
    check = run(client)
    check_id = check["id"]
    path = f"/api/check/{check_id}"
    monkeypatch.setattr(get_settings(), "max_followups_per_check", 2)
    assert ask(client, check_id, "Earlier question?").status_code == 201

    assert client.delete(f"{path}/messages").status_code == 204
    assert client.delete(f"{path}/messages").status_code == 204
    saved = client.get(path).json()
    assert saved["messages"] == []
    assert saved["claims"] == check["claims"]

    assert ask(client, check_id, "New question?").status_code == 201
    assert "<earlier>" not in fakes.llm.prompts[-1][2]
    assert ask(client, check_id, "Over the limit?").status_code == 429


def test_a_model_failure_is_reported_without_saving_a_message(client, fakes):
    check = run(client)
    fakes.llm.failing.add(get_settings().followup_model)
    assert ask(client, check["id"], "Why?").status_code == 503
    assert client.get(f"/api/check/{check['id']}").json()["messages"] == []


def test_questions_need_the_api_keys(client):
    check = run(client)
    client.app.state.llm = None
    assert ask(client, check["id"], "Why?").status_code == 503


def test_attached_files_go_to_the_model_as_data_and_stay_with_the_question(client, fakes):
    check = run(client)
    note = {"name": "notes.txt", "size": 22, "text": "The line opened in 2020."}
    reply = ask_with_files(client, check["id"], "Does my note match the sources?", [note])
    assert reply.status_code == 201, reply.text
    assert reply.json()["files"] == [note]

    _, _, user = fakes.llm.prompts[-1]
    assert '<attachment name="notes.txt">' in user and "The line opened in 2020." in user
    assert user.index("<attachment") < user.index("<question>")

    ask(client, check["id"], "And the date?")
    _, _, user = fakes.llm.prompts[-1]
    assert "Attached: notes.txt" in user
    assert "<attachment" not in user  # A file goes with its own question only.

    saved = client.get(f"/api/check/{check['id']}").json()
    assert saved["messages"][0]["files"] == [note]
    assert saved["messages"][1]["files"] == []


def test_attachments_stay_within_the_file_limits(client):
    check = run(client)
    files = [{"name": f"{i}.txt", "size": 1, "text": "x"} for i in range(4)]
    assert ask_with_files(client, check["id"], "Why?", files).status_code == 422


def ask_with_files(client, check_id, question, files):
    return client.post(f"/api/check/{check_id}/messages", json={"question": question, "files": files})


def test_the_reader_can_pick_which_model_answers(client, fakes):
    check = run(client)
    reply = client.post(f"/api/check/{check['id']}/messages", json={"question": "Why?", "modelId": "gpt-luna"})
    assert reply.status_code == 201, reply.text
    assert reply.json()["modelName"] == "GPT Luna"
    assert fakes.llm.calls[-1][0] == "openai/gpt-6-luna"

    unknown = client.post(f"/api/check/{check['id']}/messages", json={"question": "Why?", "modelId": "made-up"})
    assert unknown.status_code == 422


def test_followup_new_sources_are_saved_separately_without_changing_verdict(client, fakes):
    check = run(client)
    before = check['claims'][0]['current']
    sources = [{'url': 'https://www.britannica.com/topic/Liberal-Party-political-party-Canada', 'title': 'Party history'}]

    def followup(model, system, user, schema, run_search):
        assert model == 'openai/gpt-6-luna'
        assert 'Do not search just because a tool is available' in system
        return schema(answer='The oldest party is…'), model, sources

    fakes.llm.followup = followup
    response = client.post(f"/api/check/{check['id']}/messages", json={
        'question': 'Which party is oldest?', 'modelId': 'gpt-luna',
    })
    assert response.status_code == 201, response.text
    assert response.json()['sources'] == sources
    saved = client.get(f"/api/check/{check['id']}").json()
    assert saved['messages'][0]['sources'] == sources
    assert saved['claims'][0]['current'] == before

    original = fakes.llm.complete

    def next_followup(model, system, user, schema, run_search):
        assert 'Additional sources:' in user and sources[0]['url'] in user
        result, reported = original(model, system, user, schema)
        return result, reported, []

    fakes.llm.followup = next_followup
    assert ask(client, check['id'], 'Which source said that?').status_code == 201


def test_tavily_citations_are_limited_to_pages_the_selected_model_actually_read(client, fakes):
    import json

    check = run(client)
    before_fetch = len(fakes.fetch.fetched)

    def followup(model, system, user, schema, run_search):
        results = json.loads(run_search('oldest party founding date'))
        assert results[0]['url'] == 'https://reuters.com/a'
        assert 'opened to passengers' in results[0]['text']
        return schema(answer='An answer.', source_urls=[results[0]['url'], 'https://made-up.example']), model, []

    fakes.llm.followup = followup
    response = ask(client, check['id'], 'Which is oldest?')
    assert response.status_code == 201
    assert response.json()['sources'] == [{'url': 'https://reuters.com/a', 'title': 'Title of https://reuters.com/a'}]
    assert len(fakes.fetch.fetched) > before_fetch


def test_quick_followup_reuses_tavily_text_without_refetching_all_results(client, fakes):
    import json

    from app.search.tavily import SearchHit

    check = run(client)
    initial_fetches = list(fakes.fetch.fetched)
    calls = []

    def search_hits(query, **options):
        calls.append((query, options))
        return [SearchHit(f'https://reuters.com/{i}', title=f'Page {i}', raw_content='Full page text. ' * 500)
                for i in range(6)]

    def followup(model, system, user, schema, run_search):
        results = json.loads(run_search('one necessary fact'))
        assert len(results) == 2
        assert all(len(row['text']) <= 3000 for row in results)
        return schema(answer='A short answer.', source_urls=[results[0]['url']]), model, []

    fakes.search.search_hits = search_hits
    fakes.llm.followup = followup
    response = ask(client, check['id'], 'One quick question?')
    assert response.status_code == 201, response.text
    assert calls == [('one necessary fact', {'newest_first': False, 'max_results': 2, 'include_images': False})]
    assert fakes.fetch.fetched == initial_fetches
    assert len(response.json()['sources']) == 1

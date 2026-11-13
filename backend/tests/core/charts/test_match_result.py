from claimtrace.core.pipeline.prompts import JudgeAnswer, ReportedMatchResult
from tests.helpers import run

FOOTBALL = "Full time: Paris Saint-Germain 5–0 Inter. Champions League Final. 31 May 2025."
ESPORTS = "Spirit 3 17:00 3 August 2025 IEM Cologne 2025 Match over MOUZ 0."
MIRAGE = "Mirage: Spirit 13 STATS MOUZ 8."


def _setup(fakes, kind, text, teams, scores, quote, **details):
    fakes.llm.claims = [text]
    fakes.llm.match_result = kind
    fakes.llm.reported_match = ReportedMatchResult.model_validate({
        "match": {"evidence_id": "E1", "teams": teams, "scores": scores, "quote": quote, **details},
    })


def test_a_saved_sports_card_shows_the_reported_score_instead_of_the_claimed_score(client, fakes):
    moment = "12' Achraf Hakimi scores."
    fakes.fetch.text = f"{FOOTBALL} {moment} " * 6
    _setup(
        fakes, "sport", "PSG beat Inter 4–0 in the 2025 Champions League final.",
        ["Paris Saint-Germain", "Inter"], [5, 0], FOOTBALL,
        competition="Champions League", stage="Final", date_label="31 May 2025",
        moments=[
            {"minute": "12", "label": "Achraf Hakimi scores.", "quote": moment},
            {"minute": "21", "label": "Achraf Hakimi scores.", "quote": moment},
        ],
    )

    check = run(client)
    card = client.get(f"/api/check/{check['id']}").json()["claims"][0]["matchResult"]
    assert card["kind"] == "sport"
    assert card["scores"] == [5, 0]
    assert card["dateLabel"] == "31 May 2025"
    assert card["moments"] == [{"minute": "12", "label": "Achraf Hakimi scores."}]
    assert card["url"] in fakes.search.results
    assert any(task["task"] == "reading_match" for task in check["progress"])
    judge_prompts = [prompt for schema, _, prompt in fakes.llm.prompts if schema is JudgeAnswer]
    assert len(judge_prompts) == 2
    assert all('<match_result evidence_id="E1">' in prompt and "Paris Saint-Germain 5 – Inter 0" in prompt
               and "31 May 2025" in prompt for prompt in judge_prompts)


def test_esports_maps_must_agree_with_the_series(client, fakes):
    fakes.fetch.text = f"{ESPORTS} {MIRAGE} Ancient: Spirit 8 STATS MOUZ 13. " * 6
    _setup(fakes, "esport", "Spirit beat MOUZ at IEM Cologne 2025.", ["Spirit", "MOUZ"], [3, 0], ESPORTS, maps=[
        {"name": "Mirage", "scores": [13, 8], "quote": MIRAGE},
        {"name": "Ancient", "scores": [8, 13], "quote": "Ancient: Spirit 8 STATS MOUZ 13."},
    ])
    card = run(client)["claims"][0]["matchResult"]
    assert card["scores"] == [3, 0]
    assert not card.get("maps")


def test_esports_card_keeps_map_scores_in_team_order(client, fakes):
    fakes.fetch.text = f"{ESPORTS} {MIRAGE} " * 6
    _setup(fakes, "esport", "Spirit beat MOUZ at IEM Cologne 2025.", ["Spirit", "MOUZ"], [3, 0], ESPORTS, maps=[
        {"name": "Mirage", "scores": [13, 8], "quote": MIRAGE},
        {"name": "Ancient", "scores": [13, 8], "quote": MIRAGE},
    ])
    card = run(client)["claims"][0]["matchResult"]
    assert card["maps"] == [{"name": "Mirage", "scores": [13, 8]}]


def test_a_shootout_is_separate_from_the_final_match_score(client, fakes):
    final = "Full time: Argentina 3–3 France."
    shootout = "Argentina 4–2 France on penalties."
    fakes.fetch.text = f"{final} {shootout} " * 8
    _setup(
        fakes, "sport", "Argentina beat France in the 2022 World Cup final.",
        ["Argentina", "France"], [3, 3], final,
        shootout={"scores": [4, 2], "quote": shootout},
    )
    card = run(client)["claims"][0]["matchResult"]
    assert card["scores"] == [3, 3]
    assert card["shootout"] == [4, 2]


def test_a_predicted_or_invented_score_leaves_the_verdict_without_a_card(client, fakes):
    preview = "The prediction is that Paris Saint-Germain will beat Inter 5–0."
    fakes.fetch.text = f"{preview} " * 8
    _setup(
        fakes, "sport", "PSG beat Inter in the 2025 Champions League final.",
        ["Paris Saint-Germain", "Inter"], [5, 0], preview,
    )
    check = run(client)
    assert check["claims"][0]["matchResult"] is None
    assert check["claims"][0]["current"]

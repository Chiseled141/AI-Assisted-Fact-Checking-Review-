from app.pipeline.passages import split_passages, top_passages


def test_passages_keep_all_words_and_pick_the_relevant_part():
    relevant = "The metro line opened on 6 November. "
    text = "\n".join(["Weather was mild across the region today. " * 12] * 3 + [relevant * 3] + ["Sports results came in late. " * 15] * 3)
    assert sum(len(part.split()) for part in split_passages(text)) == len(text.split())
    assert "6 November" in top_passages(text, "When did the metro line open?", 1)
    assert top_passages("Short text.", "claim", 3) == "Short text."

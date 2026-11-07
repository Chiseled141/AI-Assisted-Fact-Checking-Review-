from app.pipeline.passages import quote_in_text, saved_excerpt, split_passages, top_passages
from app.search.fetcher import clean_page_text


def test_passages_keep_all_words_and_pick_the_relevant_part():
    relevant = "The metro line opened on 6 November. "
    text = "\n".join(
        ["Weather was mild across the region today. " * 12] * 3 + [relevant * 3] + ["Sports results came in late. " * 15] * 3
    )
    assert sum(len(part.split()) for part in split_passages(text)) == len(text.split())
    assert "6 November" in top_passages(text, "When did the metro line open?", 1)
    assert top_passages("Short text.", "claim", 3) == "Short text."


def test_a_quote_copied_from_a_passage_still_matches_across_the_pages_line_breaks():
    page = "TEMPERATURE (F)\n YESTERDAY\n  MAXIMUM         93R   249 PM"
    assert quote_in_text("YESTERDAY MAXIMUM 93R 249 PM", page)
    assert quote_in_text("YESTERDAY MAXIMUM 93R 249 PM", top_passages(page, "maximum", 1))
    assert not quote_in_text("YESTERDAY MAXIMUM 99 249 PM", page)


def test_images_captions_and_link_targets_never_become_evidence_passages():
    image = "[![Image 84: FILE- Supporters of a party at a rally (AP Photo/Example, File)](https://images.example/photo.jpg)](https://news.example/story)"
    text = image + '\n\nThe [party](https://news.example/party) won 240 seats in the final result.\n\n[More stories](https://news.example/)'
    prose = top_passages(text, 'party seats', 1)
    assert prose == 'The party won 240 seats in the final result.'
    assert 'https://' not in prose and 'Image 84' not in prose
    assert saved_excerpt(image[:280], text, 'party seats') == prose
    assert quote_in_text(prose, text)
    assert not quote_in_text(image, text)


def test_cleanup_preserves_table_figures_and_removes_formatting_only():
    text = '## Results\n| Party | Seats |\n|---|---|\n| BJP | **240** |\n\nTemperature: -5.2°C &amp; rain: 0 mm.'
    clean = clean_page_text(text)
    assert '| BJP | 240 |' in clean
    assert '-5.2°C & rain: 0 mm.' in clean
    assert '---' not in clean


def test_fred_embed_controls_are_not_rendered_as_an_evidence_quote():
    controls = 'Select automatic updates to the data or a static time frame. All data are subject to revision. [Make it responsive](#) [See FRED Help for usage instructions](https://fredhelp.example/embed/) [Back to Top](#top) ### Sub'
    article = 'Coinbase Bitcoin (CBBTCUSD)\nUnits: U.S. Dollars\nFrequency: Daily\n' + controls
    assert clean_page_text(controls) == ''
    excerpt = saved_excerpt(controls, article, 'Bitcoin price')
    assert 'Coinbase Bitcoin' in excerpt
    assert 'responsive' not in excerpt and 'http' not in excerpt and '###' not in excerpt


def test_fred_observations_are_kept_instead_of_editor_and_copyright_text():
    text = 'Navigation\nCoinbase Bitcoin (CBBTCUSD)\nObservations\n2026-11-01: 78,110.97 U.S. Dollars\nFrequency: Daily\nFullscreen\nData in this graph are copyrighted.\nPermalink/Embed\nSelect automatic updates'
    clean = clean_page_text(text)
    assert clean.startswith('Coinbase Bitcoin')
    assert '78,110.97' in clean
    assert 'copyrighted' not in clean and 'Navigation' not in clean

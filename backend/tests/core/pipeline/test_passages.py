from claimtrace.core.pipeline.passages import (
    quote_in_text,
    quoted_table,
    saved_excerpt,
    split_passages,
    top_passages,
    with_table_headings,
)
from claimtrace.core.search.fetcher import clean_page_text


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


def test_a_quoted_table_row_gets_its_year_headings_back_from_the_saved_page():
    page = (
        "Vietnam Macro Poverty Outlook\nRecent history and projections\n2023 2024 2025e 2026f 2027f 2028f\n"
        "Real GDP growth, at constant market prices 5.0 7.0 8.0 6.3 7.6 7.2\n"
        "Private consumption 3.4 6.6 7.5 6.5 7.0 7.0\nSource: World Bank."
    )
    row = "Private consumption 3.4 6.6 7.5 6.5 7.0 7.0"
    assert with_table_headings(row, page) == f"2023 2024 2025e 2026f 2027f 2028f {row}"
    assert saved_excerpt(row, page, "consumption") == f"2023 2024 2025e 2026f 2027f 2028f {row}"

    whole = "Recent history and projections 2023 2024 2025e 2026f 2027f 2028f Real GDP growth, at constant market prices 5.0 7.0 8.0 6.3 7.6 7.2"
    assert with_table_headings(whole, page) == whole


def test_prose_and_rows_without_matching_headings_are_left_as_quoted():
    page = "2021 2022 2023\nInflation 1.8 3.2 3.3\nExports 10 20 30 40\nGrowth reached 5.0 percent in 2023."
    assert with_table_headings("Growth reached 5.0 percent in 2023.", page) == "Growth reached 5.0 percent in 2023."
    assert with_table_headings("Exports 10 20 30 40", page) == "Exports 10 20 30 40"
    assert with_table_headings("Inflation 1.8 3.2 3.3", "Inflation 1.8 3.2 3.3") == "Inflation 1.8 3.2 3.3"
    assert with_table_headings("Inflation 1.8 3.2 3.3", page) == "2021 2022 2023 Inflation 1.8 3.2 3.3"


def test_a_quoted_markdown_table_row_gets_its_heading_row_back():
    page = (
        "Top 2026 Movies at the Worldwide Box Office\n"
        "| Rank | Movie | Worldwide Box Office | Domestic Box Office | International Box Office | Domestic Share |\n"
        "|---|---|---|---|---|---|\n"
        "| 1 | Spider-Man: Brand New Day | $2,521,214,671 | $958,944,095 | $1,562,270,576 | 38.0% |\n"
        "| 2 | The Odyssey | $1,801,793,893 | $700,000,000 | $1,101,793,893 | 38.9% |\n"
        "Figures are cumulative."
    )
    headings = "| Rank | Movie | Worldwide Box Office | Domestic Box Office | International Box Office | Domestic Share |"
    second = "| 2 | The Odyssey | $1,801,793,893 | $700,000,000 | $1,101,793,893 | 38.9% |"
    assert saved_excerpt(second, page, "box office") == f"{headings}\n{second}"
    both = f"| 1 | Spider-Man: Brand New Day | $2,521,214,671 | $958,944,095 | $1,562,270,576 | 38.0% | {second}"
    assert with_table_headings(both, page) == f"{headings}\n{both}"
    assert with_table_headings(headings, page) == headings
    assert with_table_headings(f"{headings}\n{second}", page) == f"{headings}\n{second}"
    assert with_table_headings("| 9 | Unknown | $1 |", page) == "| 9 | Unknown | $1 |"
    numbers_only = "| 1 | 2 | 3 |\n| 4 | 5 | 6 |"
    assert with_table_headings("| 4 | 5 | 6 |", numbers_only) == "| 4 | 5 | 6 |"


def test_the_table_around_a_quoted_row_is_read_from_the_saved_page():
    rows = [f"| {rank} | Film {rank} | ${1000 - rank} | {rank}.0% |" for rank in range(1, 13)]
    page = "\n".join(["Top films", "| Rank | Movie | Worldwide Box Office | Share |", "|---|---|---|---|", *rows, "Notes follow."])
    table = quoted_table(rows[1], page)
    assert table["columns"] == ["Rank", "Movie", "Worldwide Box Office", "Share"]
    assert len(table["rows"]) == 8 and table["rows"][1] == ["2", "Film 2", "$998", "2.0%"]
    assert table["quoted"] == [1]
    # A row far down the table is kept after the first rows, and two rows quoted together are both marked.
    late = quoted_table(f"{rows[10]} {rows[11]}", page)
    assert [row[0] for row in late["rows"]] == ["1", "2", "3", "4", "5", "6", "7", "8", "11", "12"]
    assert late["quoted"] == [8, 9]
    assert quoted_table("Film 2 earned $998.", page) is None
    assert quoted_table("| 1 | 2 | 3 |", "| 1 | 2 | 3 |\n| 4 | 5 | 6 |") is None

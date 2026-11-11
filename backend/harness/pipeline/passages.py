"""Picks the parts of a page most relevant to a claim, so judges read passages rather than whole pages."""

import re

from rank_bm25 import BM25Plus

from ..search.fetcher import clean_page_text
from ..search.tavily import (
    norway_car_registration_excerpt,
    norway_car_registration_page,
    norway_car_registration_period,
    source_url_key,
)

MAX_WORDS = 120
STOP_WORDS = set("a an the of to in on at for from with by as and or is are was were be been it its that this their "
                 "has have had can could would should will did does do not no than then into about "
                 "là và của ở có được đã những các một vào trong với cho từ này đó".split())


def split_passages(text: str) -> list[str]:
    passages: list[str] = []
    current: list[str] = []
    for paragraph in re.split(r"\n+", clean_page_text(text)):
        words = paragraph.split()
        if not words:
            continue
        if current and len(current) + len(words) > MAX_WORDS:
            passages.append(" ".join(current))
            current = []
        for start in range(0, len(words), MAX_WORDS):
            piece = words[start : start + MAX_WORDS]
            if len(piece) == MAX_WORDS:
                passages.append(" ".join(piece))
            else:
                current += piece
    if current:
        passages.append(" ".join(current))
    return passages


def quote_in_text(quote: str, text: str) -> bool:
    """Models copy from passages, which join a page's lines with single spaces, so spacing can't count against a quote."""
    clean_quote = " ".join(clean_page_text(quote).split())
    return bool(clean_quote) and clean_quote in " ".join(clean_page_text(text).split())


def _tokens(text: str) -> list[str]:
    return [word for word in re.findall(r"\w+", text.lower()) if word not in STOP_WORDS]


def top_passages(text: str, claim: str, count: int) -> str:
    """The best passages joined in reading order, because that keeps their context."""
    passages = split_passages(text)
    if len(passages) <= count:
        return "\n\n".join(passages)
    scores = BM25Plus([_tokens(passage) for passage in passages]).get_scores(_tokens(claim))
    best = sorted(range(len(passages)), key=lambda index: scores[index], reverse=True)[:count]
    return "\n\n".join(passages[index] for index in sorted(best))


def page_for_reading(text: str, query: str, max_chars: int) -> str:
    """The whole page in reading order, or its most relevant passages when it is too long to send whole."""
    passages = split_passages(text)
    whole = "\n\n".join(passages)
    if len(whole) <= max_chars:
        return whole
    return top_passages(text, query, max(1, max_chars * len(passages) // len(whole)))


def source_passages(text: str, url: str | None, claim: str, query: str, count: int) -> str:
    if url and source_url_key(url) == source_url_key(norway_car_registration_page()):
        period = norway_car_registration_period(claim)
        if period and (excerpt := norway_car_registration_excerpt(text, period)):
            return excerpt
    return top_passages(text, query, count)


_YEAR_HEADING = re.compile(r"(?:FY)?(?:19|20)\d{2}(?:[/–-]\d{2,4})?[a-z]?", re.IGNORECASE)
_TABLE_CELL = re.compile(r"[-−–+]?\(?\d[\d.,]*\)?%?|n/?a|[-–—.]{1,2}", re.IGNORECASE)
_HEADING_SEARCH_LINES = 60


def _year_run(words: list[str]) -> int:
    """How many year headings such as 2024 or 2026f stand together at the end of these words."""
    count = 0
    while count < len(words) and _YEAR_HEADING.fullmatch(words[-1 - count]):
        count += 1
    return count


def _pipe_cells(line: str) -> list[str] | None:
    """The cells of a Markdown table row such as "| 1 | Film | $2,521 |", or None for any other line."""
    line = line.strip()
    if len(line) < 5 or not (line.startswith("|") and line.endswith("|")) or line.count("|") < 3:
        return None
    return [cell.strip() for cell in line[1:-1].split("|")]


def _pipe_table_headings(quote: str, lines: list[str], row: int) -> str | None:
    """The heading row of the Markdown table that the quoted row sits in, when the page has one."""
    cells = _pipe_cells(quote)
    if not cells:
        return None
    top = row
    while top > 0 and _pipe_cells(lines[top - 1]):
        top -= 1
    headings = _pipe_cells(lines[top]) or []
    worded = [cell for cell in headings if cell and not re.search(r"\d", cell)]
    # Passages join lines, so a quote can hold several rows, each split from the next by an empty cell.
    fits = len(headings) >= 2 and (len(cells) + 1) % (len(headings) + 1) == 0
    if top == row or not fits or len(worded) * 2 < len(headings):
        return None
    return lines[top]


MAX_TABLE_ROWS = 8


def quoted_table(quote: str, source_text: str) -> dict | None:
    """The Markdown table a quoted row was copied from: its headings and first rows, read from the saved page.

    A row means more beside its neighbours, so the page's chart can show where it stands. The quoted rows
    are always kept, whatever their place. None when the quote is not a row of a table with headings.
    """
    if not _pipe_cells(quote):
        return None
    lines = [" ".join(line.split()) for line in clean_page_text(source_text).splitlines()]
    lines = [line for line in lines if line]
    start = " ".join(lines).find(" ".join(quote.split()))
    if start < 0:
        return None
    row = sum(1 for line_start in _line_starts(lines) if line_start <= start) - 1
    headings = _pipe_table_headings(quote, lines, row)
    if not headings:
        return None
    columns = _pipe_cells(headings) or []
    top = row
    while top > 0 and _pipe_cells(lines[top - 1]):
        top -= 1
    body = []
    for line in lines[top + 1 :]:
        cells = _pipe_cells(line)
        if not cells or len(cells) != len(columns):
            break
        body.append(cells)
    first = row - top - 1
    count = (len(_pipe_cells(quote) or []) + 1) // (len(columns) + 1)
    quoted = [index for index in range(first, first + count) if 0 <= index < len(body)]
    if not quoted:
        return None
    kept = sorted(set(range(min(MAX_TABLE_ROWS, len(body)))) | set(quoted))
    return {"columns": columns, "rows": [body[index] for index in kept], "quoted": [kept.index(index) for index in quoted]}


def with_table_headings(quote: str, source_text: str) -> str:
    """A table row quoted alone is a label and a run of numbers that nobody can read.

    When the page has the row's column headings above it (a Markdown heading row, or a line of years with
    one for each number), they are put back in front of the quote. Every word still comes from the saved
    page, and no model is asked.
    """
    if "\n" in quote.strip():
        return quote
    if _pipe_cells(quote):
        lines = [" ".join(line.split()) for line in clean_page_text(source_text).splitlines()]
        lines = [line for line in lines if line]
        start = " ".join(lines).find(" ".join(quote.split()))
        if start < 0:
            return quote
        row = sum(1 for line_start in _line_starts(lines) if line_start <= start) - 1
        headings = _pipe_table_headings(quote, lines, row)
        return f"{headings}\n{quote.strip()}" if headings else quote
    words = quote.split()
    cells = 0
    while cells < len(words) and _TABLE_CELL.fullmatch(words[-1 - cells]):
        cells += 1
    label = words[: len(words) - cells]
    if cells < 3 or not any(re.search(r"[^\W\d_]{2}", word) for word in label):
        return quote
    # The quote already carries its headings when three or more years stand together inside it.
    if any(_year_run(label[: end + 1]) >= 3 for end in range(len(label))):
        return quote
    lines = [" ".join(line.split()) for line in clean_page_text(source_text).splitlines()]
    lines = [line for line in lines if line]
    page = " ".join(lines)
    start = page.find(" ".join(words))
    if start < 0:
        return quote
    row = sum(1 for line_start in _line_starts(lines) if line_start <= start) - 1
    for line in reversed(lines[max(0, row - _HEADING_SEARCH_LINES) : row + 1]):
        line_words = line.split()
        years = _year_run(line_words)
        if years == cells and years >= 3:
            return f"{' '.join(line_words[-years:])} {quote}"
    return quote


def _line_starts(lines: list[str]):
    """Where each line begins once the lines are joined by single spaces."""
    position = 0
    for line in lines:
        yield position
        position += len(line) + 1


def saved_excerpt(excerpt: str, source_text: str, claim: str) -> str:
    """Old saved Markdown captions can be replaced by prose from the same saved source, without a model call."""
    cleaned = clean_page_text(excerpt)
    if cleaned:
        return with_table_headings(cleaned, source_text)
    passage = top_passages(source_text, claim, 1)
    if len(passage) <= 280:
        return passage
    sentence = re.split(r"(?<!\b[A-Z]\.)(?<=[.!?])\s+", passage)[0]
    return sentence if len(sentence) <= 280 else passage[:280].rsplit(" ", 1)[0] + "…"

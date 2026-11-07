"""Picks the parts of a page most relevant to a claim, so judges read passages rather than whole pages."""

import re

from rank_bm25 import BM25Plus

from ..search.fetcher import clean_page_text

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


def saved_excerpt(excerpt: str, source_text: str, claim: str) -> str:
    """Old saved Markdown captions can be replaced by prose from the same saved source, without a model call."""
    cleaned = clean_page_text(excerpt)
    if cleaned:
        return cleaned
    passage = top_passages(source_text, claim, 1)
    if len(passage) <= 280:
        return passage
    sentence = re.split(r"(?<!\b[A-Z]\.)(?<=[.!?])\s+", passage)[0]
    return sentence if len(sentence) <= 280 else passage[:280].rsplit(" ", 1)[0] + "…"

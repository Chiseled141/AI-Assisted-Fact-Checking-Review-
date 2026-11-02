"""Picks the parts of a page most relevant to a claim, so judges read passages rather than whole pages."""

import re

from rank_bm25 import BM25Okapi

MAX_WORDS = 120


def split_passages(text: str) -> list[str]:
    passages: list[str] = []
    current: list[str] = []
    for paragraph in re.split(r"\n+", text):
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


def _tokens(text: str) -> list[str]:
    return re.findall(r"\w+", text.lower())


def top_passages(text: str, claim: str, count: int) -> str:
    """The best passages joined in reading order, because that keeps their context."""
    passages = split_passages(text)
    if len(passages) <= count:
        return "\n\n".join(passages)
    scores = BM25Okapi([_tokens(passage) for passage in passages]).get_scores(_tokens(claim))
    best = sorted(range(len(passages)), key=lambda index: scores[index], reverse=True)[:count]
    return "\n\n".join(passages[index] for index in sorted(best))

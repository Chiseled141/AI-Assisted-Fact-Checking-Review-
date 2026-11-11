"""Minimal identity checks for claims about named people. A matching name is necessary, not proof of the claim."""

import re
import unicodedata


def _words(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.casefold().replace("đ", "d"))
    plain = "".join(char for char in text if not unicodedata.combining(char))
    return " ".join(re.findall(r"[^\W_]+", plain))


def names_person(text: str, name: str | None) -> bool:
    return bool(name and _words(name) and f" {_words(name)} " in f" {_words(text)} ")


def person_query(query: str, name: str | None, claim: str) -> str:
    if names_person(claim, name) and not names_person(query, name):
        return f'"{name}" {query}'[:400]
    return query[:400]


def wants_public_profile(claim: str, name: str | None) -> bool:
    if not names_person(claim, name):
        return False
    return bool(re.search(
        r"\b(lives in|resides in|is based in|song o|song tai|cu tru|"
        r"influencer|content creator|youtuber|streamer|nha sang tao noi dung)\b",
        _words(claim),
    ))

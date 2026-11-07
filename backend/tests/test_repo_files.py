"""Keeps secrets out of git."""

from pathlib import Path

ROOT = Path(__file__).parent.parent.parent


def test_secrets_are_ignored_by_git():
    assert ".env" in (ROOT / ".gitignore").read_text().split()

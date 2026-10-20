"""What world sync's imports share (`release_sync`, `live_sync`, `setlist_sync`, `roster`)."""

import re
from collections.abc import Awaitable, Callable

Fetch = Callable[[str], Awaitable[str]]
"""A page's text; raises WorldSyncError if it cannot be had."""


def hiragana(text: str) -> str:
    """Katakana as hiragana: イルミネーションスターズ is the reading いるみねーしょんすたーず."""
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in text)


def without_spaces(text: str) -> str:
    """Without any whitespace: 関根 瞳 is 関根瞳."""
    return re.sub(r"\s", "", text)

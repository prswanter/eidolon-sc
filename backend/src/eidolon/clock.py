"""The current time, as every module that needs it takes it: a function tests can replace."""

from collections.abc import Callable
from datetime import UTC, datetime

Clock = Callable[[], datetime]
"""The current time, timezone-aware."""


def utc_now() -> datetime:
    return datetime.now(UTC)

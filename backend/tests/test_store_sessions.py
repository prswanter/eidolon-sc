"""Sessions in the store: one that has expired is deleted, not only refused, whoever's it
is, once anyone signs in."""

import sqlite3
from collections.abc import Iterator
from datetime import timedelta
from pathlib import Path

import pytest

from eidolon.store import SESSION_LIFETIME, Store
from tests.fakes import START


@pytest.fixture
def store(tmp_path: Path) -> Iterator[Store]:
    store = Store(tmp_path / "eidolon.db")
    yield store
    store.close()


def sessions_of(path: Path) -> list[str]:
    with sqlite3.connect(path) as db:
        users = [user for (user,) in db.execute("SELECT user_id FROM sessions ORDER BY expires_at")]
    db.close()
    return users


def test_signing_in_deletes_everyones_expired_sessions(store: Store, tmp_path: Path):
    away = store.create_user("away").id  # and never comes back
    still = store.create_user("still").id
    newcomer = store.create_user("newcomer").id
    store.create_session(away, START)
    store.create_session(still, START + timedelta(days=1))

    store.create_session(newcomer, START + SESSION_LIFETIME)

    assert sessions_of(tmp_path / "eidolon.db") == [still, newcomer]


def test_deleting_expired_sessions_needs_no_scan_of_the_whole_table(
    store: Store, tmp_path: Path
):
    with sqlite3.connect(tmp_path / "eidolon.db") as db:
        plan = db.execute("EXPLAIN QUERY PLAN DELETE FROM sessions WHERE expires_at <= 0").fetchall()
    db.close()

    assert "SEARCH" in " ".join(detail for *_, detail in plan)

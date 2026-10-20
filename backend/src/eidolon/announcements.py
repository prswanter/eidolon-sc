"""Announcements (GLOSSARY.md「公告」): what admins write in the admin console for every
user to see, kept in the database (`announcements`).

An announcement is only its body, in Markdown, with no title and no author. It is
written as a draft, which only admins see, and is published, withdrawn back to a draft,
or deleted. When it was published (`published_at`) is what tells users it is new: editing
a published one keeps it, so that fixing a typo does not show it to everyone again;
withdrawing it clears it, and publishing it again sets it anew. `updated_at` is when its
body was last written.

Whether a user has read them is kept in their browser, not here.
"""

import threading
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Literal

from eidolon.clock import Clock
from eidolon.database import connect

MAX_BODY = 5000
"""The most characters an announcement's body may have."""

SHOWN = 20
"""How many of the announcements published users see at most, the latest."""

Status = Literal["draft", "published"]

_SCHEMA = """
-- The announcements admins write; `published_at` NULL while a draft.
CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY,
    body TEXT NOT NULL,
    published_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""

_COLUMNS = "id, body, published_at, created_at, updated_at"


class NoSuchAnnouncement(Exception):
    """There is no announcement with that id."""


@dataclass(frozen=True)
class Announcement:
    id: str
    body: str
    published_at: str | None
    """When it was published, ISO 8601; None while a draft."""
    created_at: str
    updated_at: str

    @property
    def status(self) -> Status:
        return "draft" if self.published_at is None else "published"

    def described(self) -> dict:
        """What admins see of it."""
        return asdict(self) | {"status": self.status}

    def shown(self) -> dict:
        """What users see of it."""
        return {"id": self.id, "body": self.body, "published_at": self.published_at}


class Announcements:
    def __init__(self, path: Path, clock: Clock) -> None:
        self._db = connect(path)
        self._lock = threading.Lock()
        with self._lock, self._db:
            self._db.executescript(_SCHEMA)
        self._clock = clock

    def all(self) -> list[Announcement]:
        """Every announcement: the drafts, last written first, then those published, last
        published first."""
        return self._select(
            " ORDER BY published_at IS NOT NULL, published_at DESC, created_at DESC,"
            " rowid DESC"
        )

    def published(self) -> list[Announcement]:
        """The `SHOWN` announcements published last, last first."""
        return self._select(
            " WHERE published_at IS NOT NULL ORDER BY published_at DESC, rowid DESC LIMIT ?",
            (SHOWN,),
        )

    def get(self, id: str) -> Announcement:
        found = self._select(" WHERE id = ?", (id,))
        if not found:
            raise NoSuchAnnouncement(id)
        return found[0]

    def write(self, body: str) -> Announcement:
        """A new draft of `body`."""
        now = self._clock().isoformat()
        id = uuid.uuid4().hex
        with self._lock, self._db:
            self._db.execute(
                f"INSERT INTO announcements ({_COLUMNS}) VALUES (?, ?, NULL, ?, ?)",
                (id, body, now, now),
            )
        return self.get(id)

    def edit(self, id: str, body: str) -> Announcement:
        """Replace its body, keeping whether and when it was published."""
        return self._update(
            id, "body = ?, updated_at = ?", (body, self._clock().isoformat())
        )

    def publish(self, id: str) -> Announcement:
        """Publish it now; nothing for one published already."""
        return self._update(
            id, "published_at = COALESCE(published_at, ?)", (self._clock().isoformat(),)
        )

    def withdraw(self, id: str) -> Announcement:
        """Make it a draft again."""
        return self._update(id, "published_at = NULL", ())

    def delete(self, id: str) -> None:
        with self._lock, self._db:
            deleted = self._db.execute("DELETE FROM announcements WHERE id = ?", (id,))
        if deleted.rowcount == 0:
            raise NoSuchAnnouncement(id)

    def close(self) -> None:
        self._db.close()

    def _update(self, id: str, assignments: str, values: tuple) -> Announcement:
        with self._lock, self._db:
            updated = self._db.execute(
                f"UPDATE announcements SET {assignments} WHERE id = ?", (*values, id)
            )
        if updated.rowcount == 0:
            raise NoSuchAnnouncement(id)
        return self.get(id)

    def _select(self, rest: str, values: tuple = ()) -> list[Announcement]:
        with self._lock:
            rows = self._db.execute(
                f"SELECT {_COLUMNS} FROM announcements{rest}", values
            ).fetchall()
        return [Announcement(*row) for row in rows]

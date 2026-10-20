"""The roster: who in the world setting a name in world sync's sources stands for.

Built from the world setting's idols, units, president and clerk, it answers three
things: which idol a name (with a voice actor's name, maybe) is, which unit a name or
reading is, and whether someone is the president or the clerk. Each import picks the
names and voice actors' names out of its own source; how they are compared is settled
here only:

- names and voice actors' names: NFKC, no whitespace, no trailing note like 「（初代）」;
- units' names and readings: NFKC, `’` as `'`, katakana as hiragana, nothing but word
  characters, casefolded.
"""

import re
import unicodedata
from collections.abc import Iterable

from eidolon.sync_tools import hiragana, without_spaces
from eidolon.world import Idol, Staff, Unit

_NOTE = re.compile(r"\([^()]*\)$")
"""A note at the end of a name, once NFKC-normalized: 三峰結華（初代）."""


def person_key(name: str) -> str:
    """A name or voice actor's name for comparing: `三峰 結華（初代）` is `三峰結華`."""
    return _NOTE.sub("", without_spaces(unicodedata.normalize("NFKC", name)))


def unit_key(name: str) -> str:
    """A unit's name or reading for comparing: `L’Antica` is `l'antica`,
    `illumination STARS` is `illuminationstars`, `イルミネーションスターズ` is
    `いるみねーしょんすたーず`."""
    text = hiragana(unicodedata.normalize("NFKC", name).replace("’", "'"))
    return re.sub(r"[\W_]", "", text).casefold()


class Roster:
    def __init__(
        self, idols: Iterable[Idol], units: Iterable[Unit], staff: Iterable[Staff] = ()
    ) -> None:
        idols, units = list(idols), tuple(units)
        self.idols = tuple(idol.name for idol in idols)
        """The idols' names, in the world setting's order."""
        self.units = units
        self._by_name = {person_key(idol.name): idol.name for idol in idols}
        self._by_cv = {person_key(idol.cv): idol.name for idol in idols if idol.cv}
        self._units: dict[str, Unit] = {}
        for unit in units:
            for name in (unit.name, unit.reading):
                if name and unit_key(name):
                    self._units.setdefault(unit_key(name), unit)
        self._staff = {person_key(s.name) for s in staff}

    def idol(self, name: str | None, cv: str | None = None) -> str | None:
        """The idol called `name`, or failing that the one voiced by `cv`; None if neither is anyone."""
        if name and (idol := self._by_name.get(person_key(name))):
            return idol
        return self._by_cv.get(person_key(cv)) if cv else None

    def unit(self, name: str) -> Unit | None:
        """The unit named or read `name`; a special unit is none."""
        return self._units.get(key) if (key := unit_key(name)) else None

    def is_staff(self, name: str) -> bool:
        """Whether `name` is the president or the clerk."""
        return person_key(name) in self._staff

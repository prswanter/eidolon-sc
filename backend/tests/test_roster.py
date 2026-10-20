"""The roster: world sync's imports all take the names, voice actors' names and unit
names in their sources to idols and units, and tell the president and the clerk, through
it, compared one way."""

import pytest

from eidolon.roster import Roster, unit_key
from eidolon.world import Idol, Staff, Unit

ROSTER = Roster(
    idols=[
        Idol("櫻木真乃", "さくらぎまの", "illumination STARS", "関根瞳", ()),
        Idol("風野灯織", "かざのひおり", "illumination STARS", "近藤玲奈", ()),
        Idol("月岡恋鐘", "つきおかこがね", "L'Antica", "礒部花凜", ()),
        Idol("三峰結華", "みつみねゆいか", "L'Antica", "希水しお", ()),
    ],
    units=[
        Unit("illumination STARS", "イルミネーションスターズ", ("櫻木真乃", "風野灯織"), ()),
        Unit("L'Antica", "アンティーカ", ("月岡恋鐘", "三峰結華"), ()),
    ],
    staff=[
        Staff("天井努", "あまいつとむ", "社長", ()),
        Staff("七草はづき", "ななくさはづき", "事務員", ()),
    ],
)


@pytest.mark.parametrize(
    ("name", "cv", "idol"),
    [
        ("櫻木真乃", None, "櫻木真乃"),
        ("櫻木 真乃", None, "櫻木真乃"),  # a space in the name
        ("櫻木　真乃", None, "櫻木真乃"),  # a full-width space
        ("三峰結華（初代）", None, "三峰結華"),  # a note
        ("三峰結華(初代)", None, "三峰結華"),
        (None, "関根瞳", "櫻木真乃"),  # only the voice actor
        ("", "関根瞳", "櫻木真乃"),
        (None, "関根 瞳", "櫻木真乃"),  # a voice actor with a space
        (None, "礒部花凜（初代）", "月岡恋鐘"),
        ("誰か", "近藤玲奈", "風野灯織"),  # no such name, but the voice actor
        ("月岡恋鐘", "関根瞳", "月岡恋鐘"),  # the name first
        ("ＳＡＫＵＲＡＧＩ", None, None),  # nobody
        ("天井努", None, None),  # the president is no idol
        ("誰か", "誰かの声", None),
        (None, None, None),
    ],
)
def test_a_name_or_its_voice_actor_is_an_idol(name: str | None, cv: str | None, idol: str | None) -> None:
    assert ROSTER.idol(name, cv) == idol


@pytest.mark.parametrize(
    ("name", "unit"),
    [
        ("illumination STARS", "illumination STARS"),
        ("illuminationSTARS", "illumination STARS"),
        ("ＩＬＬＵＭＩＮＡＴＩＯＮ ＳＴＡＲＳ", "illumination STARS"),  # full-width
        ("L'Antica", "L'Antica"),
        ("L’Antica", "L'Antica"),  # ’ for '
        ("l'antica", "L'Antica"),
        ("イルミネーションスターズ", "illumination STARS"),  # the reading in katakana
        ("いるみねーしょんすたーず", "illumination STARS"),  # the reading in hiragana
        ("ｲﾙﾐﾈｰｼｮﾝｽﾀｰｽﾞ", "illumination STARS"),  # half-width katakana
        ("あんてぃーか", "L'Antica"),
        ("Team.Stella", None),  # a special unit is none
        ("櫻木真乃", None),
        ("", None),
    ],
)
def test_a_name_or_reading_is_a_unit(name: str, unit: str | None) -> None:
    found = ROSTER.unit(name)
    assert (found.name if found else None) == unit


@pytest.mark.parametrize(
    ("name", "staff"),
    [
        ("天井努", True),  # the president
        ("七草はづき", True),  # the clerk
        ("七草 はづき", True),
        ("櫻木真乃", False),
        ("誰か", False),
    ],
)
def test_the_president_and_the_clerk_are_told(name: str, staff: bool) -> None:
    assert ROSTER.is_staff(name) is staff


def test_units_are_compared_the_same_way_before_the_roster_is_built() -> None:
    """World sync matches the units up before it builds the roster, the same way."""
    assert unit_key("L’Antica") == unit_key("ＬＡＮＴＩＣＡ") == unit_key("l'antica")
    assert unit_key("アンティーカ") == unit_key("あんてぃーか")
    assert unit_key("illumination STARS") != unit_key("L'Antica")

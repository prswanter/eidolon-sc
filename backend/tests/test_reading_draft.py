"""Drafting the readings file (`eidolon reading draft`, GLOSSARY.md「读音」): each
character's full name, surname and given name, read as her sheet's first line has them,
the units and the office's staff as the world setting reads them; phonemes made with
pyopenjtalk. Run again, it fills in the phonemes left empty and adds the characters and
units the file lacks, and leaves every entry that has phonemes as it is."""

import json
from datetime import date
from pathlib import Path

import pytest

from eidolon.reading_draft import to_phonemes
from eidolon.readings import Reading, load_readings
from eidolon.world import Staff, Unit, World, world_path
from tests.conftest import Admin, CharacterConfig

WORLD = World(
    as_of=date(2026, 10, 1),
    office="283プロダクション",
    staff=(Staff("天井努", "あまいつとむ", "社長", ()),),
    units=(Unit("illumination STARS", "いるみねーしょんすたーず", ("櫻木真乃", "八宮めぐる"), ()),),
    idols=(),
)


def sheet(name: str, reading: str) -> str:
    return f"# 人设：{name}\n\n## 身份\n你是 283 事务所的偶像{name}（{reading}），16 岁。"


@pytest.fixture
def config(tmp_path: Path) -> CharacterConfig:
    """Mano, Meguru (her given name in kana) and Toru (hers a word of its own), and the
    world setting."""
    config = CharacterConfig(tmp_path / "characters")
    config.add("mano", "櫻木真乃", sheet("櫻木真乃", "さくらぎ まの"), speakers=["真乃"])
    config.add("meguru", "八宮めぐる", sheet("八宮めぐる", "はちみや めぐる"), speakers=["めぐる"])
    config.add("toru", "浅倉透", sheet("浅倉透", "あさくら とおる"), speakers=["透"])
    config.write("world.json", json.dumps(WORLD.to_json(), ensure_ascii=False))
    return config


def draft(admin: Admin, config: CharacterConfig) -> tuple[Reading, ...]:
    admin.run("reading", "draft", "--characters", str(config.path))
    return load_readings(config.directory / "readings.toml")


def test_a_first_draft_reads_the_characters_units_and_staff(admin: Admin, config: CharacterConfig):
    readings = draft(admin, config)

    assert [(r.written, r.kana) for r in readings] == [
        ("櫻木真乃", "さくらぎ まの"), ("櫻木", "さくらぎ"), ("真乃", "まの"),
        ("八宮めぐる", "はちみや めぐる"), ("八宮", "はちみや"),
        ("浅倉透", "あさくら とおる"), ("浅倉", "あさくら"),  # not 透 alone: 透明, 透き通る
        ("illumination STARS", "いるみねーしょんすたーず"),
        ("天井努", "あまいつとむ"),
    ]
    phonemes = {r.written: r.phonemes for r in readings}
    assert all(phonemes.values())
    # Surname and given name made apart and put together.
    assert phonemes["櫻木真乃"] == to_phonemes("さくらぎ") + to_phonemes("まの")


def test_run_again_it_fills_in_empty_phonemes_adds_who_is_missing_and_leaves_the_rest(
    admin: Admin, config: CharacterConfig
):
    path = config.directory / "readings.toml"
    path.write_text(
        '[[readings]]\nwritten = "櫻木真乃"\nkana = "さくらぎ まの"\nphonemes = "sa0ku1ra1gi1ma1no0"\n\n'
        '[[readings]]\nwritten = "天井努"\nkana = "あまい つとむ"\nphonemes = ""\n\n'
        '[[readings]]\nwritten = "283"\nkana = "つばさ"\nphonemes = "tsu0ba1sa0"\n',
        encoding="utf-8",
    )

    readings = draft(admin, config)

    assert readings[0] == Reading("櫻木真乃", "さくらぎ まの", "sa0ku1ra1gi1ma1no0")  # tuned by hand
    assert readings[1] == Reading("天井努", "あまい つとむ", to_phonemes("あまい") + to_phonemes("つとむ"))
    assert readings[2] == Reading("283", "つばさ", "tsu0ba1sa0")
    # Mano is in the file already, by her full name: her surname and given name, left out
    # by whoever kept it, stay out.
    assert [r.written for r in readings[3:]] == [
        "八宮めぐる", "八宮", "浅倉透", "浅倉", "illumination STARS"
    ]

    written = path.read_text(encoding="utf-8")
    admin.run("reading", "draft", "--characters", str(config.path))

    assert path.read_text(encoding="utf-8") == written  # word for word


def test_a_character_whose_sheet_does_not_say_how_her_name_is_read_is_reported(
    admin: Admin, config: CharacterConfig
):
    config.add("kogane", "月岡恋鐘", "# 人设\n你是月岡恋鐘。", speakers=["恋鐘"])

    out = admin.run("reading", "draft", "--characters", str(config.path))

    assert "月岡恋鐘" in out
    assert "月岡恋鐘" not in {r.written for r in load_readings(config.directory / "readings.toml")}


def test_without_the_world_setting_only_the_characters_are_drafted(admin: Admin, config: CharacterConfig):
    world_path(config.path).unlink()

    readings = draft(admin, config)

    assert "illumination STARS" not in {r.written for r in readings}
    assert readings[0].written == "櫻木真乃"


# Phonemes as Fish Audio's documentation makes them (Fine-grained Control → Japanese).


def test_kana_is_read_as_one_word_not_as_a_sentence():
    """In hiragana OpenJTalk takes は for the particle, read わ."""
    assert to_phonemes("はちみや").startswith("ha")
    assert "wa" not in to_phonemes("なつは")


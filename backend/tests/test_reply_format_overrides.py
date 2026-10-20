"""The reply format's wording, reworded from the site (`/reply-format`): kept beside the
database rather than in the repository, used from the next turn on without a restart, and
the module's own text when there is none or it cannot be read."""

import pytest

from eidolon.reply_format import (
    DEFAULTS,
    DIRECTED_FORMAT_INSTRUCTIONS,
    FORMAT_INSTRUCTIONS,
    clear_overrides,
    current_blocks,
    format_instructions,
    overrides_path,
    save_overrides,
)

FORMAT = "<ja>テスト</ja><zh>测试</zh>\n"
CUES = "用方括号写提示。"
DIRECTED = "照导演说戏那样写。"


@pytest.fixture(autouse=True)
def _beside_a_database(monkeypatch, tmp_path):
    """As the backend has it in the container: the overrides sit beside the database."""
    monkeypatch.setenv("EIDOLON_DATABASE_PATH", str(tmp_path / "eidolon.db"))


def test_the_module_has_the_format_until_it_is_reworded():
    assert current_blocks() == DEFAULTS
    assert format_instructions(None) == FORMAT_INSTRUCTIONS
    assert format_instructions("drama-3") == DIRECTED_FORMAT_INSTRUCTIONS


def test_a_rewording_is_used_at_once_and_kept_beside_the_database():
    save_overrides({"format": FORMAT, "cues": CUES, "directed_cues": DIRECTED})

    assert overrides_path().exists()
    assert format_instructions(None) == FORMAT + CUES
    assert format_instructions("drama-3") == FORMAT + DIRECTED


def test_a_block_left_out_keeps_the_modules():
    save_overrides({"format": FORMAT})

    assert current_blocks()["cues"] == DEFAULTS["cues"]
    assert format_instructions(None) == FORMAT + DEFAULTS["cues"]


def test_clearing_goes_back_to_the_modules():
    save_overrides({"format": FORMAT, "cues": CUES, "directed_cues": DIRECTED})
    clear_overrides()

    assert not overrides_path().exists()
    assert format_instructions(None) == FORMAT_INSTRUCTIONS


def test_a_file_that_cannot_be_read_leaves_the_modules_be():
    overrides_path().write_text("{ 不是 JSON", encoding="utf-8")

    assert current_blocks() == DEFAULTS
    assert format_instructions(None) == FORMAT_INSTRUCTIONS

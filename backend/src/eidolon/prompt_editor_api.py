"""Editing what the prompt is made of, over HTTP: each character's sheet and the reply
format. Two editors in the rail beside the settings (`/sheets`, `/reply-format`), for users
who agreed to the terms — this is the deployer's own site, and the deployment need not name
any admins for them (`EIDOLON_ADMINS`), unlike the admin console.

A sheet is a Markdown file the character configuration points at (`characters/sheets/`).
Saving one writes that file and loads the characters again, in place: the engine reads the
same dict, so the next turn speaks with the new sheet, no restart. The file is the truth
(ADR-0003), so what is saved is what `git diff` shows.

The reply format is code (`reply_format`), but its wording is the deployer's to change:
its blocks are kept as JSON beside the database (`/data/reply_format.json`, a volume), and
every turn composes the prompt from it. Clearing them goes back to the text in the module.
The tags (`<ja>`, `<zh>`, `<photo>`) cannot be changed: the parser reads them, and a format
without them leaves her reply empty, so one is refused here rather than saved.
"""

from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator

from eidolon.assembly import Backend
from eidolon.characters import Character, CharacterConfigError, in_idol_order, load_characters
from eidolon.config import characters_path_from_env
from eidolon.reply_format import (
    BLOCKS,
    DEFAULTS,
    clear_overrides,
    current_blocks,
    load_overrides,
    save_overrides,
)
from eidolon.sessions import UserId

MAX_SHEET = 40_000
"""How long a sheet may be, in characters: the longest committed one is about 4,400, and
what is here fills the first block of every turn's prompt, so it is not a place for a
volume."""

MAX_BLOCK = 20_000
"""The same for one block of the reply format; together they are about 3,000 now."""

REQUIRED_TAGS = ("<ja>", "</ja>", "<zh>", "</zh>")
"""What the parser reads the reply through: a format without any of them is refused."""


class SheetInput(BaseModel):
    sheet: str = Field(max_length=MAX_SHEET)

    @field_validator("sheet")
    @classmethod
    def _text(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("人设卡不能是空的")
        return text + "\n"


class ReplyFormatInput(BaseModel):
    format: str = Field(max_length=MAX_BLOCK)
    cues: str = Field(max_length=MAX_BLOCK)
    directed_cues: str = Field(max_length=MAX_BLOCK)

    @field_validator("format")
    @classmethod
    def _tags(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("回复格式不能是空的")
        missing = [tag for tag in REQUIRED_TAGS if tag not in text]
        if missing:
            raise ValueError(
                f"回复格式里必须有 {'、'.join(REQUIRED_TAGS)}（解析器靠它们分段），现在缺 {'、'.join(missing)}"
            )
        return text + "\n"

    @field_validator("cues", "directed_cues")
    @classmethod
    def _cues(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("语气提示不能是空的；不想加提示时可以写一句「不要加语气提示」")
        return text + "\n"


def add_prompt_editor_routes(app: FastAPI, backend: Backend) -> None:
    characters = backend.characters

    def described(character: Character) -> dict:
        return {"id": character.id, "name": character.name, "sheet": character.sheet}

    def reply_format() -> dict:
        """The blocks turns use, the text they fall back to, and whether any is reworded."""
        return {
            **current_blocks(),
            "defaults": DEFAULTS,
            "is_overridden": bool(load_overrides()),
        }

    def reload_characters() -> None:
        """Load the configuration again into the dict the engine and the API read."""
        try:
            fresh = load_characters(characters_path_from_env())
        except CharacterConfigError as e:
            raise HTTPException(500, f"人设保存了，但重新读角色配置时出错：{e}")
        characters.clear()
        characters.update(fresh)

    @app.get("/api/editor/sheets")
    def list_sheets(_: UserId) -> list[dict]:
        """Every character's sheet, in the order of their idol numbers."""
        return [described(c) for c in in_idol_order(characters.values())]

    @app.put("/api/editor/sheets/{character_id}")
    def save_sheet(character_id: str, body: SheetInput, _: UserId) -> dict:
        """Write her sheet and take it into use at once."""
        character = characters.get(character_id)
        if character is None or character.sheet_path is None:
            raise HTTPException(404, "没有这位角色")
        path: Path = character.sheet_path
        try:
            # Written beside and moved over it, so that a disk that fills up leaves the old
            # sheet whole rather than half of the new one.
            tmp = path.with_name(path.name + ".tmp")
            tmp.write_text(body.sheet, encoding="utf-8")
            tmp.replace(path)
        except OSError as e:
            raise HTTPException(500, f"写不进 {path}：{e}")
        reload_characters()
        return described(characters[character_id])

    @app.get("/api/editor/reply-format")
    def read_reply_format(_: UserId) -> dict:
        return reply_format()

    @app.put("/api/editor/reply-format")
    def save_reply_format(body: ReplyFormatInput, _: UserId) -> dict:
        """Keep the wording for the turns from now on, without a restart."""
        try:
            save_overrides({name: getattr(body, name) for name in BLOCKS})
        except OSError as e:
            raise HTTPException(500, f"写不进回复格式的改动：{e}")
        return reply_format()

    @app.delete("/api/editor/reply-format")
    def reset_reply_format(_: UserId) -> dict:
        """Go back to the format the code has."""
        try:
            clear_overrides()
        except OSError as e:
            raise HTTPException(500, f"删不掉回复格式的改动：{e}")
        return reply_format()

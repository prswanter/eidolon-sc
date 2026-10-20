"""Each configured character's outfit list (GLOSSARY.md「衣装」): `eidolon stand outfits`.

The source's `spine_manifest.json` (`stand_fetch`) lists the stands fetched; a character
with an `idol_id` gets a list of her cards, in the order of their enzaIds, which is the
order the game released them. A card has her everyday clothes on it (`stand`) and its
stage costume (`stand_costume`), each of which it may lack; when the two textures are
the same byte for byte (most Special cards) they are one outfit, listed as her everyday
clothes (whatever her default outfit is, so that the list does not change with it; a
default outfit left out this way is reported). The chibi stands (`cb`,
`cb_costume`) are left out, and so is an outfit the manifest lists without its files.

A card is named as in the game without the 【】 or her name: 【ほわっとスマイル】櫻木真乃
is ほわっとスマイル. The game left a few cards unnamed (【】櫻木真乃); those go by hers.

The list is written to `outfits/<idol_id>.json` in the build directory, which is laid
out as the bucket is (`stand_upload`):

    {"idol_id": 1, "cards": [{"id": "1030010010", "name": "ナチュラルモード", "type": "P_SR",
      "everyday": {"id": "stand/1030010010", "url": "../spine/idols/stand/1030010010/",
                   "thumbnail": "../thumbnails/stand/1030010010.png"},
      "stage": {...} or null}]}

`url` and `thumbnail` are relative to the list itself.
"""

import json
import os
import re
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path

from eidolon.characters import Character

CATEGORIES = ("stand", "stand_costume")
"""Her everyday clothes on a card, and its stage costume."""
OUTFIT_FILES = ("data.json", "data.atlas", "data.png")
MANIFEST = "spine_manifest.json"
SOURCE_DIR = "source"
LISTS_DIR = "outfits"
THUMBNAILS_DIR = "thumbnails"

_BRACKETED = re.compile(r"【(?P<name>[^】]*)】")


class SourceLayoutError(RuntimeError):
    """The source has not been fetched, or is not as the manifest lays it out."""


def source_directory(build: Path) -> Path:
    """Where `eidolon stand fetch` keeps the stands it fetched in the build directory:
    `spine_manifest.json`, and the outfits' files under `assets/`, laid out as on
    ShinyColorsDB's CDN (and as the old Spine mirror was, so that it can seed it)."""
    return build / SOURCE_DIR


def outfit_path(outfit_id: str) -> str:
    """Where an outfit's files are in the source's `assets`, on the CDN and in the bucket."""
    return f"spine/idols/{outfit_id}/"


def outfit_directory(source: Path, outfit_id: str) -> Path:
    """Where an outfit's files are in the source."""
    return source / "assets" / outfit_path(outfit_id)


def thumbnail_path(outfit_id: str) -> str:
    """Where an outfit's thumbnail is in the build directory and in the bucket."""
    return f"{THUMBNAILS_DIR}/{outfit_id}.png"


def list_path(idol_id: int) -> str:
    """Where an idol's outfit list is in the build directory and in the bucket."""
    return f"{LISTS_DIR}/{idol_id}.json"


@dataclass(frozen=True)
class Card:
    id: str
    """The card's enzaId."""
    name: str
    type: str
    """Its rarity or kind, as the manifest's `dressType`: P_SSR, Special, Mizugi..."""
    everyday: str | None
    """Her everyday clothes on the card, e.g. `stand/1030010010`."""
    stage: str | None
    """Its stage costume, e.g. `stand_costume/1030010010`."""

    @property
    def outfits(self) -> list[str]:
        return [outfit for outfit in (self.everyday, self.stage) if outfit is not None]


@dataclass(frozen=True)
class OutfitList:
    idol_id: int
    character: str
    """Her name, for the report."""
    cards: list[Card]

    @property
    def outfits(self) -> list[str]:
        return [outfit for card in self.cards for outfit in card.outfits]

    def to_json(self) -> dict:
        return {
            "idol_id": self.idol_id,
            "cards": [
                {
                    "id": card.id,
                    "name": card.name,
                    "type": card.type,
                    "everyday": _outfit_json(card.everyday),
                    "stage": _outfit_json(card.stage),
                }
                for card in self.cards
            ],
        }


def _outfit_json(outfit_id: str | None) -> dict | None:
    if outfit_id is None:
        return None
    return {
        "id": outfit_id,
        "url": f"../{outfit_path(outfit_id)}",
        "thumbnail": f"../{thumbnail_path(outfit_id)}",
    }


@dataclass
class OutfitsReport:
    lists: list[OutfitList] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def make_outfit_lists(build: Path, characters: Iterable[Character]) -> OutfitsReport:
    """Write the outfit list of every character with an idol to `build`, from its source."""
    source = source_directory(build)
    entries = read_manifest(source)
    if entries is None:
        raise SourceLayoutError(f"找不到 {source / MANIFEST}，先运行 eidolon stand fetch")
    report = OutfitsReport()
    for character in characters:
        if character.idol_id is None:
            continue
        outfits = _list_outfits(source, entries, character, report.warnings)
        if character.default_outfit is not None and character.default_outfit not in outfits.outfits:
            report.warnings.append(
                f"{character.name} 的 default_outfit {character.default_outfit} 不在她的衣装清单里"
                "（还没有拉取到这套，或者它和同一张卡的私服贴图相同、只记了私服），不会上传，"
                "通话层会退回背景图；改成清单里有的一套"
            )
        write_json(build / list_path(character.idol_id), outfits.to_json())
        report.lists.append(outfits)
    return report


def read_manifest(source: Path) -> list[dict] | None:
    """The source's manifest; None if nothing has been fetched yet."""
    path = source / MANIFEST
    try:
        entries = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise SourceLayoutError(f"{path} 格式有误：{e}") from None
    if not isinstance(entries, list) or not all(isinstance(entry, dict) for entry in entries):
        raise SourceLayoutError(f"{path} 应是一个由对象组成的列表")
    return entries


def _list_outfits(
    source: Path, entries: list[dict], character: Character, warnings: list[str]
) -> OutfitList:
    assert character.idol_id is not None
    cards: dict[str, dict] = {}
    for entry in entries:
        if entry.get("idolId") != character.idol_id or entry.get("category") not in CATEGORIES:
            continue
        if not entry.get("enzaId"):
            raise SourceLayoutError(f"{MANIFEST} 里有一项没有 enzaId：{entry!r}")
        enza_id = str(entry["enzaId"])
        outfit_id = f"{entry['category']}/{enza_id}"
        if not all((outfit_directory(source, outfit_id) / name).is_file() for name in OUTFIT_FILES):
            warnings.append(f"没有 {outfit_id}（{entry.get('dressName', '')}）的文件，没有列进衣装清单")
            continue
        card = cards.setdefault(enza_id, {"entry": entry, "outfits": {}})
        card["outfits"][entry["category"]] = outfit_id

    listed = []
    for enza_id, card in sorted(cards.items()):
        everyday = card["outfits"].get("stand")
        stage = card["outfits"].get("stand_costume")
        if everyday and stage and _same_texture(source, everyday, stage):
            stage = None
        entry = card["entry"]
        listed.append(
            Card(
                id=enza_id,
                name=card_name(str(entry.get("dressName", "")), character.name),
                type=str(entry.get("dressType", "")),
                everyday=everyday,
                stage=stage,
            )
        )
    return OutfitList(character.idol_id, character.name, listed)


def _same_texture(source: Path, first: str, second: str) -> bool:
    first_png, second_png = (outfit_directory(source, o) / "data.png" for o in (first, second))
    return first_png.read_bytes() == second_png.read_bytes()


def card_name(dress_name: str, character_name: str) -> str:
    """The card's name as in the game, without the 【】 or her name; hers if it has none."""
    match = _BRACKETED.search(dress_name)
    name = match["name"].strip() if match else ""
    return name or character_name


def is_webp(content: bytes) -> bool:
    """Whether a file is WebP, as about half the textures on ShinyColorsDB's CDN are
    under their `.png` names."""
    return content[:4] == b"RIFF" and content[8:12] == b"WEBP"


def write_json(path: Path, data: object) -> None:
    write_atomically(path, (json.dumps(data, ensure_ascii=False, indent=1) + "\n").encode())


def write_atomically(path: Path, content: bytes) -> None:
    """Write the file so that it is never found half written."""
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_name(path.name + ".part")
    partial.write_bytes(content)
    os.replace(partial, path)

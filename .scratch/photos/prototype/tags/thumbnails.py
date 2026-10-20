"""几个脚本共用的：配置和初稿的读取，默认衣装缩略图的路径和合成。

缩略图是透明背景 PNG，直接贴到白底上会有黑边，这里按 alpha 合成。
"""

import json
import pathlib
import tomllib

from PIL import Image

HERE = pathlib.Path(__file__).parent
REPO = HERE.parents[3]
CONFIG = REPO / "characters" / "characters.toml"
DRAFT = HERE / "draft.json"
THUMBS = REPO / "corpus" / "stand" / "thumbnails"
BACKDROP = (252, 252, 252)


def load_characters() -> list[dict]:
    """`characters.toml` 里的全部角色。"""
    return tomllib.loads(CONFIG.read_text(encoding="utf-8"))["characters"]


def load_draft() -> list[dict]:
    """`draft.json` 里 28 位的初稿。"""
    return json.loads(DRAFT.read_text(encoding="utf-8"))["characters"]


def source_path(character: dict) -> pathlib.Path:
    """一位角色默认衣装的那张透明背景缩略图。"""
    kind, enza = character["default_outfit"].split("/")
    return THUMBS / kind / f"{enza}.png"


def thumbnail(character: dict) -> Image.Image:
    """一位角色默认衣装的那张缩略图，铺在浅色底上。"""
    image = Image.open(source_path(character)).convert("RGBA")
    backdrop = Image.new("RGB", image.size, BACKDROP)
    backdrop.paste(image, mask=image.getchannel("A"))
    return backdrop


def alpha_box(character: dict) -> tuple[int, int, int, int]:
    """缩略图里人物实际占的矩形（透明背景才算得准）。"""
    image = Image.open(source_path(character)).convert("RGBA")
    return image.getchannel("A").getbbox() or (0, 0, *image.size)

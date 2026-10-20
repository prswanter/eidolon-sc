"""按人物的实际位置裁出脸，拼成对照图，供逐位校对发色、发型、瞳色。

缩略图是透明背景的 PNG，行内位置随人物宽窄而变（侧身、有帽子的会偏），
所以先按 alpha 通道求出人物所在的矩形，再从矩形顶端取头部那一块。
图写到 `.scratch/_faces/`（已在 `.gitignore` 里），不进仓库。

    python face_sheet.py            # 全部 28 位
    python face_sheet.py mamimi yuika
"""

import sys

from PIL import Image, ImageDraw

from thumbnails import REPO, alpha_box, load_characters, thumbnail

OUT = REPO / ".scratch" / "_faces"
CELL = (440, 470)
COLUMNS = 2
ROWS_PER_SHEET = 4


def head(character: dict) -> Image.Image:
    """人物缩略图里头顶往下约四成身高那一块（脸和头发）。"""
    full = thumbnail(character)
    left, top, right, bottom = alpha_box(character)
    width, height = right - left, bottom - top
    pad = int(width * 0.12)
    crop = full.crop(
        (max(left - pad, 0), top, min(right + pad, full.width), top + int(height * 0.42))
    )
    return crop.resize(CELL, Image.LANCZOS)


def main() -> int:
    wanted = set(sys.argv[1:])
    characters = [
        character for character in load_characters() if not wanted or character["id"] in wanted
    ]
    per_sheet = COLUMNS * ROWS_PER_SHEET
    for start in range(0, len(characters), per_sheet):
        chunk = characters[start : start + per_sheet]
        rows = (len(chunk) + COLUMNS - 1) // COLUMNS
        sheet = Image.new("RGB", (COLUMNS * CELL[0], rows * (CELL[1] + 18)), (250, 250, 250))
        draw = ImageDraw.Draw(sheet)
        for index, character in enumerate(chunk):
            column, row = index % COLUMNS, index // COLUMNS
            x, y = column * CELL[0], row * (CELL[1] + 18)
            sheet.paste(head(character), (x, y))
            draw.text((x + 6, y + CELL[1] + 4), character["id"], fill=(20, 20, 20))
        OUT.mkdir(parents=True, exist_ok=True)
        path = OUT / f"faces-{start // per_sheet + 1}.png"
        sheet.save(path)
        print(f"{path}  {sheet.width}x{sheet.height}  {len(chunk)} heads")
    return 0


if __name__ == "__main__":
    sys.exit(main())

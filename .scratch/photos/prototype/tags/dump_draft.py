"""把初稿逐位打出来，供人工一眼过一遍。

    python dump_draft.py
"""

import sys

from thumbnails import load_draft
from verify_draft import appearance_of


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # Windows 控制台默认 GBK，中文会打不出来
    for character in load_draft():
        print(f"{character['id']:9} {character['photo_tag']:20} {' | '.join(appearance_of(character))}")


if __name__ == "__main__":
    main()

"""核对 `draft.json` 里 28 位的角色 tag 是不是某个模型的已知 tag。

票 13 用：`photo_tag` 存 Danbooru 写法（小写、空格代替下划线），不从 `name_romaji` 推。

    python character_tags.py [模型]
"""

import sys

from thumbnails import load_draft
from verify import report


def main() -> int:
    model = sys.argv[1] if len(sys.argv) > 1 else "nai-diffusion-5-curated"
    return report(model, [character["photo_tag"] for character in load_draft()])


if __name__ == "__main__":
    sys.exit(main())

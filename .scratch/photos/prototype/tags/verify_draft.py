"""核对票 13 的初稿（`draft.json`）。

查四件事：
1. 初稿的 id 和 `characters.toml` 一一对应（28 位一个不少，罗马字、默认衣装都对得上）；
2. `photo_tag` 和 `photo_appearance` 的写法合规（小写、空格分隔、无语法字符）；
3. `photo_appearance` 只写发色、发型、瞳色，没混进饰物和服装；
4. 每一条 tag 都是 V5 Curated 词表里的已知 tag（官方 tag 建议接口，一次一条）。

    python verify_draft.py            # 全部核对
    python verify_draft.py --offline  # 只查 1–3，不联网

退出码：0 没有问题；1 有问题。
"""

import re
import sys

from thumbnails import load_characters, load_draft
from verify import known

# 票 13 要求角色 tag 在 V5 Curated 已知；V4.5 Curated 是上一个还在用的模型，两个都核。
MODELS = ("nai-diffusion-5-curated", "nai-diffusion-4-5-curated")

# 外貌 tag 只许这三类：发色/发型/瞳色。其余（饰物、服装、身材）一律算越界。
HAIR = (
    r"(?:black|brown|blonde|grey|silver|white|red|orange|pink|purple|blue|green|aqua"
    r"|light blue|dark blue|light brown) hair"
)
STYLE = (
    r"short hair|medium hair|long hair|twintails|low twintails|ponytail|high ponytail"
    r"|braided ponytail|single braid|side braid|hair over shoulder|hair bun|single side bun"
    r"|double bun|drill hair|ringlets"
    r"|wavy hair|curly hair|gradient hair|streaked hair|two-tone hair|multicolored hair"
    r"|ahoge|swept bangs|blunt bangs|parted bangs|diagonal bangs|hair between eyes|bob cut"
    r"|hime cut|sidelocks|hair intakes"
)
EYES = r"(?:black|brown|grey|red|orange|pink|purple|blue|green|aqua|yellow) eyes"
ALLOWED = re.compile(rf"^(?:{HAIR}|{STYLE}|{EYES})$")
EYE_COLOR = re.compile(rf"^{EYES}$")
TAG = re.compile(r"^[a-z0-9][a-z0-9:' ()-]*$")


def appearance_of(character: dict) -> list[str]:
    """一位角色的外貌 tag，按逗号拆开。"""
    return [tag.strip() for tag in character["photo_appearance"].split(",") if tag.strip()]


def main() -> int:
    offline = "--offline" in sys.argv
    sys.stdout.reconfigure(encoding="utf-8")  # Windows 控制台默认 GBK，符号会打不出来

    configured = {character["id"]: character for character in load_characters()}
    characters = load_draft()
    problems: list[str] = []

    ids = [character["id"] for character in characters]
    if len(ids) != len(set(ids)):
        problems.append("初稿里有重复的 id")
    if set(ids) != set(configured):
        problems.append(f"id 和 characters.toml 对不上：多 {set(ids) - set(configured)}，少 {set(configured) - set(ids)}")

    checked: set[str] = set()
    for character in characters:
        label = character["id"]
        source = configured.get(label)
        if source is None:
            continue
        if character["romaji"].lower() != source["name_romaji"].lower():
            problems.append(f"{label}: 罗马字 {character['romaji']!r} 和配置对不上")
        if character["enza"] != source["default_outfit"].split("/")[1]:
            problems.append(f"{label}: 默认衣装 {character['enza']} 和配置对不上")

        if not TAG.match(character["photo_tag"]):
            problems.append(f"{label}: 角色 tag {character['photo_tag']!r} 写法不合规")

        appearance = appearance_of(character)
        if not appearance:
            problems.append(f"{label}: 外貌 tag 是空的")
        for tag in appearance:
            if not TAG.match(tag):
                problems.append(f"{label}: {tag!r} 写法不合规")
            elif not ALLOWED.match(tag):
                problems.append(f"{label}: {tag!r} 不是发色/发型/瞳色，混进了别的")
        if len([tag for tag in appearance if EYE_COLOR.match(tag)]) != 1:
            problems.append(f"{label}: 瞳色应恰好一条")
        if len(set(appearance)) != len(appearance):
            problems.append(f"{label}: 外貌 tag 有重复")
        checked.add(character["photo_tag"])
        checked.update(appearance)

    if not offline:
        for model in MODELS:
            for tag in sorted(checked):
                if not known(model, tag):
                    problems.append(f"{tag!r} 不是 {model} 的已知 tag")

    if problems:
        print(f"✗ {len(problems)} 处问题")
        for problem in problems:
            print(f"  - {problem}")
        return 1
    mode = "离线核对" if offline else f"含 {len(checked)} 条 tag 在 {'、'.join(MODELS)} 上的联网核对"
    print(f"✓ {len(characters)} 位齐、写法合规、外貌只含发色发型瞳色（{mode}）")
    return 0


if __name__ == "__main__":
    sys.exit(main())

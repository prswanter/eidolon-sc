"""核对一组 tag 是不是某个 NovelAI 模型词表里的已知 tag。

票 13「28 位偶像的照片 tag」用：初稿里每个 tag 都要用官方 tag 建议接口核对过。
接口不需要 token（实测），一次一个 tag，命中要求建议列表里有**完全相同**的 tag。

    python verify.py nai-diffusion-5-curated "brown hair" "twintails" ...

退出码：0 全部命中；1 有没命中的；2 没给参数。
"""

import json
import sys
import urllib.parse
import urllib.request

API = "https://image.novelai.net/ai/generate-image/suggest-tags"


def suggest(model: str, prompt: str) -> list[dict]:
    """模型对这段提示词给出的 tag 建议。"""
    query = urllib.parse.urlencode({"model": model, "prompt": prompt})
    request = urllib.request.Request(f"{API}?{query}", headers={"User-Agent": "curl/8.7.1"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read())["tags"]


def known(model: str, tag: str) -> bool:
    """模型词表里有没有这个 tag（要完全相同，建议列表里相似的不算）。"""
    return any(candidate["tag"] == tag for candidate in suggest(model, tag))


def report(model: str, tags: list[str]) -> int:
    """逐条打印命中情况，返回退出码。"""
    missing = [tag for tag in tags if not known(model, tag)]
    for tag in tags:
        print(f"{'NO ' if tag in missing else 'YES'}  {tag}")
    print(f"\n{len(tags) - len(missing)}/{len(tags)} known on {model}")
    if missing:
        print("not known: " + ", ".join(missing))
    return 1 if missing else 0


def main() -> int:
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return 2
    return report(args[0], args[1:])


if __name__ == "__main__":
    sys.exit(main())

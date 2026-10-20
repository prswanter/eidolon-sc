#!/usr/bin/env python3
"""lip_X 与 lip_X_s 的口型附件对照（调研 03 用）。

对每套衣装：lip_X_s 的唯一口型附件，是否等于 lip_X 第 0 帧的口型附件；lip_X 在几种附件之间切换。
用法：python lip_pairs.py [素材根目录]
"""
import collections
import glob
import json
import re
import sys
from pathlib import Path

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else "E:/Download/others/agent-test/shinycolors-spine")
MOUTH = re.compile(r"mou(th|se)", re.I)


def mouth_keys(anim):
    out = []
    for slot, tl in anim.get("slots", {}).items():
        if MOUTH.search(slot):
            out += [(k["time"], k.get("name")) for k in tl.get("attachment", [])]
    return sorted(out, key=lambda x: x[0])


same = collections.Counter()
tot = collections.Counter()
open_names = collections.Counter()
nshapes = collections.defaultdict(list)
for f in glob.glob(str(ROOT / "assets/spine/idols/stand*/*/data.json")):
    A = json.loads(Path(f).read_text(encoding="utf-8"))["animations"]
    for name, a in A.items():
        m = re.fullmatch(r"(lip_[a-z0-9_]+?)_s(\d*)", name)
        if name.startswith("lip_") and not m:
            ks = mouth_keys(a)
            if ks:
                nshapes[name].append(len({k[1] for k in ks}))
        if not m or m.group(2):
            continue
        base = m.group(1)
        if base not in A:
            continue
        s, b = mouth_keys(a), mouth_keys(A[base])
        if not s or not b:
            continue
        tot[base] += 1
        if s[0][1] == b[0][1]:
            same[base] += 1
        else:
            open_names[s[0][1]] += 1

print("lip_X_s 的附件 == lip_X 第 0 帧附件 的比例：")
for base in sorted(tot, key=lambda k: -tot[k]):
    print(f"- {base}: {same[base]}/{tot[base]} ({same[base]/tot[base]:.0%})")
print("\n不相等时 _s 用的附件名（前 15）：", open_names.most_common(15))
print("\nlip_X（说话）用到的不同口型附件数（中位）：")
for n in sorted(nshapes, key=lambda k: -len(nshapes[k]))[:20]:
    v = sorted(nshapes[n])
    print(f"- {n}: {len(v)} 套，中位 {v[len(v)//2]}")

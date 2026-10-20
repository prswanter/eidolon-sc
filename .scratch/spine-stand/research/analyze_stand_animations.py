#!/usr/bin/env python3
"""统计闪耀色彩 stand / stand_costume Spine 立绘的动画词表（调研 03 用）。

用法：
    python analyze_stand_animations.py [素材根目录] > out.txt
素材根目录默认 E:/Download/others/agent-test/shinycolors-spine（含 spine_manifest.json
与 assets/spine/idols/{stand,stand_costume}/<enzaId>/data.json）。

只读 data.json，不依赖 Spine 运行时。时长 = 该动画所有 timeline 关键帧 time 的最大值
（与 Spine 3.6 SkeletonJson 计算 animation.duration 的方式一致）。
"""
from __future__ import annotations

import collections
import json
import re
import statistics
import sys
from pathlib import Path

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else "E:/Download/others/agent-test/shinycolors-spine")
IDOLS = ROOT / "assets/spine/idols"
FOCUS = {1: "櫻木真乃", 4: "月岡恋鐘"}

# ---- 分类 -----------------------------------------------------------------
PROP_WORDS = r"(on|off|take|relay)$"


def category(name: str) -> str:
    if name == "blank":
        return "blank"
    if name.startswith("lip_"):
        return "lip"
    if name.startswith("face_"):
        return "face"
    if name.startswith("eye_"):
        return "eye"
    if name.startswith("arm_"):
        return "arm"
    if name in ("yes", "yes2", "no", "no2"):
        return "nod"
    if name == "cheek_red" or name.startswith("tear_") or name == "tear":
        return "face_overlay"
    if re.search(r"_(on|off)$", name) or name in ("on", "off") or re.match(r"(on|off)_", name) \
            or name in ("mask_take", "no_bag"):
        return "prop"
    if name.startswith("z0") or name in ("***", "aaa", "CM", "su", "to"):
        return "debug"
    if name.startswith("skill"):
        return "skill"
    return "body"


# ---- 候选情绪 ---------------------------------------------------------------
EMOTIONS = {
    "开心": {"body": ["smile1", "smile2", "smile3", "smile4"],
             "face": ["face_smile", "face_smile1", "face_smile2", "face_smile3", "face_joy"],
             "lip": ["lip_smile", "lip_smile1", "lip_smile2", "lip_joy"]},
    "害羞": {"body": ["shy1", "shy2", "shy3"],
             "face": ["face_shy", "face_shy1", "face_shy2", "face_shy3"],
             "lip": ["lip_shy", "lip_shy2"]},
    "惊讶": {"body": ["surp1", "surp2", "surp3", "surp4"],
             "face": ["face_surp", "face_surp2"],
             "lip": ["lip_surp", "lip_surp2", "lip_a"]},
    "难过": {"body": ["sad1", "sad2", "sad3"],
             "face": ["face_sad", "face_sad1", "face_sad2", "face_cry"],
             "lip": ["lip_sad", "lip_sad2"]},
    "生气": {"body": ["anger1", "anger2", "anger3"],
             "face": ["face_anger", "face_anger1", "face_anger2"],
             "lip": ["lip_anger", "lip_anger1", "lip_anger2", "lip_angry"]},
    "思考": {"body": ["think", "think1", "think2"],
             "face": ["face_serious", "face_close", "face_wait"],
             "lip": ["lip_serious", "lip_wait", "lip_trouble"]},
    "平静": {"body": ["wait", "wait1", "wait2", "wait3", "wait4"],
             "face": ["face_wait"],
             "lip": ["lip_wait", "lip_smile"]},
    "困扰(trouble)": {"body": [], "face": ["face_trouble", "face_sad"], "lip": ["lip_trouble"]},
    "害怕(fear)": {"body": ["fear"], "face": ["face_fear", "face_fear2"], "lip": ["lip_fear"]},
    "白眼/ジト目(jito)": {"body": [], "face": ["face_jito", "face_jito2"], "lip": ["lip_jito"]},
    "含泪(tear)": {"body": [], "face": ["face_tear", "face_tear1", "face_tear2", "face_cry"], "lip": ["lip_tear", "lip_sad"]},
}
SINGLE = ["wait", "wait1", "wait2", "wait3", "wait4", "smile1", "smile2", "smile3", "shy1", "shy2",
          "surp1", "surp2", "sad1", "sad2", "anger1", "anger2", "think", "think1", "think2", "hello", "touch",
          "yes", "no", "eye_front", "eye_left", "eye_right", "face_wait", "face_close", "face_smile",
          "face_smile2", "face_shy", "face_surp", "face_sad", "face_cry", "face_anger", "face_anger2",
          "face_serious", "face_trouble", "face_fear", "face_jito", "face_tear", "cheek_red",
          "lip_wait", "lip_wait_s", "lip_smile", "lip_smile_s", "lip_shy", "lip_shy_s", "lip_surp",
          "lip_surp_s", "lip_sad", "lip_sad_s", "lip_anger", "lip_anger_s", "lip_trouble", "lip_a",
          "lip_serious", "lip_serious_s"]


def keyframe_max(obj) -> float:
    m = 0.0
    stack = [obj]
    while stack:
        o = stack.pop()
        if isinstance(o, dict):
            t = o.get("time")
            if isinstance(t, (int, float)):
                m = max(m, float(t))
            stack.extend(o.values())
        elif isinstance(o, list):
            stack.extend(o)
    return m


def targets(anim: dict) -> set[str]:
    """该动画写入的属性集合，例如 'bone:head:rotate'、'slot:mouth:attachment'、'deform:mouth'、'drawOrder'。"""
    out = set()
    for b, tl in anim.get("bones", {}).items():
        for p in tl:
            out.add(f"bone:{b}:{p}")
    for s, tl in anim.get("slots", {}).items():
        for p in tl:
            out.add(f"slot:{s}:{p}")
    for skin in anim.get("deform", {}).values():
        for s in skin:
            out.add(f"deform:{s}")
    if anim.get("drawOrder") or anim.get("draworder"):
        out.add("drawOrder")
    for k in ("ik", "transform", "paths"):
        for n in anim.get(k, {}):
            out.add(f"{k}:{n}")
    return out


MOUTH = re.compile(r"mou(th|se)|lip", re.I)
EYE = re.compile(r"eye|lid|lash|brow|blink", re.I)


def region(t: str) -> str:
    kind = t.split(":")[0]
    name = t.split(":")[1] if ":" in t else t
    if MOUTH.search(name):
        return "mouth"
    if EYE.search(name):
        return "eye/brow"
    if re.search(r"cheek|face|head|ear|tear|shadow|hoho|nose", name, re.I):
        return "face/head"
    if re.search(r"arm|hand|elbow|snap|finger|fist|shoulder|clavicle", name, re.I):
        return "arm/hand"
    if re.search(r"hair|kazari|ribbon|hat", name, re.I):
        return "hair/acc"
    if kind == "drawOrder":
        return "drawOrder"
    return "body/other"


def main() -> None:
    manifest = json.loads((ROOT / "spine_manifest.json").read_text(encoding="utf-8"))
    meta = {(m["category"], m["enzaId"]): m for m in manifest}
    outfits = []  # (cat, enza, idolId, dressName, dressType, animations dict)
    for cat in ("stand", "stand_costume"):
        for d in sorted((IDOLS / cat).iterdir()):
            f = d / "data.json"
            if not f.exists():
                continue
            j = json.loads(f.read_text(encoding="utf-8"))
            m = meta.get((cat, d.name), {})
            outfits.append((cat, d.name, m.get("idolId"), m.get("dressName", "?"), m.get("dressType", "?"),
                            j.get("skeleton", {}).get("spine"), j["animations"]))
    N = len(outfits)
    print(f"# 共 {N} 套（stand {sum(o[0]=='stand' for o in outfits)}，stand_costume {sum(o[0]=='stand_costume' for o in outfits)}）")
    print("spine 版本:", collections.Counter(o[5] for o in outfits))

    # ---- 名字频次与分类 ----
    count = collections.Counter()
    durs = collections.defaultdict(list)
    loopst = collections.defaultdict(list)
    relay = collections.defaultdict(collections.Counter)
    evnames = collections.Counter()
    tgt_freq = collections.defaultdict(collections.Counter)  # anim -> target -> n
    for o in outfits:
        for name, a in o[6].items():
            count[name] += 1
            durs[name].append(keyframe_max(a))
            for e in a.get("events", []):
                evnames[e["name"]] += 1
                if e["name"] == "loop_start":
                    loopst[name].append(e["time"])
                if e["name"] == "relay":
                    relay[name][e.get("string")] += 1
            for t in targets(a):
                tgt_freq[name][t] += 1
    print("\n## 事件名出现次数", dict(evnames))

    bycat = collections.defaultdict(list)
    for n in count:
        bycat[category(n)].append(n)
    print("\n## 分类（名字数 / 名字）")
    for c, ns in sorted(bycat.items(), key=lambda x: -len(x[1])):
        ns.sort(key=lambda n: -count[n])
        print(f"- **{c}** {len(ns)} 个：" + "、".join(f"`{n}`({count[n]})" for n in ns))

    # ---- 时长 / 循环 ----
    def fmt(xs):
        if not xs:
            return "-"
        return f"{statistics.median(xs):.2f} [{min(xs):.2f}–{max(xs):.2f}]"

    print("\n## 时长与循环结构（全体；中位数 [最小–最大]，秒）")
    print("| 动画 | 套数 | 时长 | 有 loop_start 的套数 | loop_start 时刻 | relay 目标 | 时长=0 的套数 |")
    print("|---|---|---|---|---|---|---|")
    for n in SINGLE + [x for x in ("hello",) if x not in SINGLE]:
        if n not in count:
            continue
        rl = "、".join(f"{k}×{v}" for k, v in relay[n].most_common(3)) or "-"
        z = sum(1 for d in durs[n] if d == 0)
        print(f"| `{n}` | {count[n]} | {fmt(durs[n])} | {len(loopst[n])} | {fmt(loopst[n])} | {rl} | {z} |")

    print("\n## 按分类汇总：有 loop_start 的比例、时长为 0（静态姿势）的比例")
    for c, ns in bycat.items():
        tot = sum(count[n] for n in ns)
        ls = sum(len(loopst[n]) for n in ns)
        z = sum(sum(1 for d in durs[n] if d == 0) for n in ns)
        allds = [d for n in ns for d in durs[n]]
        print(f"- {c}: 实例 {tot}，loop_start {ls} ({ls/tot:.0%})，时长 0 {z} ({z/tot:.0%})，时长中位 {statistics.median(allds):.2f}s")

    # ---- 影响的区域 ----
    print("\n## 各分类写入的部位（每个实例写入该部位的比例）")
    for c in ("body", "face", "eye", "lip", "nod", "arm", "face_overlay"):
        reg = collections.Counter()
        tot = 0
        for o in outfits:
            for n, a in o[6].items():
                if category(n) != c:
                    continue
                tot += 1
                for r in {region(t) for t in targets(a)}:
                    reg[r] += 1
        print(f"- {c}（{tot} 个实例）：" + "，".join(f"{r} {v/tot:.0%}" for r, v in reg.most_common()))

    # ---- 叠加冲突：同一套衣装里，两个动画写入同一属性 ----
    pairs = [("wait", "face_smile"), ("smile1", "face_smile"), ("wait", "face_wait"), ("face_smile", "lip_smile"),
             ("face_wait", "lip_wait"), ("smile1", "lip_smile"), ("wait", "lip_wait"), ("face_wait", "eye_left"),
             ("wait", "eye_left"), ("wait", "yes"), ("smile1", "yes"), ("face_smile", "yes"), ("wait", "cheek_red"),
             ("face_smile", "cheek_red"), ("lip_smile", "lip_smile_s"), ("hello", "yes"), ("think", "eye_left")]
    print("\n## 叠加冲突（两者都存在的衣装中，有共同写入属性的比例；及最常见的共同属性的部位）")
    for x, y in pairs:
        both = conf = 0
        common = collections.Counter()
        for o in outfits:
            A = o[6]
            if x in A and y in A:
                both += 1
                inter = targets(A[x]) & targets(A[y])
                if inter:
                    conf += 1
                    for r in {region(t) for t in inter}:
                        common[r] += 1
        if both:
            print(f"- `{x}` × `{y}`：{conf}/{both} ({conf/both:.0%}) 有重叠；部位 " +
                  ("，".join(f"{r} {v}" for r, v in common.most_common()) or "无"))

    # body 动画是否写入口型、眨眼
    print("\n## body 动画里写入 mouth / eye 的比例（这决定 face/lip 轨道是否必须在 body 之上）")
    for n in ("wait", "wait1", "smile1", "smile2", "shy1", "surp1", "sad1", "anger1", "think", "hello"):
        tot = m = e = 0
        for o in outfits:
            if n in o[6]:
                tot += 1
                regs = {region(t) for t in targets(o[6][n])}
                m += "mouth" in regs
                e += "eye/brow" in regs
        print(f"- `{n}`：{tot} 套，写 mouth {m/tot:.0%}，写 eye/brow {e/tot:.0%}")

    # face 动画里是否含眨眼（时长>0）
    print("\n## face_* 是否自带眨眼（时长>0 视为有眨眼循环）")
    for n in ("face_wait", "face_smile", "face_smile2", "face_shy", "face_surp", "face_sad", "face_anger", "face_close", "face_serious"):
        ds = durs[n]
        print(f"- `{n}`：{len(ds)} 套，时长>0 {sum(d>0 for d in ds)/len(ds):.0%}，时长中位 {statistics.median(ds):.2f}s")

    # ---- 情绪覆盖率 ----
    def cov(sel, names):
        return sum(1 for o in sel if any(n in o[6] for n in names))

    groups = [("全体", outfits)] + [(f"{FOCUS[i]}（idolId {i}）", [o for o in outfits if o[2] == i]) for i in FOCUS]
    print("\n## 情绪覆盖率（每行：该情绪的候选里至少有一个存在的衣装比例）")
    for gname, sel in groups:
        print(f"\n### {gname}：{len(sel)} 套")
        print("| 情绪 | body 候选 | face 候选 | lip 候选 | 三者齐 |")
        print("|---|---|---|---|---|")
        for emo, parts in EMOTIONS.items():
            cells = []
            for k in ("body", "face", "lip"):
                cells.append(f"{cov(sel, parts[k])/len(sel):.0%}" if parts[k] else "-")
            full = sum(1 for o in sel if all(any(n in o[6] for n in parts[k]) for k in ("body", "face", "lip") if parts[k]))
            print(f"| {emo} | " + " | ".join(cells) + f" | {full/len(sel):.0%} |")
        print("\n单个动画覆盖率：")
        print("、".join(f"`{n}` {cov(sel,[n])/len(sel):.0%}" for n in SINGLE))

    # ---- 两位角色逐套列出 ----
    for i, nm in FOCUS.items():
        sel = [o for o in outfits if o[2] == i]
        allnames = collections.Counter(n for o in sel for n in o[6])
        print(f"\n## {nm}：全部动画名（出现套数/{len(sel)}）")
        print("、".join(f"`{n}`{c}" for n, c in sorted(allnames.items(), key=lambda x: (-x[1], x[0]))))
        print(f"\n### {nm}：缺少常用动画的衣装")
        for o in sel:
            miss = [n for n in ("hello", "think", "smile3", "face_smile", "face_smile2", "face_surp", "face_serious",
                                "lip_smile", "lip_wait", "lip_shy", "lip_surp", "lip_a") if n not in o[6]]
            print(f"- {o[0]}/{o[1]} {o[3]} ({o[4]})：缺 " + ("、".join(miss) or "无"))

    # ---- 替代关系：缺 A 时有什么 ----
    print("\n## 缺失时的替代（缺 A 的衣装里，B 存在的比例）")
    subs = {"think": ["think1", "think2", "face_serious", "face_close", "wait4"],
            "hello": ["smile2", "smile1", "wait1"],
            "smile3": ["smile2", "smile1"],
            "face_smile": ["face_smile1", "face_smile2", "face_close"],
            "face_smile2": ["face_smile", "face_smile1"],
            "face_surp": ["face_surp2", "face_wait"],
            "face_cry": ["face_sad", "face_tear"],
            "face_serious": ["face_wait"],
            "face_shy": ["face_shy2", "face_smile"],
            "face_anger": ["face_anger1", "face_anger2"],
            "lip_smile": ["lip_smile1", "lip_smile2", "lip_wait"],
            "lip_wait": ["lip_smile", "lip_a"],
            "lip_shy": ["lip_smile", "lip_wait"],
            "lip_surp": ["lip_surp_s", "lip_a", "lip_wait"],
            "lip_sad": ["lip_sad2", "lip_wait"],
            "lip_anger": ["lip_anger1", "lip_anger2", "lip_angry", "lip_wait"],
            "lip_smile_s": ["lip_smile_s2", "lip_wait_s"],
            "eye_left": ["eye_right", "eye_front"]}
    for a, bs in subs.items():
        miss = [o for o in outfits if a not in o[6]]
        if not miss:
            print(f"- 缺 `{a}`：0 套")
            continue
        s = "，".join(f"`{b}` {sum(b in o[6] for o in miss)/len(miss):.0%}" for b in bs)
        anyb = sum(any(b in o[6] for b in bs) for o in miss)
        print(f"- 缺 `{a}`：{len(miss)} 套；其中 {s}；任一可替代 {anyb}/{len(miss)}")

    # lip 词表：成对情况
    print("\n## lip 成对情况：有 lip_X 的衣装里同时有 lip_X_s 的比例；lip_X 时长/关键帧")
    for base in ("smile", "wait", "shy", "surp", "sad", "anger", "trouble", "serious", "jito", "tear", "bad"):
        x, s = f"lip_{base}", f"lip_{base}_s"
        hx = [o for o in outfits if x in o[6]]
        if not hx:
            continue
        both = sum(s in o[6] for o in hx)
        sd = durs.get(s, [])
        print(f"- `{x}` {len(hx)} 套，同时有 `{s}` {both/len(hx):.0%}；`{x}` 时长 {fmt(durs[x])}；`{s}` 时长 {fmt(sd)}")
    for n in ("lip_a", "lip_a2", "lip_i", "lip_fa", "lip_ha", "lip_fear", "lip_joy", "lip_cry"):
        # 统计口型附件切换次数
        sw = []
        for o in outfits:
            a = o[6].get(n)
            if a:
                k = sum(len(v.get("attachment", [])) for s_, v in a.get("slots", {}).items() if MOUTH.search(s_))
                sw.append(k)
        if sw:
            print(f"- `{n}` {count[n]} 套，时长 {fmt(durs[n])}，mouth 附件关键帧数中位 {statistics.median(sw)}")


if __name__ == "__main__":
    main()

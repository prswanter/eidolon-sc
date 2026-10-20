import { describe, expect, it } from "vitest";

import { cameraAt, FIGURE_HEIGHT, project, type Vec3 } from "./memory";
import { BEATS, EMBEDDING_STAR, LINES, lineShownAt, linesOf, memoryTop, STANDS, STEPS, storyAt, type MemoryStory } from "./memoryStory";
import type { Viewport } from "./scene";

const desktop: Viewport = { w: 1440, h: 900 };
const portrait: Viewport = { w: 390, h: 844 };
const ps = Array.from({ length: 801 }, (_, k) => k / 800);

describe("storyAt: 一件事传开", () => {
  const ALL = [0, 1, 2, 3];
  const at = (p: number, cast: readonly number[] = ALL) => storyAt(p, cameraAt(p, desktop), cast);
  const run = (cast: readonly number[] = ALL) => ps.map((p) => at(p, cast));
  const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const copyTo = (s: MemoryStory, k: number) => s.copies.find((c) => c.to === k);
  const stored = (s: MemoryStory, k: number) => s.stored.some((b) => b.island === k);
  /** 第一个满足条件的进度。 */
  const first = (scenes: MemoryStory[], f: (s: MemoryStory) => boolean) => ps[scenes.findIndex(f)];

  it("节拍照原型的节拍表：在每个节拍的起点进入这一拍，往后不回头", () => {
    BEATS.forEach((b, k) => expect(at(b.at).beat).toBe(k));
    const beats = run().map((s) => s.beat);
    expect(beats).toEqual([...beats].sort((a, b) => a - b));
    expect(beats.at(-1)).toBe(BEATS.length - 1);
  });

  it("手机亮起，消息落到真乃头顶，变成方块，再收进她的柱子", () => {
    const head: Vec3 = [STANDS[0][0], STANDS[0][1] + FIGURE_HEIGHT, STANDS[0][2]];
    expect(at(0.05).message).toBeNull();
    expect(at(0.1).phone).toBe(1);
    expect(at(0.3).phone).toBeLessThan(0.5);
    // 落到她头顶上方，那时还是气泡；她想了想，变成方块。
    const caught = at(0.175).message!;
    expect(dist(caught.position, head)).toBeLessThan(0.6);
    expect(caught.position[1]).toBeGreaterThan(head[1]);
    expect(caught.morph).toBe(0);
    expect(at(0.23).message!.morph).toBe(1);
    // 收进柱子的那一刻消息没了，柱顶有了一块，就在消息最后到的地方。
    const scenes = run();
    const last = scenes.findLastIndex((s) => s.message !== null);
    expect(dist(scenes[last].message!.position, memoryTop(0))).toBeLessThan(0.05);
    expect(stored(scenes[last], 0)).toBe(false);
    expect(stored(scenes[last + 1], 0)).toBe(true);
  });

  it("收进记忆柱的时刻按顺序：真乃、果穗、冬优子、雾子；收进以后柱顶一直有块，往回滚就没了", () => {
    const scenes = run();
    const times = ALL.map((k) => first(scenes, (s) => stored(s, k)));
    expect(times[0]).toBeLessThan(times[1]);
    expect(times[1]).toBeLessThan(times[2]);
    expect(times[2]).toBeLessThan(times[3]);
    for (const k of ALL) scenes.forEach((s, i) => expect(stored(s, k), `第 ${k} 座岛，p ${ps[i]}`).toBe(ps[i] >= times[k]));
    // 柱顶的那块收进时闪一下，然后静下来。
    const flash = (p: number, k: number) => at(p).stored.find((b) => b.island === k)?.flash ?? 0;
    expect(flash(times[1] + 0.02, 1)).toBeGreaterThan(0.5);
    expect(flash(1, 1)).toBe(0);
  });

  it("副本从真乃的柱子走到果穗的，再从果穗的走到冬优子和雾子的；沿路线连续地走，不跳", () => {
    const scenes = run();
    for (const [from, to] of [[0, 1], [1, 2], [1, 3]]) {
      const shown = scenes.flatMap((s, i) => (copyTo(s, to) ? [i] : []));
      expect(shown.length, `给第 ${to} 座岛的那份`).toBeGreaterThan(10);
      // 一段连着出现，不闪。
      expect(shown.at(-1)! - shown[0]).toBe(shown.length - 1);
      expect(dist(copyTo(scenes[shown[0]], to)!.position, memoryTop(from))).toBeLessThan(0.05);
      expect(dist(copyTo(scenes[shown.at(-1)!], to)!.position, memoryTop(to))).toBeLessThan(0.15);
      // 出发时出发的那位已经收进了，到了就收进她的柱子、这份不见了。
      expect(stored(scenes[shown[0]], from)).toBe(true);
      expect(stored(scenes[shown.at(-1)! + 1], to)).toBe(true);
      expect(copyTo(scenes[shown.at(-1)! + 1], to)).toBeUndefined();
      for (let n = 1; n < shown.length; n++) {
        const step = dist(copyTo(scenes[shown[n - 1]], to)!.position, copyTo(scenes[shown[n]], to)!.position);
        expect(step, `给第 ${to} 座岛的那份，p ${ps[shown[n]]}`).toBeLessThan(0.3);
      }
    }
  });

  it("转台在副本上桥之前已经接上，副本走过的桥面亮起来、之后一直亮着", () => {
    expect(at(0.3).turntable).toBeCloseTo(Math.PI / 2, 9);
    const scenes = run();
    scenes.forEach((s, i) => {
      if (copyTo(s, 1)) expect(s.turntable, `p ${ps[i]}`).toBe(0);
    });
    const turns = scenes.map((s) => s.turntable);
    expect(turns).toEqual([...turns].sort((a, b) => b - a));
    // 桥面一块块亮：副本走到哪亮到哪。
    const lit = (k: number) => scenes.map((s) => s.bridge[k]);
    for (const k of [0, 1]) {
      expect(lit(k)).toEqual([...lit(k)].sort((a, b) => a - b));
      expect(lit(k)[0]).toBe(0);
      expect(lit(k).at(-1)).toBe(1);
    }
    expect(first(scenes, (s) => s.bridge[0] > 0.5)).toBeLessThan(first(scenes, (s) => s.bridge[1] > 0.5));
    expect(first(scenes, (s) => s.bridge[0] > 0)).toBeGreaterThanOrEqual(first(scenes, (s) => !!copyTo(s, 1)));
  });

  it("转台转动的时候，旁边一闪而过「temperature 0.7」：转之前看不见，桥接上以后很快淡掉", () => {
    const scenes = run();
    const shown = scenes.map((s) => s.temperature);
    // 只闪一回：显出来的进度连成一段。
    const on = shown.flatMap((t, i) => (t > 0 ? [i] : []));
    expect(on.at(-1)! - on[0] + 1).toBe(on.length);
    scenes.forEach((s, i) => {
      if (s.turntable > 0.01 && s.turntable < Math.PI / 2 - 0.01) expect(s.temperature, `p ${ps[i]}`).toBeGreaterThan(0.9);
    });
    expect(at(0.29).temperature).toBe(0);
    expect(at(0.47).temperature).toBe(0);
  });

  it("真乃收进记忆柱时，embedding 星图上亮起一颗她颜色的点，之后一直亮着，往回滚就灭了", () => {
    const scenes = run();
    const stars = scenes.map((s) => s.embedding);
    expect(stars).toEqual([...stars].sort((a, b) => a - b));
    expect(at(0.25).embedding).toBe(0);
    expect(at(1).embedding).toBe(1);
    // 收进柱子的那一刻前后亮起来。
    const lit = first(scenes, (s) => s.embedding > 0.5);
    expect(Math.abs(lit - first(scenes, (s) => stored(s, 0)))).toBeLessThan(0.02);
  });

  it("星图上她那颗点看得到：镜头拉远去看桥的那段（电脑）和最后的全景（电脑、竖屏）里都在画面里", () => {
    const inside = (p: number, vp: Viewport) => {
      const [x, y] = project(cameraAt(p, vp), vp, EMBEDDING_STAR);
      return x > vp.w * 0.05 && x < vp.w * 0.95 && y > vp.h * 0.05 && y < vp.h * 0.95;
    };
    for (const p of ps.filter((p) => p >= 0.38 && p <= 0.45)) expect(inside(p, desktop), `p ${p}`).toBe(true);
    for (const p of ps.filter((p) => p >= 0.93)) {
      expect(inside(p, desktop), `p ${p}`).toBe(true);
      expect(inside(p, portrait), `竖屏 p ${p}`).toBe(true);
    }
  });

  it("台阶一级级升起来，在副本下台阶之前已经升好；副本走过的台阶亮起来", () => {
    const scenes = run();
    expect(at(0.6).steps.every((s) => s.rise === 0)).toBe(true);
    for (const [stair, to] of [[0, 2], [1, 3]]) {
      const mine = STEPS.flatMap((s, i) => (s.stair === stair ? [i] : []));
      expect(mine).toHaveLength(4);
      // 一级比一级晚升起来。
      const risen = mine.map((i) => first(scenes, (s) => s.steps[i].rise > 0));
      expect(risen).toEqual([...risen].sort((a, b) => a - b));
      expect(new Set(risen).size).toBe(4);
      scenes.forEach((s, n) => {
        if (copyTo(s, to)) for (const i of mine) expect(s.steps[i].rise, `p ${ps[n]}`).toBe(1);
      });
      const lit = mine.map((i) => first(scenes, (s) => s.steps[i].lit > 0.5));
      expect(lit).toEqual([...lit].sort((a, b) => a - b));
      for (const i of mine) expect(at(1).steps[i].lit).toBe(1);
    }
  });

  it("收到时一跳，真乃接住时往后仰，传话时转向对方，平时朝着镜头", () => {
    const pose = (p: number, k: number) => at(p).figures.find((f) => f.island === k)!;
    const facing = (from: number, to: number) => Math.atan2(STANDS[to][0] - STANDS[from][0], STANDS[to][2] - STANDS[from][2]);
    const same = (a: number, b: number) => expect(Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))).toBeLessThan(1e-6);
    for (const k of ALL) {
      same(pose(0, k).yaw, cameraAt(0, desktop).azimuth);
      expect(pose(0, k).hop).toBe(0);
      expect(pose(0, k).reach).toBe(0);
    }
    expect(pose(0.18, 0).reach).toBe(1);
    expect(pose(0.18, 1).reach).toBe(0);
    const scenes = run();
    for (const k of [1, 2, 3]) {
      const arrive = first(scenes, (s) => stored(s, k));
      const hops = scenes.map((s) => s.figures.find((f) => f.island === k)!.hop);
      expect(Math.max(...hops.filter((_, i) => Math.abs(ps[i] - arrive) < 0.04))).toBeGreaterThan(0.8);
      expect(hops.filter((_, i) => Math.abs(ps[i] - arrive) > 0.06).every((h) => h === 0)).toBe(true);
    }
    // 真乃把它传给果穗时朝着果穗，冬优子、雾子收到时朝着果穗。
    same(pose(0.48, 0).yaw, facing(0, 1));
    same(pose(0.8, 2).yaw, facing(2, 1));
    same(pose(0.8, 3).yaw, facing(3, 1));
  });

  it("全景里几根光线把四根柱顶连起来", () => {
    expect(at(0.8).threads.every((t) => t.opacity === 0)).toBe(true);
    const end = at(1);
    expect(end.threads.length).toBeGreaterThanOrEqual(3);
    expect(end.threads.every((t) => t.opacity > 0.5)).toBe(true);
    // 每一位都连着。
    for (const k of ALL) expect(end.threads.some((t) => t.from === k || t.to === k)).toBe(true);
  });

  it("演员缺一位时，传给她的那一份、她收进柱子、她的动作和连到她的线都不出现，其他照常", () => {
    const full = run();
    run([0, 1, 3]).forEach((s, i) => {
      expect(copyTo(s, 2)).toBeUndefined();
      expect(stored(s, 2)).toBe(false);
      expect(s.figures.some((f) => f.island === 2)).toBe(false);
      expect(s.threads.some((t) => t.from === 2 || t.to === 2)).toBe(false);
      expect(s.copies).toEqual(full[i].copies.filter((c) => c.to !== 2));
      expect(s.stored).toEqual(full[i].stored.filter((b) => b.island !== 2));
      // 果穗传话时朝着在场的那一位（两位都在时朝着两人中间），别的动作照常。
      expect(s.figures.filter((f) => f.island !== 1)).toEqual(full[i].figures.filter((f) => f.island !== 1 && f.island !== 2));
      expect(s.message).toEqual(full[i].message);
      // 台阶照样升起；往她那里去的那段没人走过，不亮。
      s.steps.forEach((step, n) => expect(step).toEqual(STEPS[n].stair === 0 ? { ...full[i].steps[n], lit: 0 } : full[i].steps[n]));
    });
  });

  it("真乃不在时只剩场景：没有消息、副本、柱顶的块和连线，手机不亮", () => {
    run([1, 2, 3]).forEach((s) => {
      expect(s.message).toBeNull();
      expect(s.copies).toEqual([]);
      expect(s.stored).toEqual([]);
      expect(s.threads).toEqual([]);
      expect(s.phone).toBe(0);
      expect(s.embedding).toBe(0);
      expect(s.bridge.every((b) => b === 0)).toBe(true);
      expect(s.figures.map((f) => f.island)).toEqual([1, 2, 3]);
      expect(s.figures.every((f) => f.hop === 0 && f.reach === 0)).toBe(true);
    });
  });
});

describe("storyAt: 几个人说的话", () => {
  const ALL = [0, 1, 2, 3];
  const at = (p: number, cast: readonly number[] = ALL, vp: Viewport = desktop) => storyAt(p, cameraAt(p, vp), cast);
  const line = (s: MemoryStory, key: string) => s.lines.find((l) => l.key === key);
  const shown = (p: number, key: string, cast: readonly number[] = ALL) => line(at(p, cast), key)?.opacity ?? 0;
  const stored = (s: MemoryStory, k: number) => s.stored.some((b) => b.island === k);

  it("按出现的顺序排：制作人的一句，真乃想了想、说她记住了，果穗想起来、说起来，冬优子和雾子也是", () => {
    expect(LINES.map((l) => l.key)).toEqual([
      "producer-0",
      "thinking-0",
      "said-0",
      "recalled-1",
      "said-1",
      "recalled-2",
      "recalled-3",
      "said-2",
      "said-3",
    ]);
    const starts = LINES.map((l) => l.show[0]);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it("每句话只在它那一段里显出来：之前之后都看不见，中间完全显出来", () => {
    for (const l of LINES) {
      for (const p of ps) {
        const o = shown(p, l.key);
        if (p <= l.show[0] || p >= l.show[1]) expect(o, `${l.key}，p ${p}`).toBe(0);
        else expect(o, `${l.key}，p ${p}`).toBeGreaterThan(0);
      }
      expect(shown(lineShownAt(l.key), l.key)).toBe(1);
    }
  });

  it("跟着那件事走：制作人那句跟着消息落下来；她想了想才说；收到的人收进柱子以后才想起、想起以后才说", () => {
    for (const p of ps) {
      const s = at(p);
      const on = (key: string) => (line(s, key)?.opacity ?? 0) > 0;
      if (on("producer-0")) {
        expect(s.message, `p ${p}`).not.toBeNull();
        const [x, y, z] = s.message!.position;
        const anchor = line(s, "producer-0")!.anchor;
        expect(anchor[0]).toBe(x);
        expect(anchor[2]).toBe(z);
        expect(anchor[1]).toBeGreaterThan(y);
      }
      // 同一个头顶上，「思考中」和她的话不同时出现；说「我记住了」时消息已经变成了方块。
      expect(on("thinking-0") && on("said-0"), `p ${p}`).toBe(false);
      if (on("said-0")) expect(s.message === null || s.message.morph === 1, `p ${p}`).toBe(true);
      for (const k of [1, 2, 3]) {
        if (on(`recalled-${k}`)) expect(stored(s, k), `第 ${k} 座岛，p ${p}`).toBe(true);
        if (on(`said-${k}`)) expect(p, `第 ${k} 座岛`).toBeGreaterThan(LINES.find((l) => l.key === `recalled-${k}`)!.show[0]);
      }
    }
  });

  it("她的话、「思考中」在她头顶上方，「想起」标签在她的记忆柱顶上", () => {
    for (const l of LINES) {
      const anchor = line(at(lineShownAt(l.key)), l.key)!.anchor;
      if (l.kind === "said" || l.kind === "thinking") {
        const [x, y, z] = STANDS[l.island];
        expect(anchor[0]).toBe(x);
        expect(anchor[2]).toBe(z);
        expect(anchor[1]).toBeGreaterThan(y + FIGURE_HEIGHT);
      }
      if (l.kind === "recalled") {
        const [x, y, z] = memoryTop(l.island);
        expect(anchor[0]).toBe(x);
        expect(anchor[2]).toBe(z);
        expect(anchor[1]).toBeGreaterThan(y);
      }
    }
  });

  it("显出来的那段里，锚点投影到画面上都在画面里，离边缘有余量，不压着幕名轨（电脑、竖屏）", () => {
    // 幕名轨的宽度（landing.css 的 --lp-rail）：窄屏 36px。气泡在锚点上方，上边多留一个气泡的高度。
    for (const [vp, rail] of [[desktop, 72], [portrait, 36]] as const) {
      const side = vp.w * 0.04;
      for (const p of ps) {
        const cam = cameraAt(p, vp);
        for (const l of storyAt(p, cam, ALL).lines) {
          if (l.opacity === 0) continue;
          const [x, y] = project(cam, vp, l.anchor);
          const where = `${vp.w}×${vp.h}，${l.key}，p ${p}`;
          expect(x, where).toBeGreaterThan(rail + side);
          expect(x, where).toBeLessThan(vp.w - side);
          expect(y, where).toBeGreaterThan(vp.h * 0.12);
          expect(y, where).toBeLessThan(vp.h * 0.9);
        }
      }
    }
  });

  it("最后一句在全景里淡入，一直留到最后", () => {
    expect(at(0.86).closing).toBe(0);
    expect(at(1).closing).toBe(1);
    const closing = ps.map((p) => at(p).closing);
    expect(closing).toEqual([...closing].sort((a, b) => a - b));
    expect(at(lineShownAt("closing")).closing).toBe(1);
    expect(ps.filter((p) => at(p).closing > 0).every((p) => p >= BEATS.at(-1)!.at)).toBe(true);
  });

  it("演员缺一位时，她的「想起」标签和台词不出现，其他照常", () => {
    for (const p of ps) expect(at(p, [0, 1, 3]).lines).toEqual(at(p).lines.filter((l) => !l.key.endsWith("-2")));
  });

  it("真乃不在时一句话都没有", () => {
    expect(linesOf([1, 2, 3])).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import { copy } from "@/i18n";

import { idolColors } from "./color";
import { stillPhoneVars } from "./phone";
import { describeScene, TALK_LINES, talkLineShown, type Scene, type SceneInput, type Viewport } from "./scene";
import { lightsOf, prepareSpectrum, type RosterEntry } from "./spectrum";
import { restAt, spanOf, timelineOf } from "./timeline";

const ROSTER: [name: string, color: string, unit: number][] = [
  ["真乃", "#ffbad6", 0],
  ["灯織", "#144384", 0],
  ["めぐる", "#ffe012", 0],
  ["恋鐘", "#f84cad", 1],
  ["咲耶", "#006047", 1],
  ["果穂", "#e5461c", 2],
  ["樹里", "#ffc602", 2],
  ["透", "#50d0d0", 3],
  ["小糸", "#7967c3", 3],
];
const characters: RosterEntry[] = ROSTER.map(([name, color, unit], i) => ({
  id: name,
  name,
  color,
  idol_id: i + 1,
  unit: `unit ${unit}`,
  unit_order: unit,
}));
const lights = lightsOf(prepareSpectrum(characters));
const tl = timelineOf(4);
const act2 = spanOf(tl, 2)!;
const act3 = spanOf(tl, 3)!;
const act4 = spanOf(tl, 4)!;
const act5 = spanOf(tl, 5)!;
const desktop: Viewport = { w: 1440, h: 900 };
const phone: Viewport = { w: 390, h: 844 };

function scene(input: Partial<SceneInput> = {}): Scene {
  return describeScene({ lights, scroll: act3.from, viewport: desktop, tier: "full", ...input });
}
const in3 = (p: number) => act3.from + p * act3.length;
const in4 = (p: number) => act4.from + p * act4.length;
const ps = Array.from({ length: 401 }, (_, k) => k / 400);
const bandOf = (s: Scene, id: string) => s.bands.find((b) => b.id === id)!;
const lit = (s: Scene) => s.bands.filter((b) => b.intensity > 0.5).length;

describe("describeScene: 第 2 幕到第 3 幕", () => {
  it("光谱解开钉住的那一屏里，一道道光连续地变成第 3 幕开头的样子", () => {
    const before = scene({ scroll: act3.from - 1e-9 });
    const start = scene({ scroll: act3.from });
    start.bands.forEach((b, i) => {
      expect(b.x).toBeCloseTo(before.bands[i].x, 3);
      expect(b.intensity).toBeCloseTo(before.bands[i].intensity, 3);
    });
    for (let q = 0; q <= 1; q += 0.01) {
      const a = scene({ scroll: act2.to - 1 + q });
      const b = scene({ scroll: act2.to - 1 + q + 0.0002 });
      a.bands.forEach((band, i) => expect(Math.abs(b.bands[i].x - band.x)).toBeLessThan(desktop.w * 0.01));
    }
  });
});

describe("describeScene: 第 3 幕，她说日语", () => {
  it("一道道光收成她一道：说话的是光谱里的第一位，也可以指定是谁", () => {
    const s = scene({ scroll: in3(0.5) });
    expect(s.act).toBe(3);
    expect(bandOf(s, "真乃").intensity).toBeGreaterThan(0.5);
    expect(s.bands.filter((b) => b.id !== "真乃").every((b) => b.intensity === 0)).toBe(true);
    const other = scene({ scroll: in3(0.5), speaker: "咲耶" });
    expect(bandOf(other, "咲耶").intensity).toBeGreaterThan(0.5);
    expect(bandOf(other, "真乃").intensity).toBe(0);
    // 指定的人不在名单里时，仍是第一位。
    expect(bandOf(scene({ scroll: in3(0.5), speaker: "不在名单里" }), "真乃").intensity).toBeGreaterThan(0.5);
  });

  it("她那道光竖着站在画面右边，给左边竖排的原文和底下的字幕留出地方", () => {
    for (const viewport of [desktop, phone]) {
      const b = bandOf(describeScene({ lights, scroll: in3(0.5), viewport, tier: "full" }), "真乃");
      expect(b.dx).toBe(0);
      expect(b.dy).toBe(1);
      expect(b.x).toBeGreaterThan(viewport.w * 0.6);
      expect(b.x).toBeLessThan(viewport.w * 0.95);
    }
  });

  it("原文一列一列出来，出来了就留着；字幕一句一句被光扫出来，扫完是 1", () => {
    const at = (p: number) => scene({ scroll: in3(p) }).talk!;
    expect(at(0).lines).toHaveLength(TALK_LINES);
    expect(at(0).lines.every((l) => l.ja === 0 && l.sweep === 0)).toBe(true);
    const end = at(1);
    expect(end.lines.every((l) => l.ja === 1 && l.sweep === 1)).toBe(true);
    for (let k = 0; k < TALK_LINES; k++) {
      // 第 k 列先出来，第 k + 1 列才出来；字幕的扫光一路往前，不回头，也不跳。
      const appear = (j: number) => ps.find((p) => at(p).lines[j].ja > 0.5)!;
      if (k > 0) expect(appear(k)).toBeGreaterThan(appear(k - 1));
      let last = 0;
      for (const p of ps) {
        const sweep = at(p).lines[k].sweep;
        expect(sweep).toBeGreaterThanOrEqual(last);
        expect(sweep - last).toBeLessThan(0.08);
        last = sweep;
      }
    }
  });

  it("同一时刻只看得到一句字幕：下一句扫出来时，上一句收掉；最后一句留到最后", () => {
    for (const p of ps) {
      const shown = scene({ scroll: in3(p) }).talk!.lines.filter((l) => l.subtitle > 0.5);
      expect(shown.length).toBeLessThanOrEqual(1);
    }
    expect(scene({ scroll: in3(1) }).talk!.lines.at(-1)!.subtitle).toBe(1);
  });

  it("落地页文案里正好有这么多句台词", () => {
    expect(copy.landing.act3.lines).toHaveLength(TALK_LINES);
  });

  it("每一句都有一个完整显示的时刻：原文在，字幕扫完了、看得见（页内查找找到它时滚到这里）", () => {
    for (let k = 0; k < TALK_LINES; k++) {
      const line = scene({ scroll: in3(talkLineShown(k)) }).talk!.lines[k];
      expect(line, `第 ${k + 1} 句`).toEqual({ ja: 1, sweep: 1, subtitle: 1 });
    }
  });

  it("这一幕没有色散，同屏满强度的光只有她一道", () => {
    for (const p of ps) {
      const s = scene({ scroll: in3(p), speed: 3 });
      expect(lit(s)).toBeLessThanOrEqual(1);
      if (p > 0.2) expect(s.dispersion).toBe(0);
    }
  });

  it("减少动态效果档（静态档同是静止版式）：原文和字幕一开始就完整显示，几句字幕都在", () => {
    const s = scene({ scroll: in3(0), tier: "reduced" });
    expect(s.talk!.lines.every((l) => l.ja === 1 && l.sweep === 1 && l.subtitle === 1)).toBe(true);
    expect(s.text.act3).toBe(1);
  });

  it("别的幕里没有这一幕的东西", () => {
    expect(scene({ scroll: act2.from + 1 }).talk).toBeNull();
    expect(scene({ scroll: act5.from + 0.5 }).talk).toBeNull();
  });
});

describe("describeScene: 第 4 幕，来电", () => {
  const deep = idolColors("#ffbad6").deep;
  /** 一段时间里光脉冲的最大值和最小值。 */
  const range = (input: Partial<SceneInput>) => {
    const pulses = Array.from({ length: 300 }, (_, k) => scene({ scroll: in4(0.85), time: k * 0.02, ...input }).call!.pulse);
    return [Math.min(...pulses), Math.max(...pulses)];
  };

  it("背景过渡到她的极深底色，她那道光挪到画面中间（手机的位置）", () => {
    const s = scene({ scroll: in4(0.5), time: 1.9 });
    expect(s.act).toBe(4);
    expect(s.background).toBe(deep);
    const b = bandOf(s, "真乃");
    expect(b.x).toBeCloseTo(desktop.w * 0.5, 0);
    expect(s.bands.filter((x) => x.id !== "真乃").every((x) => x.intensity === 0)).toBe(true);
  });

  it("她的光收窄成一条竖线，正好是侧着的手机的侧边：同一个位置、一样长、差不多一样宽；然后熄掉，交给手机", () => {
    const at = (p: number) => scene({ scroll: in4(p) });
    // 光和手机都看得见的那一刻：交接。
    const p = ps.find((x) => at(x).phone!.opacity > 0.05 && bandOf(at(x), "真乃").intensity > 0.05)!;
    expect(p).toBeDefined();
    const s = at(p);
    const b = bandOf(s, "真乃");
    const ph = s.phone!;
    expect(ph.yaw).toBeCloseTo(Math.PI / 2, 6);
    expect([b.dx, b.dy]).toEqual([0, 1]);
    expect(b.x).toBeCloseTo(ph.x, 1);
    // 光芯从起点亮到 0.8 倍长度处（light.ts 在最后两成淡出），正好是机身的上下沿。
    expect(b.y).toBeCloseTo(ph.y - ph.height / 2, 1);
    expect(b.y + 0.8 * b.length).toBeCloseTo(ph.y + ph.height / 2, 1);
    expect(b.start).toBeLessThanOrEqual(-90);
    // 侧边多宽（8.8 mm），光芯的半宽就是它的一半左右；光晕收得比第 3 幕窄得多。
    const side = (ph.height * 8.8) / 150;
    expect(b.core).toBeGreaterThan(side * 0.3);
    expect(b.core).toBeLessThan(side * 0.7);
    expect(b.halo).toBeLessThan(bandOf(scene({ scroll: in3(1) }), "真乃").halo / 2);
    // 交接之前只有光，之后只有手机；手机在屏幕亮起以前一直在，光不再回来。
    expect(at(0.1).phone!.opacity).toBe(0);
    expect(bandOf(at(0.1), "真乃").intensity).toBeGreaterThan(0.4);
    for (const q of ps.filter((x) => x >= 0.2 && x < 1)) {
      expect(at(q).bands.every((band) => band.intensity === 0), `p ${q}`).toBe(true);
      expect(at(q).phone!.opacity).toBe(1);
    }
  });

  it("响铃：屏幕亮起以后一阵一阵地响，响的时候手机振动、背景跟着亮，停的时候不动", () => {
    const frames = Array.from({ length: 300 }, (_, k) => scene({ scroll: in4(0.85), time: k * 0.02 }));
    const pulses = frames.map((s) => s.call!.pulse);
    expect(Math.min(...pulses)).toBeLessThan(0.05);
    expect(Math.max(...pulses)).toBeGreaterThan(0.9);
    const size = (s: Scene) => Math.hypot(s.phone!.shake.x, s.phone!.shake.y);
    for (const [k, s] of frames.entries()) {
      if (s.call!.pulse < 0.01) expect(size(s), `第 ${k} 帧`).toBeLessThan(0.05);
      expect(size(s), `第 ${k} 帧`).toBeLessThanOrEqual(4);
    }
    const loud = frames.find((s) => s.call!.pulse > 0.9)!;
    const quiet = frames.find((s) => s.call!.pulse === 0)!;
    expect(size(loud)).toBeGreaterThan(0);
    expect(loud.background).not.toBe(quiet.background);
    // 手机还在转、屏幕还没亮的时候不响。
    for (const p of ps.filter((x) => x < 0.64)) {
      for (const time of [0.25, 0.9]) {
        const s = scene({ scroll: in4(p), time });
        expect(s.call!.pulse, `p ${p}`).toBe(0);
        expect(size(s), `p ${p}`).toBe(0);
      }
    }
  });

  it("只在响铃时响：接通、通话结束以后不响、不振动", () => {
    // 接通和通话结束在模型里是同一条路（不在响铃），用通话结束来测。
    const [low, high] = range({ call: "ended" });
    expect(high).toBe(0);
    expect(low).toBe(0);
    for (const time of [0.2, 0.25, 0.9]) expect(scene({ scroll: in4(0.85), time, call: "ended" }).phone!.shake).toEqual({ x: 0, y: 0 });
  });

  it("减少动态效果档（静态档同是静止版式）：手机一开始就是正面、亮屏，不振动，光脉冲定格", () => {
    const at = (time: number) => scene({ scroll: in4(0), tier: "reduced", time });
    expect(at(0).call).toEqual(at(0.3).call);
    expect(at(0).call!.pulse).toBeGreaterThan(0);
    for (const time of [0, 0.25, 0.9]) {
      const ph = at(time).phone!;
      expect(ph.shake).toEqual({ x: 0, y: 0 });
      expect(ph.yaw).toBeCloseTo(2 * Math.PI, 6);
      expect(ph.screen).toBe(1);
      expect(ph.opacity).toBe(1);
    }
    expect(scene({ scroll: in4(0), tier: "static" }).phone!.screen).toBe(1);
  });

  it("同屏满强度的光只有她一道；没有色散", () => {
    for (const p of ps) {
      const s = scene({ scroll: in4(p), time: p * 7, speed: 3 });
      expect(lit(s)).toBeLessThanOrEqual(1);
      expect(s.dispersion).toBe(0);
    }
  });

  it("第 3 幕到第 4 幕：她的光连续地挪到中间，第 3 幕的字退出去，来电的画面显出来", () => {
    for (let q = 0; q <= 1; q += 0.005) {
      const a = bandOf(scene({ scroll: act4.from - 0.05 + q * 0.3 }), "真乃");
      const b = bandOf(scene({ scroll: act4.from - 0.05 + q * 0.3 + 0.0005 }), "真乃");
      expect(Math.abs(b.x - a.x)).toBeLessThan(desktop.w * 0.01);
    }
    expect(scene({ scroll: in3(0.99) }).text.act3).toBe(1);
    expect(scene({ scroll: in4(0.5) }).text.act3).toBe(0);
    expect(scene({ scroll: in4(0) }).text.act4).toBe(0);
    expect(scene({ scroll: in4(0.5) }).text.act4).toBe(0);
    expect(scene({ scroll: in4(0.8) }).text.act4).toBe(1);
  });
});

describe("describeScene: 第 4 幕的手机", () => {
  const rest = (viewport: Viewport) => describeScene({ lights, scroll: restAt(tl, 4)!, viewport, tier: "full" }).phone!;

  it("停稳以后手机在画面正中，屏幕矩形居中、比例和圆角是这台手机的，上方给标题、下方给正文留出位置（电脑、竖屏）", () => {
    for (const viewport of [desktop, phone, { w: 1280, h: 640 }]) {
      const { rect, bounds } = rest(viewport);
      expect(rect.x).toBeCloseTo(viewport.w / 2, 3);
      expect(rect.y).toBeCloseTo(viewport.h / 2, 3);
      // 屏幕 66.8 × 144.9 mm、圆角 11.7 mm；机身 73.1 × 150 mm。
      expect(rect.w / rect.h).toBeCloseTo(66.8 / 144.9, 3);
      expect(rect.r / rect.h).toBeCloseTo(11.7 / 144.9, 3);
      expect((bounds.bottom - bounds.top) / rect.h).toBeCloseTo(150 / 144.9, 3);
      expect((bounds.right - bounds.left) / (bounds.bottom - bounds.top)).toBeCloseTo(73.1 / 150, 3);
      // 标题、正文各留出至少 15% 的画面高度；机身左右不出画面。
      expect(bounds.top).toBeGreaterThanOrEqual(viewport.h * 0.15);
      expect(viewport.h - bounds.bottom).toBeGreaterThanOrEqual(viewport.h * 0.15);
      expect(bounds.left).toBeGreaterThan(0);
      expect(bounds.right).toBeLessThan(viewport.w);
    }
    // 竖屏上整体缩小：屏幕占的画面高度比电脑上小。
    expect(rest(phone).rect.h / phone.h).toBeLessThan(rest(desktop).rect.h / desktop.h);
  });

  it("静止版式里 CSS 按 stillPhoneVars 摆的手机和屏幕，和停稳时在同一处、一样大（电脑、竖屏）", () => {
    const vars = stillPhoneVars();
    /** `min(Acqh, Bcqw)` 在一块 vp 大小的容器里是多少像素。 */
    const length = (css: string, vp: Viewport) => {
      const [, a, b] = /^min\(([\d.]+)cqh, ([\d.]+)cqw\)$/.exec(css)!;
      return Math.min((Number(a) / 100) * vp.h, (Number(b) / 100) * vp.w);
    };
    for (const viewport of [desktop, phone, { w: 1280, h: 640 }, { w: 820, h: 1180 }]) {
      // 竖屏是 landing.css 的 (max-aspect-ratio: 10/11)。
      const portrait = viewport.w / viewport.h < 10 / 11;
      const height = length(vars[portrait ? "--lp-rest-h-portrait" : "--lp-rest-h"], viewport);
      const { rect, bounds } = rest(viewport);
      expect(height, `${viewport.w}×${viewport.h}`).toBeCloseTo(bounds.bottom - bounds.top, 3);
      expect(height * Number(vars["--lp-screen-wk"])).toBeCloseTo(rect.w, 3);
      expect(height * Number(vars["--lp-screen-hk"])).toBeCloseTo(rect.h, 3);
      expect(height * Number(vars["--lp-screen-rk"])).toBeCloseTo(rect.r, 3);
      expect(height * Number(vars["--lp-body-wk"])).toBeCloseTo(bounds.right - bounds.left, 3);
    }
    // 手机图四周比机身多留的边：机身高度的几个百分点，装得下转身时透视多出来的那一点。
    expect(Number(vars["--lp-still-margin"])).toBeGreaterThan(0);
    expect(Number(vars["--lp-still-margin"])).toBeLessThan(0.1);
  });

  it("随进度依次是侧面、背面（停一会儿）、正面；往回滚就倒着转；转到正面以后屏幕才亮", () => {
    const at = (p: number) => scene({ scroll: in4(p), time: 0.3 }).phone!;
    const first = (ok: (s: ReturnType<typeof at>) => boolean) => ps.find((p) => ok(at(p)))!;
    // 手机出现时是侧面。
    expect(at(first((s) => s.opacity > 0.5)).yaw).toBeCloseTo(Math.PI / 2, 1);
    // 转角跟着进度只增不减、不跳：往回滚时一步步倒着转回去。
    let last = at(0).yaw;
    for (const p of ps) {
      const { yaw } = at(p);
      expect(yaw).toBeGreaterThanOrEqual(last);
      expect(yaw - last).toBeLessThan(0.2);
      last = yaw;
    }
    const back = first((s) => Math.abs(s.yaw - Math.PI) < 0.05);
    const front = first((s) => Math.abs(s.yaw - 2 * Math.PI) < 1e-6);
    expect(back).toBeLessThan(front);
    // 背面停一会儿，看得清相机那一条。
    expect(ps.filter((p) => Math.abs(at(p).yaw - Math.PI) < 0.1).length / ps.length).toBeGreaterThan(0.06);
    for (const p of ps) if (at(p).screen > 0) expect(at(p).yaw, `p ${p}`).toBeCloseTo(2 * Math.PI, 6);
    expect(at(0).screen).toBe(0);
  });

  it("停稳的地方（键盘聚焦接听时滚到这里）手机已经转到正面、屏幕亮了、来电界面显出来", () => {
    const s = describeScene({ lights, scroll: restAt(tl, 4)!, viewport: desktop, tier: "full" });
    expect(s.phone!.yaw).toBeCloseTo(2 * Math.PI, 6);
    expect(s.phone!.screen).toBe(1);
    expect(s.phone!.opacity).toBe(1);
    expect(s.phone!.height).toBeCloseTo(s.phone!.bounds.bottom - s.phone!.bounds.top, 6);
    expect(s.text.act4).toBe(1);
  });
});

describe("describeScene: 第 4 幕到第 5 幕", () => {
  it("来电解开钉住的那一屏里，一道道光连续地变成第 5 幕的样子，背景回到黑", () => {
    const before = scene({ scroll: act5.from - 1e-9 });
    const start = scene({ scroll: act5.from });
    start.bands.forEach((b, i) => {
      expect(b.x).toBeCloseTo(before.bands[i].x, 3);
      expect(b.intensity).toBeCloseTo(before.bands[i].intensity, 3);
    });
    expect(before.background).toBe(start.background);
    for (let q = 0; q <= 1; q += 0.01) {
      const a = scene({ scroll: act5.from - 1 + q });
      const b = scene({ scroll: act5.from - 1 + q + 0.0002 });
      a.bands.forEach((band, i) => expect(Math.abs(b.bands[i].x - band.x)).toBeLessThan(desktop.w * 0.01));
    }
  });

  it("来电的画面和手机在解开钉住的那一屏的前半段一起淡出，不跟着舞台整块往上走；第 5 幕里没有手机", () => {
    expect(scene({ scroll: act4.to - 1 }).text.act4).toBe(1);
    expect(scene({ scroll: act4.to - 0.5 }).text.act4).toBe(0);
    for (const q of [0, 0.1, 0.25, 0.4, 0.5]) {
      const s = scene({ scroll: act4.to - 1 + q, time: 0.25 });
      expect(s.phone!.opacity, `q ${q}`).toBeCloseTo(s.text.act4, 6);
    }
    expect(scene({ scroll: act4.to - 0.5, time: 0.25 }).phone!.shake).toEqual({ x: 0, y: 0 });
    expect(scene({ scroll: act5.from + 0.2 }).phone).toBeNull();
    expect(scene({ scroll: in3(0.5) }).phone).toBeNull();
  });
});

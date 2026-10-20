import { describe, expect, it } from "vitest";

import { idolColors } from "./color";
import { describeScene, standX, type Scene, type SceneInput, type Viewport } from "./scene";
import { lightsOf, prepareSpectrum, type RosterEntry } from "./spectrum";
import { ACT1_SCREENS, timelineOf } from "./timeline";

/** 28 位偶像的官方印象色（characters/characters.toml），按偶像编号。 */
const ROSTER: [name: string, color: string, unit: number][] = [
  ["真乃", "#ffbad6", 0],
  ["灯織", "#144384", 0],
  ["めぐる", "#ffe012", 0],
  ["恋鐘", "#f84cad", 1],
  ["摩美々", "#a846fb", 1],
  ["咲耶", "#006047", 1],
  ["結華", "#3b91c4", 1],
  ["霧子", "#d9f2ff", 1],
  ["果穂", "#e5461c", 2],
  ["智代子", "#f93b90", 2],
  ["樹里", "#ffc602", 2],
  ["凛世", "#89c3eb", 2],
  ["夏葉", "#90e667", 2],
  ["甘奈", "#f54275", 3],
  ["甜花", "#e75bec", 3],
  ["千雪", "#fbfafa", 3],
  ["あさひ", "#f30100", 4],
  ["冬優子", "#5ce626", 4],
  ["愛依", "#ff00ff", 4],
  ["透", "#50d0d0", 5],
  ["円香", "#be1e3e", 5],
  ["小糸", "#7967c3", 5],
  ["雛菜", "#ffc639", 5],
  ["にちか", "#a6ceb6", 6],
  ["美琴", "#760f10", 6],
  ["ルカ", "#24130d", 7],
  ["羽那", "#e0b5d3", 7],
  ["はるき", "#ead7a4", 7],
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
const officialOf = new Map(ROSTER.map(([name, color]) => [name, color]));

const desktop: Viewport = { w: 1440, h: 900 };
const phone: Viewport = { w: 390, h: 844 };

function scene(input: Partial<SceneInput> = {}): Scene {
  return describeScene({ lights, scroll: 0, viewport: desktop, tier: "full", ...input });
}

/** 第 1 幕里幕内进度为 `p` 时的滚动位置（屏）：第 0 幕占一屏。 */
const inAct1 = (p: number) => 1 + p * ACT1_SCREENS;
const ACT1_END = inAct1(1) - 1e-6;

/** 从第 0 幕开头一直滚到页尾之后，均匀取的滚动位置。 */
const END = timelineOf(8).acts.at(-1)!.to + 1;
const everywhere = Array.from({ length: 481 }, (_, k) => (k / 480) * END);
/** 第 0、1 幕里均匀取的滚动位置。 */
const opening = Array.from({ length: 121 }, (_, k) => (k / 120) * (1 + ACT1_SCREENS - 1e-6));

describe("describeScene: 第 0 幕", () => {
  it("一开始只有一束白光：电脑上从左边缘横着射到画面 46% 宽、66% 高处，和首屏 CSS 画的那束重合", () => {
    const s = scene();
    expect(s.act).toBe(0);
    expect(s.actProgress).toBe(0);
    expect(s.beam.intensity).toBe(1);
    expect(s.beam.x1).toBeCloseTo(desktop.w * 0.46);
    expect(s.beam.y1).toBeCloseTo(desktop.h * 0.66);
    expect(s.beam.x0).toBeLessThan(0);
    expect(s.beam.y0).toBeCloseTo(desktop.h * 0.66);
    expect(s.prism.intensity).toBe(0);
    expect(s.fan.intensity).toBe(0);
    expect(s.bands.every((b) => b.intensity === 0)).toBe(true);
    expect(s.dispersion).toBe(0);
  });

  it("竖屏的手机上从上边缘竖着射到画面正中、30% 高处", () => {
    const s = scene({ viewport: phone });
    expect(s.beam.x1).toBeCloseTo(phone.w * 0.5);
    expect(s.beam.y1).toBeCloseTo(phone.h * 0.3);
    expect(s.beam.x0).toBeCloseTo(phone.w * 0.5);
    expect(s.beam.y0).toBeLessThan(0);
  });
});

/** 白光的方向角（弧度）。 */
const beamAngle = (s: Scene) => Math.atan2(s.beam.y1 - s.beam.y0, s.beam.x1 - s.beam.x0);

describe("describeScene: 指针", () => {
  it("第 0 幕里白光随指针转一点角度，尽头不动", () => {
    const rest = scene();
    const up = scene({ pointer: { x: 0, y: -1 } });
    const down = scene({ pointer: { x: 0, y: 1 } });
    expect(beamAngle(up)).not.toBeCloseTo(beamAngle(rest));
    expect(Math.sign(beamAngle(up) - beamAngle(rest))).toBe(-Math.sign(beamAngle(down) - beamAngle(rest)));
    expect(Math.abs(beamAngle(up) - beamAngle(rest))).toBeLessThan(0.2);
    expect([up.beam.x1, up.beam.y1]).toEqual([rest.beam.x1, rest.beam.y1]);
  });

  it("竖屏上随手指左右转", () => {
    const rest = scene({ viewport: phone });
    expect(beamAngle(scene({ viewport: phone, pointer: { x: 1, y: 0 } }))).not.toBeCloseTo(beamAngle(rest));
  });

  it("白光射进棱镜以后不再随指针转，正对着入射点", () => {
    for (const p of [0.2, 0.5, 1 - 1e-6]) {
      const rest = scene({ scroll: inAct1(p) });
      const moved = scene({ scroll: inAct1(p), pointer: { x: 1, y: 1 } });
      expect(beamAngle(moved)).toBeCloseTo(beamAngle(rest), 10);
    }
  });
});

describe("describeScene: 第 0、1 幕的边界", () => {
  it("滚过第 0 幕时白光不动，第 1 幕从舞台钉住的地方开始", () => {
    const end0 = scene({ scroll: 1 - 1e-6 });
    expect(end0.act).toBe(0);
    expect(end0.actProgress).toBeCloseTo(1);
    expect([end0.beam.x1, end0.beam.y1]).toEqual([scene().beam.x1, scene().beam.y1]);

    const start1 = scene({ scroll: 1 });
    expect(start1.act).toBe(1);
    expect(start1.actProgress).toBe(0);
    expect(start1.beam.x1).toBeCloseTo(end0.beam.x1);
    expect(start1.beam.y1).toBeCloseTo(end0.beam.y1);
    expect(start1.prism.intensity).toBe(0);
    expect(start1.bands.every((b) => b.intensity === 0)).toBe(true);
  });

  it("第 1 幕里白光移到棱镜的入射点，棱镜出现，然后扇出一道道光", () => {
    const entered = scene({ scroll: inAct1(0.2) });
    expect(entered.prism.intensity).toBe(1);
    expect(entered.beam.y1).toBeLessThan(scene().beam.y1);
    expect(entered.bands.some((b) => b.intensity > 0)).toBe(true);
    for (const b of entered.bands) expect([b.x, b.y]).toEqual([...entered.prism.exit]);
  });

  it("第 1 幕结尾：扇面完全张开，每一道光都以同一个看得见、又不算满强度的亮度停着", () => {
    const end = scene({ scroll: ACT1_END });
    expect(end.act).toBe(1);
    expect(end.actProgress).toBeCloseTo(1);
    const levels = new Set(end.bands.map((b) => b.intensity.toFixed(6)));
    expect(levels.size).toBe(1);
    expect(end.bands[0].intensity).toBeGreaterThan(0.3);
    expect(end.bands[0].intensity).toBeLessThanOrEqual(0.5);
    expect(end.text.act1).toBe(1);
  });

});

describe("describeScene: 分光", () => {
  it("扇出的方向按色相排：粉、红、橙、黄、绿、青、蓝、紫，千雪的白在最边上", () => {
    for (const viewport of [desktop, phone]) {
      const end = describeScene({ lights, scroll: ACT1_END, viewport, tier: "full" });
      const angle = new Map(end.bands.map((b) => [b.id, Math.atan2(b.dy, b.dx)]));
      const order = ["真乃", "あさひ", "果穂", "樹里", "めぐる", "夏葉", "冬優子", "咲耶", "透", "結華", "灯織", "小糸", "摩美々", "愛依"];
      const angles = order.map((id) => angle.get(id)!);
      expect(angles).toEqual([...angles].sort((a, b) => a - b));
      expect(angle.get("千雪")).toBe(Math.max(...angle.values()));
    }
  });

  it("分光以后只出现 28 位偶像自己的颜色，一人一道，没有中间色", () => {
    for (const p of [0.2, 0.4, 0.6, 0.8, 1 - 1e-6]) {
      const s = scene({ scroll: inAct1(p) });
      expect(s.bands).toHaveLength(28);
      expect(new Set(s.bands.map((b) => b.color)).size).toBe(28);
      for (const b of s.bands) expect(b.color).toBe(idolColors(officialOf.get(b.id)!).halo);
    }
  });

  it("任何时候、任何视口，同屏强度超过一半的光都不超过 5 道", () => {
    for (const viewport of [desktop, phone, { w: 2560, h: 1080 }])
      for (const scroll of everywhere) {
        const bright = describeScene({ lights, scroll, viewport, tier: "full" }).bands.filter((b) => b.intensity > 0.5);
        expect(bright.length, `scroll ${scroll}`).toBeLessThanOrEqual(5);
      }
  });

  it("扫过的时候有几道是满强度的", () => {
    const peaks = everywhere.map((scroll) => scene({ scroll }).bands.filter((b) => b.intensity > 0.9).length);
    expect(Math.max(...peaks)).toBeGreaterThanOrEqual(1);
  });
});

describe("describeScene: 色散", () => {
  it("只在转场时出现：开场、扇面张开以后、第 1 幕结尾都没有", () => {
    for (const scroll of [0, 0.5, 1, inAct1(0.6), ACT1_END]) {
      expect(scene({ scroll, speed: 3 }).dispersion, `scroll ${scroll}`).toBe(0);
    }
    expect(scene({ scroll: inAct1(0.07), speed: 3 }).dispersion).toBeGreaterThan(0.5);
    expect(scene({ scroll: inAct1(0.3), speed: 3 }).dispersion).toBeGreaterThan(0.5);
  });

  it("滚得越快分得越开", () => {
    const at = (speed: number) => scene({ scroll: inAct1(0.3), speed }).dispersion;
    expect(at(0)).toBeGreaterThan(0);
    expect(at(0.5)).toBeGreaterThan(at(0));
    expect(at(1.2)).toBeGreaterThan(at(0.5));
    expect(at(-1.2)).toBe(at(1.2));
    expect(at(100)).toBeLessThanOrEqual(1);
  });

  it("色散只剩 1 次采样的档位不做色散", () => {
    expect(scene({ scroll: inAct1(0.3), speed: 3, tier: "basic" }).dispersion).toBe(0);
    expect(scene({ scroll: inAct1(0.3), speed: 3, tier: "lite" }).dispersion).toBeGreaterThan(0);
  });
});

describe("describeScene: 定格档和静态档", () => {
  /** 画面本身（不含在哪一幕）。 */
  const picture = ({ act: _act, actProgress: _p, ...rest }: Scene) => rest;
  const completed = picture(scene({ scroll: ACT1_END }));

  // 静态档和它走同一个分支（定格版式），不另测。
  it("减少动态效果档在第 0、1 幕的任何进度下都是第 1 幕的完成态，不随指针、速度和时间变", () => {
    for (const scroll of opening) {
      const s = scene({ scroll, tier: "reduced", speed: 5, pointer: { x: 1, y: -1 }, time: 12.3 });
      expect(picture(s)).toEqual({ ...completed, beam: { ...completed.beam, tip: 0 } });
    }
  });

  it("光谱是定格的一帧：全部的光竖着排在一屏里，滚到哪儿都一样，不随指针、速度和时间变", () => {
    const act2 = timelineOf(8).acts[2];
    const a = scene({ scroll: act2.from + 0.1, tier: "reduced" });
    const b = scene({ scroll: act2.from + act2.length * 0.7, tier: "reduced", speed: 5, pointer: { x: 1, y: -1 }, time: 12.3, track: 3 });
    expect(picture(b)).toEqual(picture(a));
    for (const band of a.bands) {
      expect([band.dx, band.dy]).toEqual([0, 1]);
      expect(band.x).toBeGreaterThan(0);
      expect(band.x).toBeLessThan(desktop.w);
    }
  });

  it("在哪一幕照常跟着滚动走", () => {
    expect(scene({ scroll: 0.5, tier: "reduced" }).act).toBe(0);
    expect(scene({ scroll: inAct1(0.5), tier: "reduced" }).act).toBe(1);
  });
});

describe("describeScene: 名单", () => {
  it("没有角色时只有白光和棱镜", () => {
    const s = describeScene({ lights: [], scroll: ACT1_END, viewport: desktop, tier: "full" });
    expect(s.bands).toEqual([]);
    expect(s.prism.intensity).toBe(1);
  });

  it("只有一位时她的光在扇面正中", () => {
    const [one] = lightsOf(prepareSpectrum(characters.slice(0, 1)));
    const s = describeScene({ lights: [one], scroll: ACT1_END, viewport: desktop, tier: "full" });
    expect(s.bands[0].hue).toBe(0.5);
    expect(Math.atan2(s.bands[0].dy, s.bands[0].dx)).toBeCloseTo(s.fan.angle);
  });
});

describe("standX: 立绘摆位", () => {
  // 电脑 1440×900 的立绘宽 min(50vw, 66vh) = 594。
  it("电脑上站在她名牌外侧空间大的一边，离名牌半个立绘宽再加 24", () => {
    // 三人组合第 1 位的名牌在 357.6，右边空间大。
    expect(standX(desktop, { unit: 0, slot: 0, unitSize: 3 }, 594)).toBeCloseTo(678.6);
    // 第 3 位的名牌在 1154.4，站到左边。
    expect(standX(desktop, { unit: 0, slot: 2, unitSize: 3 }, 594)).toBeCloseTo(833.4);
    // 第 2 个组合整体右移一屏。
    expect(standX(desktop, { unit: 1, slot: 0, unitSize: 3 }, 594)).toBeCloseTo(1440 + 678.6);
  });

  // 竖屏的立绘宽 74vw：名牌两侧都放不下，以前组合中间几位的立绘有一大块出屏。立绘跟着轨道走，停留时轨道
  // 从组合的起点往左漂到 0.08 屏，漂到头时也不能压幕名轨。
  it("竖屏手机上每个组合的每一位，立绘都在她那一屏里、不压幕名轨", () => {
    const width = phone.w * 0.74;
    for (let unit = 0; unit < 3; unit++) {
      for (let unitSize = 1; unitSize <= 6; unitSize++) {
        for (let slot = 0; slot < unitSize; slot++) {
          const x = standX(phone, { unit, slot, unitSize }, width);
          const where = `第 ${unit + 1} 个组合（${unitSize} 人）第 ${slot + 1} 位`;
          expect(x - width / 2 - 0.08 * phone.w, where).toBeGreaterThanOrEqual(unit * phone.w + 36 - 1e-6);
          expect(x + width / 2, where).toBeLessThanOrEqual((unit + 1) * phone.w + 1e-6);
        }
      }
    }
  });

  it("立绘比幕名轨右边的一屏还宽时，在这一段里居中", () => {
    // 300 宽的屏，幕名轨 36，左边再让出漂移的 24，能用的是 60 到 300，中点 180。
    expect(standX({ w: 300, h: 800 }, { unit: 0, slot: 1, unitSize: 3 }, 290)).toBeCloseTo(180);
    expect(standX({ w: 300, h: 800 }, { unit: 2, slot: 0, unitSize: 3 }, 290)).toBeCloseTo(600 + 180);
  });
});

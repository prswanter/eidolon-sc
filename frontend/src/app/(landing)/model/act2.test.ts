import { describe, expect, it } from "vitest";

import { idolColors } from "./color";
import { describeScene, slotX, type Scene, type SceneInput, type Viewport } from "./scene";
import { lightsOf, prepareSpectrum, type RosterEntry } from "./spectrum";
import { holdAt, REGROUP_SCREENS, SEG_SCREENS, spanOf, TAIL_SCREENS, timelineOf, ZOOM_SCREENS } from "./timeline";

/** 8 个组合、28 位偶像，按偶像编号（只要组合的人数和颜色对得上就行）。 */
const UNITS: [unit: string, members: [name: string, color: string][]][] = [
  ["illumination STARS", [["真乃", "#ffbad6"], ["灯織", "#144384"], ["めぐる", "#ffe012"]]],
  ["L'Antica", [["恋鐘", "#f84cad"], ["摩美々", "#a846fb"], ["咲耶", "#006047"], ["結華", "#3b91c4"], ["霧子", "#d9f2ff"]]],
  ["放課後クライマックスガールズ", [["果穂", "#e5461c"], ["智代子", "#f93b90"], ["樹里", "#ffc602"], ["凛世", "#89c3eb"], ["夏葉", "#90e667"]]],
  ["ALSTROEMERIA", [["甘奈", "#f54275"], ["甜花", "#e75bec"], ["千雪", "#fbfafa"]]],
  ["Straylight", [["あさひ", "#f30100"], ["冬優子", "#5ce626"], ["愛依", "#ff00ff"]]],
  ["noctchill", [["透", "#50d0d0"], ["円香", "#be1e3e"], ["小糸", "#7967c3"], ["雛菜", "#ffc639"]]],
  ["SHHis", [["にちか", "#a6ceb6"], ["美琴", "#760f10"]]],
  ["CoMETIK", [["ルカ", "#24130d"], ["羽那", "#e0b5d3"], ["はるき", "#ead7a4"]]],
];
let no = 0;
const characters: RosterEntry[] = UNITS.flatMap(([unit, members], u) =>
  members.map(([name, color]) => ({ id: name, name, color, idol_id: ++no, unit, unit_order: u })),
);
const spectrum = prepareSpectrum(characters);
const lights = lightsOf(spectrum);
const order = spectrum.idols.map((i) => i.id);
const unitOf = new Map(UNITS.flatMap(([, members], u) => members.map(([name]) => [name, u] as const)));

const desktop: Viewport = { w: 1440, h: 900 };
const phone: Viewport = { w: 390, h: 844 };
const tl = timelineOf(8);
const act2 = spanOf(tl, 2)!;

/** 第 2 幕开始后 `q` 屏的滚动位置。 */
const at = (q: number) => act2.from + q;
/** 第 u 个组合停稳的地方：推入之前的停留段里。 */
const holding = (u: number) => at(REGROUP_SCREENS + ZOOM_SCREENS + u * SEG_SCREENS + 0.3);
/** 第 u 个组合推向下一个的正中间。 */
const pushing = (u: number) => at(REGROUP_SCREENS + ZOOM_SCREENS + u * SEG_SCREENS + SEG_SCREENS * 0.78);
const zoomed = at(REGROUP_SCREENS + ZOOM_SCREENS);

function scene(input: Partial<SceneInput> = {}): Scene {
  return describeScene({ lights, scroll: at(0), viewport: desktop, tier: "full", ...input });
}
const byId = (s: Scene) => new Map(s.bands.map((b) => [b.id, b]));
const onScreen = (s: Scene, vp: Viewport) => s.bands.filter((b) => b.x >= 0 && b.x <= vp.w);

describe("lightsOf: 光层要的那一份", () => {
  it("每道光带上她在第几个组合、组合里第几位、组合有几人，以及聚焦时的极深底色", () => {
    const kiriko = lights.find((l) => l.id === "霧子")!;
    expect(kiriko).toMatchObject({ unit: 1, slot: 4, unitSize: 5, deep: idolColors("#d9f2ff").deep });
  });
});

describe("describeScene: 第 1 幕到第 2 幕，扇面归队", () => {
  it("第 1 幕最后一刻和第 2 幕第一刻是同一个画面", () => {
    const end1 = scene({ scroll: act2.from - 1e-9 });
    const start2 = scene({ scroll: act2.from });
    expect(start2.act).toBe(2);
    start2.bands.forEach((b, i) => {
      const e = end1.bands[i];
      for (const k of ["x", "y", "dx", "dy", "length", "intensity"] as const) expect(b[k]).toBeCloseTo(e[k], 4);
    });
  });

  it("归队是连续的：滚一点点，每道光只挪一点点", () => {
    for (let q = 0; q < REGROUP_SCREENS + ZOOM_SCREENS + SEG_SCREENS; q += 0.01) {
      const a = scene({ scroll: at(q) });
      const b = scene({ scroll: at(q + 0.0001) });
      a.bands.forEach((band, i) => {
        expect(Math.abs(b.bands[i].x - band.x), `q ${q}`).toBeLessThan(desktop.w * 0.02);
        expect(Math.abs(b.bands[i].intensity - band.intensity), `q ${q}`).toBeLessThan(0.05);
      });
    }
  });

  it("拉直以后是竖着的一道道光，按组合顺序从左往右排满一屏，白光和棱镜熄了", () => {
    const ruler = scene({ scroll: at(REGROUP_SCREENS) });
    const xs = order.map((id) => byId(ruler).get(id)!.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(xs[0]).toBeGreaterThan(0);
    expect(xs.at(-1)).toBeLessThan(desktop.w);
    for (const b of ruler.bands) expect([b.dx, b.dy]).toEqual([0, 1]);
    expect(ruler.beam.intensity).toBe(0);
    expect(ruler.prism.intensity).toBe(0);
    expect(ruler.fan.intensity).toBe(0);
    expect(ruler.text.act1).toBe(0);
  });
});

describe("describeScene: 横滚的光谱", () => {
  it("放大以后画面里是第一个组合，按组合里的顺序从左往右，名牌显出来", () => {
    const s = scene({ scroll: zoomed });
    expect(onScreen(s, desktop).map((b) => b.id)).toEqual(["真乃", "灯織", "めぐる"]);
    expect(s.spectrum?.unit).toBe(0);
    expect(s.text.plates).toBe(1);
  });

  it("每个组合停稳时，画面里正好是这个组合的人，底部的组合名跟着走", () => {
    for (const viewport of [desktop, phone])
      UNITS.forEach(([, members], u) => {
        const s = scene({ scroll: holding(u), viewport });
        expect(s.spectrum?.unit).toBe(u);
        expect(onScreen(s, viewport).map((b) => b.id)).toEqual(members.map(([name]) => name));
      });
  });

  it("按组合跳转：滚到第 u 个组合停稳的地方，画面里就是这个组合", () => {
    UNITS.forEach((_, u) => {
      const s = scene({ scroll: holdAt(tl, u) });
      expect(s.spectrum?.unit).toBe(u);
      expect(s.spectrum!.trackTarget).toBeCloseTo(u, 1);
    });
  });

  it("组合之间整页推入：横移正好一屏，推入的途中两个组合各占一部分", () => {
    const a = scene({ scroll: holding(2) });
    const b = scene({ scroll: holding(3) });
    expect(b.spectrum!.trackTarget - a.spectrum!.trackTarget).toBeCloseTo(1, 1);
    const mid = onScreen(scene({ scroll: pushing(2) }), desktop).map((band) => unitOf.get(band.id));
    expect(new Set(mid)).toEqual(new Set([2, 3]));
  });

  it("名牌的位置和光对齐：光的横坐标就是名牌的位置减去横移", () => {
    const s = scene({ scroll: holding(1) });
    const track = s.spectrum!.track;
    for (const light of lights) {
      expect(byId(s).get(light.id)!.x).toBeCloseTo(slotX(desktop, light.unit, light.slot, light.unitSize) - track * desktop.w);
    }
  });

  it("横移由调用方用弹簧平滑过：给了平滑后的横移量就按它画", () => {
    const s = scene({ scroll: holding(1), track: 0.5 });
    expect(s.spectrum!.track).toBe(0.5);
    expect(s.spectrum!.trackTarget).toBeCloseTo(scene({ scroll: holding(1) }).spectrum!.trackTarget);
  });

  it("最后一个组合多停一会儿", () => {
    expect(scene({ scroll: at(act2.length - TAIL_SCREENS / 2) }).spectrum?.unit).toBe(7);
    expect(scene({ scroll: act2.from + act2.length - 1e-6 }).spectrum?.unit).toBe(7);
  });

  it("解开钉住时竖线不跟着往上走，只有名字处的断口跟着名牌往上走", () => {
    const nameGaps = Object.fromEntries(order.map((id) => [id, [300, 560] as const]));
    const pinned = scene({ scroll: act2.from + act2.length - 1e-6, nameGaps });
    // 刚解开钉住：这一屏里光同时在往第 5 幕的样子变形，断口也在跟着收，越往后越不只是平移。
    const lifted = scene({ scroll: act2.from + act2.length + 0.02, nameGaps });
    const haruki = (s: Scene) => byId(s).get("はるき")!;
    expect(haruki(lifted).y).toBeCloseTo(haruki(pinned).y);
    expect(haruki(lifted).length).toBeGreaterThanOrEqual(desktop.h);
    expect(Math.abs(haruki(lifted).y + haruki(lifted).gap0 - (300 - desktop.h * 0.02))).toBeLessThan(1);
  });

  it("名字处光芯断开：量好的名字区间换算成沿光线的距离；放大之前没有", () => {
    const nameGaps = Object.fromEntries(order.map((id) => [id, [300, 560] as const]));
    const s = scene({ scroll: holding(0), nameGaps });
    for (const b of onScreen(s, desktop)) {
      expect(b.y + b.dy * b.gap0).toBeCloseTo(300);
      expect(b.y + b.dy * b.gap1).toBeCloseTo(560);
    }
    for (const b of scene({ scroll: at(REGROUP_SCREENS), nameGaps }).bands) expect(b.gap1).toBe(b.gap0);
  });
});

describe("describeScene: 同屏满强度的上限", () => {
  it("一个组合超过 5 人时，停在这个组合也不超过 5 道满强度的光", () => {
    const big: RosterEntry[] = Array.from({ length: 7 }, (_, i) => ({
      id: `big-${i}`,
      name: `big-${i}`,
      color: "#ffbad6",
      idol_id: i + 1,
      unit: null,
      unit_order: null,
    }));
    const bigLights = lightsOf(prepareSpectrum([...characters.slice(0, 3), ...big]));
    const span = spanOf(timelineOf(2), 2)!;
    for (let q = 0; q <= span.length; q += 0.05) {
      const s = describeScene({ lights: bigLights, scroll: span.from + q, viewport: desktop, tier: "full" });
      expect(s.bands.filter((b) => b.intensity > 0.5).length, `q ${q}`).toBeLessThanOrEqual(5);
    }
  });
});

describe("describeScene: 聚焦", () => {
  const focusOn = (id: string, w = 1) => ({ [id]: w });

  it("聚焦到她：背景是她的极深同色相，她更亮，其余降成余烬", () => {
    const s = scene({ scroll: holding(1), focus: focusOn("咲耶") });
    expect(s.background).toBe(idolColors("#006047").deep);
    const unfocused = scene({ scroll: holding(1) });
    expect(byId(s).get("咲耶")!.intensity).toBeGreaterThan(byId(unfocused).get("咲耶")!.intensity);
    for (const b of s.bands) if (b.id !== "咲耶") expect(b.intensity).toBeLessThan(0.25);
  });

  it("聚焦淡入淡出时背景在黑和她的底色之间连续过渡", () => {
    const black = scene({ scroll: holding(1) }).background;
    const deep = idolColors("#006047").deep;
    const half = scene({ scroll: holding(1), focus: focusOn("咲耶", 0.5) }).background;
    expect([black, deep]).not.toContain(half);
    const lum = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
    expect(lum(half)).toBeGreaterThan(lum(black));
    expect(lum(half)).toBeLessThan(lum(deep));
  });

  it("立绘只在光谱停稳、聚焦的是当前组合的人时出现", () => {
    expect(scene({ scroll: holding(1), focus: focusOn("咲耶") }).spectrum?.stand).toBe("咲耶");
    expect(scene({ scroll: holding(1), focus: focusOn("咲耶", 0.3) }).spectrum?.stand).toBeNull();
    expect(scene({ scroll: holding(1), focus: focusOn("真乃") }).spectrum?.stand).toBeNull();
    expect(scene({ scroll: pushing(1), focus: focusOn("咲耶") }).spectrum?.stand).toBeNull();
    expect(scene({ scroll: at(REGROUP_SCREENS), focus: focusOn("真乃") }).spectrum?.stand).toBeNull();
    expect(scene({ scroll: act2.to - 0.5, focus: focusOn("はるき") }).spectrum?.stand).toBeNull();
    expect(scene({ scroll: holding(1) }).spectrum?.stand).toBeNull();
  });

  it("光谱以外聚焦不起作用", () => {
    const s = scene({ scroll: 2, focus: focusOn("真乃") });
    expect(s.background).toBe(scene({ scroll: 2 }).background);
    expect(s.spectrum).toBeNull();
  });
});

describe("describeScene: 第 2 幕的色散", () => {
  it("归队、放大、推入时有，停稳时没有", () => {
    expect(scene({ scroll: at(REGROUP_SCREENS * 0.5), speed: 2 }).dispersion).toBeGreaterThan(0.3);
    expect(scene({ scroll: at(REGROUP_SCREENS + ZOOM_SCREENS * 0.5), speed: 2 }).dispersion).toBeGreaterThan(0.2);
    expect(scene({ scroll: pushing(3), speed: 2 }).dispersion).toBeGreaterThan(0.2);
    expect(scene({ scroll: holding(3) - 0.2, speed: 2 }).dispersion).toBe(0);
  });
});

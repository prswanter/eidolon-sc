import { describe, expect, it } from "vitest";

import { cameraAt, CAMERA, ELEVATION, ISLAND_SIZE, ISLANDS, project, FIGURE_HEIGHT, type Vec3 } from "./memory";
import { STANDS } from "./memoryStory";
import { describeScene, type Scene, type SceneInput, type Viewport } from "./scene";
import { lightsOf, prepareSpectrum, type RosterEntry } from "./spectrum";
import { ACT5_SCREENS, spanOf, timelineOf } from "./timeline";

const ROSTER: [name: string, color: string, unit: number][] = [
  ["真乃", "#ffbad6", 0],
  ["灯織", "#144384", 0],
  ["めぐる", "#ffe012", 0],
  ["果穂", "#e5461c", 1],
  ["冬優子", "#5ce626", 2],
  ["霧子", "#d9f2ff", 3],
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
const act4 = spanOf(tl, 4)!;
const act5 = spanOf(tl, 5)!;
const act6 = spanOf(tl, 6)!;
const desktop: Viewport = { w: 1440, h: 900 };
const portrait: Viewport = { w: 390, h: 844 };

function scene(input: Partial<SceneInput> = {}): Scene {
  return describeScene({ lights, scroll: act5.from, viewport: desktop, tier: "full", ...input });
}
const in5 = (p: number) => act5.from + p * act5.length;
const ps = Array.from({ length: 801 }, (_, k) => k / 800);
const DEG = Math.PI / 180;

/** 每座岛柱顶的四个角，和站在上面的人的头顶。 */
const islandPoints = (k: number): Vec3[] => {
  const [x, y, z] = ISLANDS[k];
  const h = ISLAND_SIZE / 2;
  const [sx, sy, sz] = STANDS[k];
  return [[x - h, y, z - h], [x + h, y, z - h], [x - h, y, z + h], [x + h, y, z + h], [sx, sy + FIGURE_HEIGHT, sz]];
};

describe("第 5 幕的时间线", () => {
  it("钉住 ACT5_SCREENS 屏，最后一屏解开钉住", () => {
    expect(act5.length).toBe(ACT5_SCREENS);
    expect(act5.to - act5.from).toBe(act5.length + 1);
    expect(tl.sections.find((s) => s.acts.includes(5))).toMatchObject({ acts: [5], pinned: true, screens: ACT5_SCREENS + 1 });
  });
});

describe("cameraAt: 第 5 幕的镜头", () => {
  it("在每个关键帧上就是原型定下的注视点、半径和方位角", () => {
    for (const key of CAMERA) {
      const cam = cameraAt(key.p, desktop);
      cam.target.forEach((v, i) => expect(v).toBeCloseTo(key.target[i], 9));
      expect(cam.radius).toBeCloseTo(key.r, 9);
      expect(cam.azimuth).toBeCloseTo(key.az * DEG, 9);
    }
  });

  it("随进度连续变化：滚一点点，岛在画面上只挪一点点", () => {
    for (const vp of [desktop, portrait]) {
      const at = ps.map((p) => cameraAt(p, vp));
      at.slice(1).forEach((cam, k) => {
        for (let i = 0; i < ISLANDS.length; i++) {
          const [x0, y0] = project(at[k], vp, ISLANDS[i]);
          const [x1, y1] = project(cam, vp, ISLANDS[i]);
          expect(Math.hypot(x1 - x0, y1 - y0), `p ${ps[k + 1]}`).toBeLessThan(Math.max(vp.w, vp.h) * 0.02);
        }
      });
    }
  });

  it("取景半径管画面短的那一边：横屏是竖向的一半，竖屏按宽高比放大，横向的一半是它", () => {
    expect(cameraAt(0, desktop).half).toBeCloseTo(CAMERA[0].r, 9);
    expect(cameraAt(0, portrait).half * (portrait.w / portrait.h)).toBeCloseTo(CAMERA[0].r, 9);
  });

  it("全景里四座岛和站在上面的人都在画面里，离边缘有余量（电脑、竖屏）", () => {
    // 开头标题还在、镜头还没推近的那一段，和最后的全景。
    const panorama = [...ps.filter((p) => p <= 0.03), ...ps.filter((p) => p >= 0.92)];
    for (const vp of [desktop, portrait]) {
      const margin = Math.min(vp.w, vp.h) * 0.03;
      for (const p of panorama) {
        const cam = cameraAt(p, vp);
        for (let k = 0; k < ISLANDS.length; k++)
          for (const point of islandPoints(k)) {
            const [x, y] = project(cam, vp, point);
            expect(x, `${vp.w}×${vp.h}，p ${p}，第 ${k} 座岛`).toBeGreaterThan(margin);
            expect(x).toBeLessThan(vp.w - margin);
            expect(y, `${vp.w}×${vp.h}，p ${p}，第 ${k} 座岛`).toBeGreaterThan(margin);
            expect(y).toBeLessThan(vp.h - margin);
          }
      }
    }
  });
});

describe("project: 世界坐标投影到画面上", () => {
  it("注视点在画面正中；往上的点在画面上方，往镜头右手边的点在画面右边", () => {
    for (const vp of [desktop, portrait])
      for (const p of [0, 0.3, 0.7]) {
        const cam = cameraAt(p, vp);
        const [x, y] = project(cam, vp, cam.target);
        expect(x).toBeCloseTo(vp.w / 2, 6);
        expect(y).toBeCloseTo(vp.h / 2, 6);
        const [t0, t1, t2] = cam.target;
        expect(project(cam, vp, [t0, t1 + 1, t2])[1]).toBeLessThan(vp.h / 2);
        const right: Vec3 = [t0 + Math.cos(cam.azimuth), t1, t2 - Math.sin(cam.azimuth)];
        expect(project(cam, vp, right)[0]).toBeGreaterThan(vp.w / 2);
      }
  });

  it("正交投影：沿视线方向挪动的点落在画面上同一处", () => {
    const cam = cameraAt(0.4, desktop);
    const toward = [Math.sin(cam.azimuth) * Math.cos(ELEVATION), Math.sin(ELEVATION), Math.cos(cam.azimuth) * Math.cos(ELEVATION)];
    const a = project(cam, desktop, [1, 2, 3]);
    const b = project(cam, desktop, [1 + toward[0] * 5, 2 + toward[1] * 5, 3 + toward[2] * 5]);
    expect(b[0]).toBeCloseTo(a[0], 6);
    expect(b[1]).toBeCloseTo(a[1], 6);
  });

  it("取景半径是画面高度的一半：注视点正上方 half 处落在画面顶边", () => {
    const cam = cameraAt(0.5, desktop);
    const up = [-Math.sin(ELEVATION) * Math.sin(cam.azimuth), Math.cos(ELEVATION), -Math.sin(ELEVATION) * Math.cos(cam.azimuth)];
    const top = project(cam, desktop, [cam.target[0] + up[0] * cam.half, cam.target[1] + up[1] * cam.half, cam.target[2] + up[2] * cam.half]);
    expect(top[1]).toBeCloseTo(0, 6);
  });
});

describe("describeScene: 第 5 幕", () => {
  it("场景状态跟着幕内进度：镜头就是 cameraAt 给的", () => {
    for (const p of [0, 0.2, 0.55, 1]) {
      const s = scene({ scroll: in5(p) });
      expect(s.memory!.progress).toBeCloseTo(p, 9);
      expect(s.memory!.camera).toEqual(cameraAt(s.memory!.progress, desktop));
      expect(s.memory!.opacity).toBe(1);
    }
    const tall = scene({ scroll: in5(0.3), viewport: portrait }).memory!;
    expect(tall.camera).toEqual(cameraAt(tall.progress, portrait));
  });

  it("光层不画这一幕的东西：一道道光都熄着，背景是页面的底色", () => {
    for (const p of [0, 0.5, 1]) {
      const s = scene({ scroll: in5(p) });
      expect(s.bands.every((b) => b.intensity === 0)).toBe(true);
      expect(s.beam.intensity + s.prism.intensity + s.fan.intensity + s.screen.intensity).toBe(0);
    }
  });

  it("标题和正文在全景里显示，镜头推近以前淡出", () => {
    expect(scene({ scroll: in5(0) }).text.act5).toBe(1);
    expect(scene({ scroll: in5(0.04) }).text.act5).toBe(1);
    expect(scene({ scroll: in5(0.1) }).text.act5).toBe(0);
    const texts = ps.map((p) => scene({ scroll: in5(p) }).text.act5);
    expect(texts).toEqual([...texts].sort((a, b) => b - a));
  });

  it("别的幕里没有第 5 幕的场景状态", () => {
    expect(scene({ scroll: act4.from + 0.5 }).memory).toBeNull();
    expect(scene({ scroll: act6.from + 0.2 }).memory).toBeNull();
  });

  it("静止版式里哪一幕都没有这一幕的场景状态，这一幕的标题和正文一直在", () => {
    // 定格档、静态档都是静止版式（layoutOf），走同一个分支；每一幕取它当中一处，第 4 幕解开钉住那一屏也取一处。
    for (const a of tl.acts) {
      const scroll = (a.from + a.to) / 2;
      expect(scene({ scroll, tier: "reduced" }).memory, `第 ${a.act} 幕`).toBeNull();
    }
    expect(scene({ scroll: act5.from - 0.5, tier: "reduced" }).memory).toBeNull();
    expect(scene({ scroll: in5(0.5), tier: "reduced" }).text.act5).toBe(1);
  });
});

describe("describeScene: 第 4 幕到第 5 幕", () => {
  it("来电解开钉住的那一屏里，夜空在手机淡出以后淡入，到第 5 幕开头正好全显出来", () => {
    const opacities = Array.from({ length: 201 }, (_, k) => scene({ scroll: act5.from - 1 + k / 200 }).memory!.opacity);
    expect(opacities).toEqual([...opacities].sort((a, b) => a - b));
    expect(opacities[0]).toBe(0);
    expect(opacities.at(-1)).toBe(1);
    // 手机淡出的那一段里，夜空还没起来。
    expect(scene({ scroll: act5.from - 0.8 }).memory!.opacity).toBe(0);
    expect(scene({ scroll: act5.from - 1e-9 }).memory!.opacity).toBeCloseTo(1, 6);
  });

  it("这一屏里镜头已经停在第 5 幕开头，标题和正文跟着舞台从下面进来", () => {
    for (const q of [0.01, 0.5, 0.99]) {
      const s = scene({ scroll: act5.from - 1 + q });
      expect(s.memory!.camera).toEqual(cameraAt(0, desktop));
      expect(s.memory!.progress).toBe(0);
      expect(s.text.act5).toBe(1);
    }
  });
});

describe("describeScene: 第 5 幕到第 6 幕", () => {
  it("解开钉住的那一屏里画布淡出，到第 6 幕全暗", () => {
    const opacities = Array.from({ length: 201 }, (_, k) => scene({ scroll: act5.from + act5.length + k / 200 - 1e-9 }).memory!.opacity);
    expect(opacities).toEqual([...opacities].sort((a, b) => b - a));
    expect(opacities[0]).toBeCloseTo(1, 6);
    expect(opacities.at(-1)).toBe(0);
  });

  it("第 6 幕接着第 5 幕：光照样熄着，底色一样", () => {
    const end = scene({ scroll: act6.from - 1e-9 });
    const next = scene({ scroll: act6.from });
    expect(next.background).toBe(end.background);
    next.bands.forEach((b, i) => {
      expect(b.intensity).toBe(end.bands[i].intensity);
      expect(b.x).toBeCloseTo(end.bands[i].x, 6);
    });
  });
});

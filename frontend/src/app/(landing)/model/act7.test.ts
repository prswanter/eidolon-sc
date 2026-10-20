import { describe, expect, it } from "vitest";

import { describeScene, type Scene, type SceneInput, type Viewport } from "./scene";
import { lightsOf, prepareSpectrum, type RosterEntry } from "./spectrum";
import { spanOf, timelineOf } from "./timeline";

const characters: RosterEntry[] = Array.from({ length: 28 }, (_, i) => ({
  id: `idol-${i}`,
  name: `idol-${i}`,
  color: ["#ffbad6", "#144384", "#ffe012", "#a846fb", "#006047", "#e5461c", "#90e667"][i % 7],
  idol_id: i + 1,
  unit: `unit ${Math.floor(i / 4)}`,
  unit_order: Math.floor(i / 4),
}));
const lights = lightsOf(prepareSpectrum(characters));
const tl = timelineOf(7);
const act6 = spanOf(tl, 6)!;
const act7 = spanOf(tl, 7)!;
const desktop: Viewport = { w: 1440, h: 900 };
const phone: Viewport = { w: 390, h: 844 };

function scene(input: Partial<SceneInput> = {}): Scene {
  return describeScene({ lights, scroll: act7.from, viewport: desktop, tier: "full", ...input });
}
const in7 = (p: number) => act7.from + p * act7.length;

describe("describeScene: 第 6 幕，安静的诚实事项", () => {
  it("全站最暗：从头到尾一道光都没有，没有色散，背景是页面的底色", () => {
    for (const scroll of [act6.from + 0.3, act7.from - 0.3, act7.from - 1e-6]) {
      const s = scene({ scroll, speed: 3 });
      expect(s.act).toBe(6);
      expect(s.bands.every((b) => b.intensity === 0)).toBe(true);
      expect(s.screen.intensity).toBe(0);
      expect(s.dispersion).toBe(0);
      expect(s.background).toBe(scene({ scroll: 0 }).background);
    }
  });
});

describe("describeScene: 第 7 幕，光汇聚成入口", () => {
  it("舞台钉住以后，28 道光从暗处回来，竖着铺满一屏", () => {
    const back = scene({ scroll: in7(0.1) });
    expect(back.bands.every((b) => b.intensity > 0)).toBe(true);
    const xs = scene({ scroll: act7.from }).bands.map((b) => b.x);
    expect(Math.min(...xs)).toBeGreaterThan(0);
    expect(Math.max(...xs)).toBeLessThan(desktop.w);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(desktop.w * 0.6);
  });

  it("收拢的结果是一块竖着的手机屏幕，28 道光都收进屏幕里，屏幕是全站最亮的", () => {
    for (const viewport of [desktop, phone]) {
      const end = describeScene({ lights, scroll: in7(1), viewport, tier: "full" });
      const { screen } = end;
      expect(screen.intensity).toBe(1);
      expect(screen.h).toBeGreaterThan(screen.w * 1.8);
      expect(screen.x - screen.w).toBeGreaterThan(0);
      expect(screen.x + screen.w).toBeLessThan(viewport.w);
      for (const b of end.bands) {
        expect(b.x).toBeGreaterThanOrEqual(screen.x - screen.w);
        expect(b.x).toBeLessThanOrEqual(screen.x + screen.w);
      }
    }
  });

  it("屏幕越来越亮，行动按钮在屏幕亮起来以后出现", () => {
    const levels = [0, 0.2, 0.4, 0.6, 0.8, 1].map((p) => scene({ scroll: in7(p) }).screen.intensity);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(scene({ scroll: in7(0.2) }).text.act7).toBe(0);
    expect(scene({ scroll: in7(1) }).text.act7).toBe(1);
  });

  it("收拢的途中同屏满强度的光也不超过 5 道", () => {
    for (let p = 0; p <= 1; p += 0.02) {
      expect(scene({ scroll: in7(p) }).bands.filter((b) => b.intensity > 0.5).length).toBeLessThanOrEqual(5);
    }
  });

  it("收拢时有一点色散，收拢完就没有了", () => {
    expect(scene({ scroll: in7(0.3), speed: 2 }).dispersion).toBeGreaterThan(0.2);
    expect(scene({ scroll: in7(1), speed: 2 }).dispersion).toBe(0);
  });

  it("最后解开钉住，屏幕跟着页面往上走", () => {
    const end = scene({ scroll: in7(1) });
    const after = scene({ scroll: in7(1) + 0.5 });
    expect(after.screen.y).toBeCloseTo(end.screen.y - desktop.h * 0.5);
  });

  it("减少动态效果档：直接是汇聚后的白光", () => {
    const s = scene({ scroll: act7.from + 0.1, tier: "reduced" });
    const end = scene({ scroll: in7(1) }).screen;
    for (const [k, v] of Object.entries(end)) expect(s.screen[k as keyof typeof end], k).toBeCloseTo(v, 6);
    expect(s.text.act7).toBe(1);
  });
});

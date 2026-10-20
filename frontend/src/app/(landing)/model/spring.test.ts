import { describe, expect, it } from "vitest";

import { settleSpring, stepSpring, type Spring } from "./spring";

/** 以每秒 `fps` 帧跑 `seconds` 秒，返回每一帧的位置。 */
function run(fps: number, seconds: number, target = 1): number[] {
  let s: Spring = settleSpring(0);
  const xs: number[] = [];
  for (let n = 0; n < fps * seconds; n++) {
    s = stepSpring(s, target, 1 / fps);
    xs.push(s.x);
  }
  return xs;
}

describe("stepSpring: 自写弹簧", () => {
  it("一秒内追上目标，几乎不冲过头", () => {
    const xs = run(60, 1);
    expect(xs.at(-1)).toBeCloseTo(1, 2);
    expect(Math.max(...xs)).toBeLessThan(1.01);
    expect(xs[0]).toBeGreaterThan(0);
    expect(xs[0]).toBeLessThan(0.1);
  });

  it("和帧率无关：30、60、120 帧走过同样的时间到同一个地方", () => {
    const at = (fps: number) => run(fps, 0.2).at(-1)!;
    expect(at(30)).toBeCloseTo(at(120), 2);
    expect(at(60)).toBeCloseTo(at(120), 2);
  });

  it("卡了很久的一帧也不会弹飞", () => {
    const s = stepSpring(settleSpring(0), 1, 2);
    expect(s.x).toBeGreaterThan(0.9);
    expect(s.x).toBeLessThan(1.01);
  });

  it("dt 为 0 时原地不动", () => {
    const s = { x: 0.3, v: 2 };
    expect(stepSpring(s, 1, 0)).toEqual(s);
  });
});

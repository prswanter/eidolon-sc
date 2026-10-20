import { describe, expect, it } from "vitest";

import { ACT1_SCREENS, holdAt, restAt, SEG_SCREENS, timelineOf, whereIs } from "./timeline";

describe("timelineOf: 整页的时间线", () => {
  const eight = timelineOf(8);

  it("按幕的顺序排：开场、分光、光谱、她说日语、来电、记忆、诚实事项、开始", () => {
    expect(eight.acts.map((a) => a.act)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("第 0 幕占一屏，第 1 幕从舞台钉住的第 1 屏开始", () => {
    expect(eight.acts[0]).toMatchObject({ from: 0, length: 1 });
    expect(eight.acts[1]).toMatchObject({ from: 1, length: ACT1_SCREENS });
    expect(eight.acts[2].from).toBe(1 + ACT1_SCREENS);
  });

  it("一幕接一幕，没有空隙", () => {
    eight.acts.slice(1).forEach((a, i) => expect(a.from).toBeCloseTo(eight.acts[i].to));
  });

  it("组合越多，光谱越长：每多一个组合多滚一段", () => {
    const len = (n: number) => timelineOf(n).acts.find((a) => a.act === 2)!.length;
    expect(len(8) - len(7)).toBeCloseTo(SEG_SCREENS);
  });

  it("页面上的每一段接着上一段；钉住的一段比它的几幕多一屏，用来解开钉住、让下一段进来", () => {
    let at = 0;
    for (const s of eight.sections) {
      expect(s.from).toBeCloseTo(at);
      const acts = eight.acts.filter((a) => s.acts.includes(a.act));
      const length = acts.reduce((sum, a) => sum + a.length, 0);
      expect(s.screens).toBeCloseTo(s.pinned ? length + 1 : length);
      at += s.screens;
    }
    // 分光和光谱钉在同一个舞台上：扇面要一路变形成光谱。
    expect(eight.sections.find((s) => s.acts.includes(1))!.acts).toEqual([1, 2]);
    expect(eight.sections.find((s) => s.acts.includes(6))!.pinned).toBe(false);
    // 第 3、4 幕钉在同一个舞台上：她那一道光从说话一路变成来电。
    expect(eight.sections.find((s) => s.acts.includes(3))).toMatchObject({ acts: [3, 4], pinned: true });
  });

  it("没有角色时没有光谱，也没有她说日语、来电这两幕", () => {
    expect(timelineOf(0).acts.map((a) => a.act)).toEqual([0, 1, 5, 6, 7]);
  });
});

describe("whereIs: 滚到哪一幕", () => {
  const tl = timelineOf(8);

  it("每一幕从它开始的地方算起，幕内进度 0 到 1；钉住的幕解开钉住的那一屏仍算这一幕，进度停在 1", () => {
    expect(whereIs(tl, 0)).toEqual({ act: 0, actProgress: 0 });
    expect(whereIs(tl, 0.5)).toEqual({ act: 0, actProgress: 0.5 });
    expect(whereIs(tl, 1)).toEqual({ act: 1, actProgress: 0 });
    const act2 = tl.acts[2];
    expect(whereIs(tl, act2.from + act2.length / 2).act).toBe(2);
    expect(whereIs(tl, act2.from + act2.length / 2).actProgress).toBeCloseTo(0.5);
    expect(whereIs(tl, act2.to - 0.01)).toEqual({ act: 2, actProgress: 1 });
  });

  it("滚过最后一幕仍是最后一幕", () => {
    expect(whereIs(tl, 999)).toEqual({ act: 7, actProgress: 1 });
  });
});

describe("restAt: 每一幕停稳的地方", () => {
  const tl = timelineOf(8);

  it("每一幕停稳的地方都在这一幕里面，没有角色时没有的幕也没有这个地方", () => {
    for (const span of tl.acts) {
      const at = restAt(tl, span.act)!;
      expect(whereIs(tl, at).act, `第 ${span.act} 幕`).toBe(span.act);
    }
    expect(restAt(timelineOf(0), 3)).toBeUndefined();
  });

  it("第 4 幕停在手机转完、来电显出来以后；第 3 幕停在几句话都说完以后；第 7 幕停在行动按钮出现以后", () => {
    const at = (act: number) => whereIs(tl, restAt(tl, act)!).actProgress;
    expect(at(4)).toBeGreaterThan(0.6);
    expect(at(4)).toBeLessThan(1);
    expect(at(3)).toBeGreaterThan(0.9);
    expect(at(7)).toBe(1);
  });

  it("第 2 幕停在第一个组合停稳的地方", () => {
    expect(restAt(tl, 2)).toBe(holdAt(tl, 0));
  });
});

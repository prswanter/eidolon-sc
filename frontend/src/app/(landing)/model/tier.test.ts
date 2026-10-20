import { describe, expect, it } from "vitest";

import { initialTier, qualityOf, tierReducer, type Signals, type Tier } from "./tier";

const desktop: Signals = { saveData: false, webgl: true, reducedMotion: false, hoverNone: false };

describe("initialTier: 首屏前定下的档位", () => {
  it("电脑上是完整档，触屏是简化档", () => {
    expect(initialTier(desktop)).toBe("full");
    expect(initialTier({ ...desktop, hoverNone: true })).toBe("lite");
  });

  it("开了「减少动态效果」是定格档，触屏也一样", () => {
    expect(initialTier({ ...desktop, reducedMotion: true })).toBe("reduced");
    expect(initialTier({ ...desktop, reducedMotion: true, hoverNone: true })).toBe("reduced");
  });

  it("省流量或者不支持 WebGL 是静态档，压过其余所有信号", () => {
    expect(initialTier({ ...desktop, saveData: true })).toBe("static");
    expect(initialTier({ ...desktop, webgl: false })).toBe("static");
    expect(initialTier({ saveData: true, webgl: false, reducedMotion: true, hoverNone: true })).toBe("static");
    expect(initialTier({ ...desktop, webgl: false, reducedMotion: true })).toBe("static");
  });
});

describe("qualityOf: 每档的画质", () => {
  it("色散采样次数按档位是 5、3、1，焦散只在完整档开", () => {
    expect(qualityOf("full", false)).toMatchObject({ canvas: true, animate: true, samples: 5, caustics: true, dprCap: 2 });
    expect(qualityOf("lite", true)).toMatchObject({ canvas: true, animate: true, samples: 3, caustics: false, dprCap: 1 });
    expect(qualityOf("basic", true)).toMatchObject({ canvas: true, animate: true, samples: 1, caustics: false, dprCap: 1 });
  });

  it("第 4 幕的手机：只有完整档画前玻璃和相机镜片的反光层，简化档和 basic 档关掉", () => {
    expect(qualityOf("full", false).reflections).toBe(true);
    expect(qualityOf("full", true).reflections).toBe(true);
    expect(qualityOf("lite", true).reflections).toBe(false);
    expect(qualityOf("basic", true).reflections).toBe(false);
  });

  it("第 5 幕的场景：只有完整档有阴影和泛光、粒子全量；简化档和 basic 档关掉阴影和泛光，粒子减半", () => {
    expect(qualityOf("full", false)).toMatchObject({ shadowsAndBloom: true, particles: 1 });
    expect(qualityOf("lite", true)).toMatchObject({ shadowsAndBloom: false, particles: 0.5 });
    expect(qualityOf("basic", true)).toMatchObject({ shadowsAndBloom: false, particles: 0.5 });
  });

  it("完整档在手机上 DPR 不超过 1.5", () => {
    expect(qualityOf("full", true).dprCap).toBe(1.5);
  });

  it("定格档只画一帧不动画；静态档不要画布", () => {
    expect(qualityOf("reduced", false)).toMatchObject({ canvas: true, animate: false, caustics: false });
    expect(qualityOf("static", false)).toMatchObject({ canvas: false, animate: false });
  });
});

describe("tierReducer: 运行中按帧降档，只降不升", () => {
  const slow = { type: "frames", averageMs: 50 } as const;
  const fast = { type: "frames", averageMs: 8 } as const;

  it("帧太慢时降一档：完整 → 简化 → 只剩 1 次采样，降到底就不再变", () => {
    let tier: Tier = "full";
    const seen: Tier[] = [];
    for (let n = 0; n < 4; n++) seen.push((tier = tierReducer(tier, slow)));
    expect(seen).toEqual(["lite", "basic", "basic", "basic"]);
  });

  it("完整档掉到 30 帧左右就降，简化档要更慢才降", () => {
    expect(tierReducer("full", { type: "frames", averageMs: 30 })).toBe("lite");
    expect(tierReducer("lite", { type: "frames", averageMs: 30 })).toBe("lite");
    expect(tierReducer("lite", { type: "frames", averageMs: 40 })).toBe("basic");
  });

  it("帧再快也不升档", () => {
    for (const tier of ["full", "lite", "basic", "reduced", "static"] as const) {
      expect(tierReducer(tier, fast)).toBe(tier);
    }
    let tier: Tier = tierReducer("full", slow);
    for (let n = 0; n < 10; n++) tier = tierReducer(tier, fast);
    expect(tier).toBe("lite");
  });

  it("定格档和静态档不按帧变", () => {
    expect(tierReducer("reduced", slow)).toBe("reduced");
    expect(tierReducer("static", slow)).toBe("static");
  });

  it("WebGL 上下文丢了或建不起来，任何档都退到静态档", () => {
    for (const tier of ["full", "lite", "basic", "reduced", "static"] as const) {
      expect(tierReducer(tier, { type: "lost" })).toBe("static");
    }
  });
});

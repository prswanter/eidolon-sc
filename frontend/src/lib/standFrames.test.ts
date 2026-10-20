import { describe, expect, it } from "vitest";

import { FrameGate, pixelRatio } from "@/lib/standFrames";

/** How many of the display's frames over one second the gate lets the stand draw. */
function drawnPerSecond(hz: number): number {
  const gate = new FrameGate();
  let drawn = 0;
  for (let i = 0; i < hz; i++) if (gate.shouldDraw((i * 1000) / hz)) drawn++;
  return drawn;
}

describe("FrameGate", () => {
  it("在 60Hz 的屏幕上每一帧都画", () => {
    expect(drawnPerSecond(60)).toBe(60);
  });

  it.each([90, 120, 144, 165, 240])("在 %iHz 的屏幕上最多画 60 帧，跳过多余的帧", (hz) => {
    const drawn = drawnPerSecond(hz);
    expect(drawn).toBeLessThanOrEqual(60);
    expect(drawn).toBeGreaterThanOrEqual(58);
  });

  it("在比 60Hz 慢的屏幕上有一帧画一帧", () => {
    expect(drawnPerSecond(30)).toBe(30);
    expect(drawnPerSecond(48)).toBe(48);
  });

  it("停了一阵（切后台、收起通话层）之后，回来的第一帧就画，不补画落下的帧", () => {
    const gate = new FrameGate();
    expect(gate.shouldDraw(0)).toBe(true);
    expect(gate.shouldDraw(16.7)).toBe(true);
    expect(gate.shouldDraw(5000)).toBe(true);
    expect(gate.shouldDraw(5008.3)).toBe(false);
    expect(gate.shouldDraw(5016.7)).toBe(true);
  });
});

describe("pixelRatio", () => {
  it("按设备的像素比渲染，但不超过 2", () => {
    expect(pixelRatio(1)).toBe(1);
    expect(pixelRatio(1.5)).toBe(1.5);
    expect(pixelRatio(2.75)).toBe(2);
    expect(pixelRatio(3)).toBe(2);
  });

  it("浏览器没给像素比时按 1", () => {
    expect(pixelRatio(0)).toBe(1);
    expect(pixelRatio(Number.NaN)).toBe(1);
  });
});

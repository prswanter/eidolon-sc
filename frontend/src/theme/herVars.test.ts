import { describe, expect, it } from "vitest";

import { imageColorScale } from "@/lib/imageColor";

import { herVars, ld } from "./herVars";

// herVars() 只是把 imageColorScale() 的结果按名字摆出来，没有按颜色分的分支：
// 用一种印象色就够了。各种印象色推算出的色阶是否达标，由 imageColor.test.ts 检查。
const COLOR = "#ffbad6";

describe("ld", () => {
  it("按系统明暗取一对颜色中的一个", () => {
    expect(ld({ light: "#ffffff", dark: "#000000" })).toBe("light-dark(#ffffff, #000000)");
  });
});

describe("herVars", () => {
  it("shadcn 的 primary、焦点环和 --her-* 都取自成对校验过的色阶，不直接给出官方原色", () => {
    const s = imageColorScale(COLOR);
    const vars = herVars(COLOR) as Record<string, string>;

    // shadcn：primary 换成她的强调色，焦点环换成她的记号色；不碰 --accent（那是悬停底色）。
    expect(vars["--primary"]).toBe(ld(s.accent));
    expect(vars["--primary-foreground"]).toBe(ld(s.onAccent));
    expect(vars["--ring"]).toBe(ld(s.mark));
    expect(vars["--her-wall"]).toBe(ld(s.wall));

    expect(vars["--her-mark"]).toBe(ld(s.mark));
    expect(vars["--her-button"]).toBe(ld(s.button.bg));
    expect(vars["--her-button-fg"]).toBe(ld(s.button.fg));
    expect(vars["--her-call-deep"]).toBe(s.call.deep);

    // 有的颜色在已经达标时可能恰好等于原色，但那是色阶校验过的结果，不是直接取用原色。
    expect(Object.keys(vars)).not.toContain("--her-raw");
    // 上一版的纸色、通话层上沿和状态线、光晕都不再注入（DESIGN.md「Secondary」）。
    for (const gone of ["--her-paper", "--her-paper-muted", "--her-call-top", "--her-call-glow", "--her-call-rule"])
      expect(Object.keys(vars)).not.toContain(gone);

    // 只注入 shadcn 的 primary 和焦点环、--her-* 变量；旧主题的 --color-* 强调色不再注入。
    const names = Object.keys(vars);
    expect(names.filter((n) => !n.startsWith("--her-")).sort()).toEqual(["--primary", "--primary-foreground", "--ring"]);
  });
});

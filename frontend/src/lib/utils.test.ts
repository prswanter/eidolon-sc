import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { cn } from "./utils";

// globals.css 的 @theme 里注册了 DESIGN.md 的具名字号、圆角和尺寸；cn 要认得它们，
// 否则 text-body 会被当成字色，和 text-foreground 撞在一起被合并掉。
describe("cn 认得项目的具名 token", () => {
  it("字号 token 和字色共存", () => {
    for (const size of ["list-title", "header", "row-name", "body", "japanese-line", "preview", "subtitle", "meta"]) {
      expect(cn(`text-${size}`, "text-foreground")).toBe(`text-${size} text-foreground`);
    }
  });

  it("后写的字号盖掉先写的字号", () => {
    expect(cn("text-body", "text-meta")).toBe("text-meta");
    expect(cn("text-sm", "text-body")).toBe("text-body");
  });

  it("圆角 token 参与圆角合并", () => {
    expect(cn("rounded-bubble", "rounded-md")).toBe("rounded-md");
    expect(cn("rounded-lg", "rounded-bubble")).toBe("rounded-bubble");
    expect(cn("rounded-bubble", "rounded-bubble-inner")).toBe("rounded-bubble-inner");
  });

  it("尺寸 token 参与尺寸合并", () => {
    expect(cn("size-8", "size-list-avatar")).toBe("size-list-avatar");
    expect(cn("h-10", "h-call-bar")).toBe("h-call-bar");
  });

  it("globals.css 里注册的每个字号、圆角、尺寸 token 都认得", () => {
    const css = readFileSync(resolve(__dirname, "../app/globals.css"), "utf8");
    const names = (prefix: string) =>
      [...css.matchAll(new RegExp(`^\\s*--${prefix}-([a-z0-9-]+?):`, "gm"))]
        .map((m) => m[1])
        .filter((name) => !name.includes("--"));
    for (const name of names("text")) {
      expect(cn(`text-${name}`, "text-foreground")).toBe(`text-${name} text-foreground`);
      expect(cn("text-sm", `text-${name}`)).toBe(`text-${name}`);
    }
    for (const name of names("radius")) expect(cn("rounded-none", `rounded-${name}`)).toBe(`rounded-${name}`);
    for (const name of names("spacing")) expect(cn("size-1", `size-${name}`)).toBe(`size-${name}`);
  });
});

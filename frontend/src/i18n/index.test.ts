import { describe, expect, it } from "vitest";

import { copy } from "./index";
import { zh } from "./zh";

/** 把文案树摊平成「路径 → 文案」，函数形式的文案用占位参数调用一次，第三项标明它是不是函数。
 * 键名里可以有点（模型名 `s2.1-pro`），路径只用来报错。 */
function leaves(tree: object, prefix = ""): [string, string, boolean][] {
  return Object.entries(tree).flatMap(([key, value]): [string, string, boolean][] => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") return [[path, value, false]];
    if (typeof value === "function") return [[path, String(value("甲", "乙", "丙")), true]];
    return leaves(value, path);
  });
}

describe("界面文案", () => {
  it("这次只有简体中文", () => {
    expect(copy).toBe(zh);
  });

  it("每一条都有字", () => {
    const empty = leaves(zh).filter(([, text]) => text.trim() === "");
    expect(empty).toEqual([]);
  });

  it("带参数的文案把参数放进句子里", () => {
    const withArgs = leaves(zh).filter(([, , called]) => called);
    for (const [path, text] of withArgs) expect(text, path).toMatch(/甲/);
  });
});

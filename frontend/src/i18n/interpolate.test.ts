import { describe, expect, it } from "vitest";

import { interpolate } from "./interpolate";

describe("interpolate", () => {
  it("把 {名字} 换成对应的值，值的位置由文案决定", () => {
    expect(interpolate("详情请看{privacy}和{terms}。", { privacy: 1, terms: 2 })).toEqual([
      "详情请看",
      1,
      "和",
      2,
      "。",
    ]);
  });

  it("值可以出现在开头和结尾，不留空字符串", () => {
    expect(interpolate("{a}与{b}", { a: "甲", b: "乙" })).toEqual(["甲", "与", "乙"]);
  });

  it("没有占位符时原样返回", () => {
    expect(interpolate("没有链接", {})).toEqual(["没有链接"]);
  });

  it("文案里有、值里没有的占位符原样留下，一眼能看出漏了", () => {
    expect(interpolate("去{nowhere}", {})).toEqual(["去", "{nowhere}"]);
  });
});

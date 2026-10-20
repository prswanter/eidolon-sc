import { describe, expect, it } from "vitest";

import { fontFaces, fontFamilies } from "./font-css.mjs";

// next/font 构建出来的样子：压缩过，字体名不带引号，最后是度量回退和两个 CSS Modules 类。
const built =
  "@font-face{font-family:Noto Sans SC;font-style:normal;font-weight:400;font-display:swap;" +
  'src:url(../media/a.woff2)format("woff2");unicode-range:U+1F1E9-1F1F5,U+1F21A}' +
  "@font-face{font-family:Noto Sans SC;font-style:normal;font-weight:700;font-display:swap;" +
  'src:url(../media/b.woff2)format("woff2");unicode-range:U+1F1E9-1F1F5,U+1F21A}' +
  "@font-face{font-family:Noto Sans SC Fallback;src:local(Arial);ascent-override:110.73%}" +
  ".x__className{font-family:Noto Sans SC,Noto Sans SC Fallback;font-style:normal}" +
  '.x__variable{--font-zh:"Noto Sans SC", "Noto Sans SC Fallback"}';

describe("fontFaces", () => {
  it("每条 @font-face 取出字体名、字重和 unicode-range，度量回退没有字重", () => {
    expect(fontFaces(built)).toEqual([
      { family: "Noto Sans SC", weight: "400", unicodeRange: "U+1F1E9-1F1F5,U+1F21A" },
      { family: "Noto Sans SC", weight: "700", unicodeRange: "U+1F1E9-1F1F5,U+1F21A" },
      { family: "Noto Sans SC Fallback", weight: null, unicodeRange: null },
    ]);
  });

  it("认得带引号的字体名和可变字体的字重范围", () => {
    const css = `@font-face {\n  font-family: 'LINE Seed JP';\n  font-weight: 100 900;\n  src: url(a.woff2);\n}`;
    expect(fontFaces(css)).toEqual([{ family: "LINE Seed JP", weight: "100 900", unicodeRange: null }]);
  });
});

describe("fontFamilies", () => {
  it("按字体名汇总条数、字重和切片数", () => {
    expect(fontFamilies(fontFaces(built))).toEqual([
      { family: "Noto Sans SC", faces: 2, weights: ["400", "700"], ranges: 1 },
      { family: "Noto Sans SC Fallback", faces: 1, weights: [], ranges: 0 },
    ]);
  });
});

// 读样式表里的 @font-face：应用页检查脚本（app-check.mjs）用它数字体 CSS 有几条、几个字重、几个切片。

/** 每条 @font-face 的字体名、字重（可变字体是「100 900」这样的范围）和 unicode-range；没写的是 null。 */
export function fontFaces(css) {
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => ({
    family: unquote(descriptor(body, "font-family")),
    weight: descriptor(body, "font-weight"),
    unicodeRange: descriptor(body, "unicode-range"),
  }));
}

/** 按字体名汇总：几条、哪几个字重、几个不同的切片（unicode-range）。 */
export function fontFamilies(faces) {
  const families = new Map();
  for (const face of faces) {
    const family = families.get(face.family) ?? { family: face.family, faces: 0, weights: new Set(), ranges: new Set() };
    family.faces++;
    if (face.weight) family.weights.add(face.weight);
    if (face.unicodeRange) family.ranges.add(face.unicodeRange);
    families.set(face.family, family);
  }
  return [...families.values()].map((f) => ({ ...f, weights: [...f.weights], ranges: f.ranges.size }));
}

function descriptor(body, name) {
  const match = body.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`));
  return match ? match[1].trim() : null;
}

function unquote(value) {
  return value?.replace(/^(['"])(.*)\1$/, "$2") ?? null;
}

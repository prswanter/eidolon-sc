// 落地页第 4 幕事先渲染好的手机图（.scratch/landing-call-phone 票 05）：定格档、静态档，和运动档里手机画布丢了
// WebGL 上下文时，第 4 幕显示这张图，来电界面叠在它的屏幕上。换了模型（scripts/landing-phone.mjs）、改了颜色、
// 光照（phoneLayer.ts）以后在 frontend/ 下重新跑：
//
//   node scripts/landing-phone-still.mjs
//
// 图就是页面上那台 3D 手机自己画的：无头浏览器里直接加载 phoneLayer.ts（这里起一个小服务器，供 three.js、
// 模型，和去掉类型标注的落地页源码），用同一个模型、同一套材质和光照，摆成停稳的姿态（落地页模型的 phoneAt），
// 熄屏画一帧，按机身的矩形四周各多留 STILL_MARGIN 裁下来，转成透明底的 WebP，写到 public/landing/phone/still.webp。
// 页面按同样的比例摆它（model/phone.ts 的 stillPhoneVars、landing.css 的 .lp-phone-img），屏幕正好落在来电界面
// 那块矩形下面。

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { stripTypeScriptTypes } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import sharp from "sharp";

import { STILL_MARGIN, phoneRest } from "../src/app/(landing)/model/phone.ts";

const frontend = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(frontend, "public", "landing", "phone", "still.webp");
/** 渲染时的视口和像素比：机身约 600 CSS 像素高，2 倍像素比下约 1200 像素，够 2 倍屏的电脑用。 */
const VIEWPORT = { width: 1600, height: 940 };
const DPR = 2;

const TYPES = { ".js": "text/javascript", ".gltf": "model/gltf+json", ".bin": "application/octet-stream", ".webp": "image/webp" };

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8">
<style>html,body{margin:0;background:transparent;overflow:hidden}canvas{display:block;width:100vw;height:100vh}</style>
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
</head><body><canvas></canvas>
<script type="module">
import { createPhoneLayer } from "/src/app/(landing)/phoneLayer.ts";
import { phoneAt } from "/src/app/(landing)/model/phone.ts";
import { qualityOf } from "/src/app/(landing)/model/tier.ts";
const vp = { w: innerWidth, h: innerHeight };
const layer = await createPhoneLayer(document.querySelector("canvas"), qualityOf("full", false));
layer.resize(vp.w, vp.h);
// 停稳、正面，熄屏。
layer.render({ ...phoneAt(vp, 1, { x: 0, y: 0 }), screen: 0 }, "#000000");
window.rendered = true;
</script></body></html>`;

/** 地址 → 文件：/src/ 和 /node_modules/ 在 frontend/ 下，/landing/ 在 public/ 下。.ts 去掉类型标注再给；不带扩展名的 import 补上 .ts。 */
async function serve(url) {
  const p = decodeURIComponent(new URL(url, "http://x").pathname);
  if (p === "/") return { type: "text/html", body: PAGE };
  const file = path.join(frontend, p.startsWith("/landing/") ? "public" : "", p);
  if (!file.startsWith(frontend)) return null;
  const ts = path.extname(file) === "" ? `${file}.ts` : file.endsWith(".ts") ? file : null;
  if (ts) return { type: TYPES[".js"], body: stripTypeScriptTypes(await readFile(ts, "utf8")) };
  return { type: TYPES[path.extname(file)] ?? "application/octet-stream", body: await readFile(file) };
}

const server = createServer(async (req, res) => {
  try {
    const r = await serve(req.url);
    if (!r) throw new Error("forbidden");
    res.writeHead(200, { "content-type": r.type });
    res.end(r.body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DPR });
  page.on("pageerror", (e) => console.error(e));
  await page.goto(`${origin}/`);
  await page.waitForFunction(() => window.rendered === true, null, { timeout: 60000 });

  const { bounds } = phoneRest({ w: VIEWPORT.width, h: VIEWPORT.height });
  const m = (bounds.bottom - bounds.top) * STILL_MARGIN;
  const clip = { x: bounds.left - m, y: bounds.top - m, width: bounds.right - bounds.left + 2 * m, height: bounds.bottom - bounds.top + 2 * m };
  const png = await page.screenshot({ clip, omitBackground: true });
  const info = await sharp(png).webp({ quality: 86, alphaQuality: 90, effort: 6 }).toFile(out);
  console.log(`写好了 ${path.relative(frontend, out)}：${info.width}×${info.height}，${(info.size / 1024).toFixed(0)} KB`);
} finally {
  await browser.close();
  server.close();
}

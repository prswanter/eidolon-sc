// 落地页第 5 幕事先渲染好的终局全景图（.scratch/landing-memory-3d 票 06）：定格档、静态档，和运动档里场景画布丢了
// WebGL 上下文、建不起来时，第 5 幕显示这张图。图上是四位偶像的体素小人，所以它和体素文件一样放在存储桶、不进仓库
// （ADR-0003 的 2026-10-16 修订）。改了场景（memoryLayer.ts、memoryDressing.ts、memoryKit.ts）、布景或那件事的终局
// （model/memory.ts、model/memoryStory.ts）、换了体素文件以后，在 frontend/ 下重新跑，再上传到存储桶的
// landing-memory/still.webp（docs/deploy.md「第 5 幕的静止图」）：
//
//   node scripts/landing-memory-still.mjs --out <文件> [--backend http://localhost:8000]
//
// 图就是页面上那块 3D 画布自己画的：无头浏览器里直接加载 memoryLayer.ts（这里起一个小服务器，供 three.js 和去掉类型
// 标注的落地页源码），用同一套场景代码、画质按完整档（阴影、泛光、粒子全量），摆成这一幕的终局全景（落地页模型幕内
// 进度 1 的镜头和那件事）画一帧。演员和页面一样取落地页文案的 cast 里在名单上的几位，名字、印象色和体素文件的地址从
// 后端的 /api/characters 拿：后端要配好 EIDOLON_STAND_ASSETS_URL，体素文件要已经在存储桶里（存储桶要允许跨域读）；
// 有哪位的体素文件加载不到就不出图。布景里会动的东西只看时刻、随机数是固定的种子，给定一个时刻（MOMENT）每次出的图
// 都一样。尺寸是 model/memory.ts 的 MEMORY_STILL，页面按它的比例排这张图。

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { stripTypeScriptTypes } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { chromium } from "playwright";
import sharp from "sharp";

import { MEMORY_STILL } from "../src/app/(landing)/model/memory.ts";
import { zh } from "../src/i18n/zh.ts";

const { values: args } = parseArgs({ options: { out: { type: "string" }, backend: { type: "string", default: "http://localhost:8000" } } });
if (!args.out) {
  console.error("用法：node scripts/landing-memory-still.mjs --out <文件> [--backend http://localhost:8000]");
  process.exit(2);
}
const out = path.resolve(args.out);
const frontend = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
/** 渲染时的视口和像素比：电脑上的取景，1.5 倍像素比下正好是 MEMORY_STILL。 */
const DPR = 1.5;
const VIEWPORT = { width: MEMORY_STILL.w / DPR, height: MEMORY_STILL.h / DPR };
/** 画哪一刻（秒）：花瓣飘在半空，云转了一点。 */
const MOMENT = 12;

// 第 5 幕的演员，和 Landing.tsx 的 actorsOf 一样：文案指定的几位里在名单上的，连同她站的岛、印象色和体素文件。
const characters = await fetch(`${args.backend.replace(/\/$/, "")}/api/characters`).then((res) => {
  if (!res.ok) throw new Error(`后端的角色列表 ${res.status}`);
  return res.json();
});
const actors = zh.landing.act5.cast.flatMap((id, island) => {
  const her = characters.find((c) => c.id === id);
  return her ? [{ id, name: her.name, color: her.color.toLowerCase(), voxels: her.voxels_url, island }] : [];
});
const absent = actors.filter((a) => !a.voxels).map((a) => a.id);
if (absent.length) throw new Error(`没有体素文件的地址（后端没配 EIDOLON_STAND_ASSETS_URL？）：${absent.join("、")}`);

const TYPES = { ".js": "text/javascript" };

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8">
<style>html,body{margin:0;background:#000;overflow:hidden}canvas{display:block;width:100vw;height:100vh}</style>
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
</head><body><canvas></canvas>
<script type="module">
import { createMemoryLayer } from "/src/app/(landing)/memoryLayer.ts";
import { memoryAt } from "/src/app/(landing)/model/memory.ts";
import { storyAt } from "/src/app/(landing)/model/memoryStory.ts";
import { qualityOf } from "/src/app/(landing)/model/tier.ts";
const actors = ${JSON.stringify(actors)};
const vp = { w: innerWidth, h: innerHeight };
const layer = await createMemoryLayer(document.querySelector("canvas"), qualityOf("full", false), actors, "sans-serif");
const standIns = await layer.standIns;
layer.resize(vp.w, vp.h);
// 终局全景：四根记忆柱顶上都是发送那一位颜色的方块，连线连起来。
const memory = memoryAt(1, vp, 1);
layer.render(memory, storyAt(1, memory.camera, actors.map((a) => a.island)), ${MOMENT});
window.rendered = standIns.map((a) => a.id);
</script></body></html>`;

/** 地址 → 文件：/src/ 和 /node_modules/ 在 frontend/ 下。.ts 去掉类型标注再给；不带扩展名的 import 补上 .ts。 */
async function serve(url) {
  const p = decodeURIComponent(new URL(url, "http://x").pathname);
  if (p === "/") return { type: "text/html", body: PAGE };
  const file = path.join(frontend, p);
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
  const standIns = await (await page.waitForFunction(() => window.rendered, null, { timeout: 120000 })).jsonValue();
  if (standIns.length) throw new Error(`体素文件加载不到，不出图：${standIns.join("、")}`);

  const png = await page.screenshot();
  const info = await sharp(png).webp({ quality: 82, effort: 6 }).toFile(out);
  console.log(`写好了 ${out}：${info.width}×${info.height}，${(info.size / 1024).toFixed(0)} KB`);
} finally {
  await browser.close();
  server.close();
}

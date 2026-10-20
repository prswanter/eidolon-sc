// 落地页的验收脚本（.scratch/landing-page/spec.md「Testing Decisions」第 5 条）：人工运行，不进 vitest。
// 沿用原型分支的测量脚本（prototype/landing-page 的 scripts/landing-prototype-measure.mjs）。
//
//   npm run build && BACKEND_URL=http://localhost:8000 npm run start   # 构建版，不用 dev
//   node scripts/landing-check.mjs [origin] [runs]                      # 默认 http://localhost:3000，3 轮
//
// 检查这几项，全部通过时退出码为 0：
//   1. `/` 的分流：不带会话是落地页；带有效会话重定向到 `/conversations`；带过期会话仍是落地页。
//      `/about` 带有效会话不重定向，入口是「继续」，链到 `/conversations`；canonical 指向 `/`。
//      有效会话用开发登录取（后端要开 EIDOLON_DEV_LOGIN=1，会建一位叫 landing-check 的用户），
//      或者把一个有效会话的 cookie 值放进环境变量 LANDING_SESSION。两者都没有时跳过这几项。
//   2. 手机 4G 节流下的 LCP 不超过 2.5 秒（取几轮的中位数），LCP 元素是标题文字（#lp-title）。
//   3. 落地页自身的首屏 JS 压缩后不超过 50 KB，不含框架基线。基线是 `.next/build-manifest.json` 的
//      rootMainFiles 和 polyfillFiles（每页都有的 Next + React，约 161 KB），所以要对着这份构建跑；
//      测别处的部署时用 LANDING_MANIFEST 指向那份构建的 build-manifest.json。光层（OGL）在 load 之后、
//      浏览器空闲时才加载，不算首屏，另外报它的大小。第 4 幕的手机（three.js 和模型）滚到第 3 幕附近才加载，
//      也不算首屏，另外报大小。第 5 幕的场景代码和几位演员的体素文件滚到第 5 幕前约一屏才加载（three.js 和手机共用
//      一个包），同样另外报大小。
//   4. 光层：完整档里 OGL 画好第一帧后淡入、首屏 CSS 画的白光同时淡出，标题一直可见；CSS 白光的尽头
//      就是落地页模型里白光的锚点（电脑上画面 46% 宽、66% 高处，竖屏是正中、30% 高处），两束光重合。
//      完整档在几个滚动位置各截一张图。
//   5. 「减少动态效果」档（浏览器模拟 prefers-reduced-motion）：不加载 Lenis，着色器只画一帧定格的
//      第 1 幕，等一会儿、滚一下画面都不变；截一张图。
//   6. 「不支持 WebGL」档（Chromium 关掉 WebGL 启动）：静态档，load 之后不再加载任何脚本（没有画布、
//      没有 Lenis），SVG 画的光在；第 0、1 幕各截一张图。
//   7. 第 2 到 7 幕：完整档里电脑、竖屏手机各截几张（光谱归队、停在某个组合、聚焦、她说日语、来电、记忆、
//      诚实事项、开始），停在某个组合时底部的组合名就是这个组合；第 4 幕的手机转身几个位置（光、交接、侧面、
//      背面、正面、来电，往回滚再截一次背面），来电界面在落地页模型给的屏幕矩形里，标题在手机上方、正文在
//      下方，响铃时手机和界面一起振动、接通后不振动；电脑上把「滑动接听」拖过一半（拖不到一半不接）、手机上点一下
//      就接通，截接通、通话结束；挂断键给出「通话结束」和时长，约 1.5 秒后回到来电；电脑上用键盘回车接听、Tab 到
//      挂断键回车挂断，焦点留在状态那一行；手机画布丢了 WebGL 上下文时换成事先渲染好的手机图，屏幕还在图上的屏幕处，
//      落地页不降档；第 5 幕（3D 场景）某位的体素文件加载不到时她的位置是印象色方块加名字（截图看）；用显卡（软件渲染时
//      截图照截、帧耗时和档位跳过）：电脑（完整档）、竖屏手机（简化档）在九个节拍各截一张、往回滚截一张，档位不降，电脑上
//      截第 4、5、6 幕的衔接，场景画布丢了上下文时收起、换成事先渲染好的全景图（存储桶里有的话）、几句话收起来、完整档不降；手机 CPU 降速 4 倍时停着和滚过这一幕的帧耗时不超过简化档降档的门槛；截完整档、简化档的开场全景（完整档有
//      阴影和泛光，简化档没有、粒子少一半），简化档停在开场全景量一段帧耗时，不超过它降档的门槛；
//      第 7 幕的行动按钮弹出登录面板。定格档、静态档各截这几幕的静止版式，幕名轨跟着滚动走；第 4 幕
//      （电脑、竖屏手机）是事先渲染好的手机图，屏幕在落地页模型停稳时的屏幕矩形里，截来电和接通，键盘回车接听、Tab 到
//      挂断键回车挂断；静态档接通后卡图留着、没有立绘，load 之后到挂断为止不加载任何脚本。第 5 幕（电脑、竖屏手机）是
//      事先渲染好的全景图（存储桶里有的话）加按顺序的几句话，静态档滚到这一幕也不加载脚本；存储桶里没有图（拦下它，回 404）
//      时只有文字、没有破图。滚动位置按落地页模型的
//      时间线（model/timeline.ts）算，和页面同一个出处。
//   8. 键盘：完整档、定格档、静态档从页面开头一路按 Tab 走到页脚最后一个链接，每一处焦点都在画面上、看得见（不是透明的）。
//   9. 页内查找：完整档里按下 Ctrl+F 再跳到几个文本片段（和页内查找一样会把 until-found 的文字找出来），
//      找到的字在画面上、看得见：画面外组合里的名牌、第 3 幕的一句字幕、第 5 幕气泡里的一句、第 7 幕的标题。没在查找时，
//      跟着滚动淡入淡出的文字（看不见的那些也算）都在无障碍树上，读屏器读得到；第 5 幕的标题、正文、几句话和最后一句
//      在无障碍树上按出现的顺序排。
//  10. 浏览器后退：滚到一半点进隐私政策再后退，回到原来的位置。
//  11. 按帧降档：完整档在 CPU 降速的小窗口里跑一会儿，档位只降不升。
//   截图写到 screenshots/landing-check/（gitignore 掉的），或者环境变量 LANDING_SHOTS 指定的目录。
//
// 手机 4G 的节流和视口见 phone-4g.mjs（和应用页检查 app-check.mjs 共用）。

import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import { BEATS } from "../src/app/(landing)/model/memoryStory.ts";
import { phoneRest, PHONE_MM, STILL_MARGIN } from "../src/app/(landing)/model/phone.ts";
import { ACT1_SCREENS, holdAt, restAt, spanOf, timelineOf } from "../src/app/(landing)/model/timeline.ts";
import { SLOW_MS } from "../src/app/(landing)/model/tier.ts";
import { lastLcp, medianByLcp, phone4gPage } from "./phone-4g.mjs";

const origin = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const runs = Number(process.argv[3] ?? 3);
const LCP_BUDGET_MS = 2500;
const OWN_JS_BUDGET_KB = 50;

const frontend = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifestPath = process.env.LANDING_MANIFEST ?? path.join(frontend, ".next", "build-manifest.json");

const results = [];
function report(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok === null ? "跳过" : ok ? "通过" : "失败"}  ${name}${detail ? `：${detail}` : ""}`);
}

/** 等光层淡入（LightStage 给 .lp-root 加上 lp-gl-on），返回从调用起等了多少毫秒；等不到是 null。 */
async function glOn(page, timeout = 20000) {
  const t0 = Date.now();
  return page
    .waitForFunction(() => document.querySelector(".lp-root")?.classList.contains("lp-gl-on"), null, { timeout })
    .then(
      () => Date.now() - t0,
      () => null,
    );
}

const tierOf = (page) => page.evaluate(() => document.documentElement.dataset.lpTier ?? null);

const browser = await chromium.launch();

// —— 1. 分流

/** 打开 `pathname`，返回最后停在哪个地址、是不是落地页、右上角入口。 */
async function visit(context, pathname) {
  const page = await context.newPage();
  await page.goto(`${origin}${pathname}`, { waitUntil: "domcontentloaded" });
  const url = new URL(page.url());
  const isLanding = (await page.locator("#lp-title").count()) > 0;
  // 入口（LandingEntry）：访客是弹出登录面板的按钮，已登录是回对话列表的链接。页首还有仓库链接和第 2 幕的声音开关。
  const entry = isLanding ? page.locator('.lp-top > button[aria-haspopup="dialog"], .lp-top > a[href="/conversations"]') : null;
  const seen = {
    path: url.pathname,
    isLanding,
    entryText: entry ? (await entry.innerText()).trim() : null,
    entryHref: entry ? await entry.getAttribute("href") : null,
    canonical: isLanding ? await page.locator('link[rel="canonical"]').getAttribute("href").catch(() => null) : null,
  };
  await page.close();
  return seen;
}

/** 一个带有效会话的上下文；拿不到时是 null。 */
async function signedInContext() {
  const context = await browser.newContext();
  if (process.env.LANDING_SESSION) {
    await context.addCookies([{ name: "eidolon_session", value: process.env.LANDING_SESSION, url: origin }]);
    return context;
  }
  const res = await context.request.post(`${origin}/api/auth/dev-login`, {
    data: { name: "landing-check" },
    headers: { origin },
  });
  if (res.ok()) return context;
  await context.close();
  return null;
}

{
  const visitor = await browser.newContext();
  const seen = await visit(visitor, "/");
  report("不带会话打开 /，是落地页", seen.path === "/" && seen.isLanding, `停在 ${seen.path}`);
  report("访客的入口是「登录」", seen.entryText === "登录", seen.entryText ?? "没有入口");
  const about = await visit(visitor, "/about");
  // 落地页的元数据按请求的地址拼成绝对地址（layout.tsx 的 metadataBase），Next 会去掉根路径末尾的斜杠。
  const canonicalPath = about.canonical && new URL(about.canonical, origin);
  report("/about 的 canonical 指向 /", canonicalPath?.origin === origin && canonicalPath.pathname === "/", about.canonical ?? "没有");
  await visitor.close();

  const expired = await browser.newContext();
  await expired.addCookies([{ name: "eidolon_session", value: "landing-check-expired", url: origin }]);
  const stale = await visit(expired, "/");
  report("带过期会话打开 /，仍是落地页", stale.path === "/" && stale.isLanding, `停在 ${stale.path}`);
  await expired.close();

  const user = await signedInContext();
  if (user) {
    const home = await visit(user, "/");
    report("带有效会话打开 /，重定向到 /conversations", home.path === "/conversations", `停在 ${home.path}`);
    const back = await visit(user, "/about");
    report(
      "带有效会话打开 /about，不重定向，入口是「继续」，链到 /conversations",
      back.path === "/about" && back.entryText === "继续" && back.entryHref === "/conversations",
      `停在 ${back.path}，入口「${back.entryText}」→ ${back.entryHref}`,
    );
    await user.close();
  } else {
    report("带有效会话的分流", null, "后端没开开发登录，也没有 LANDING_SESSION");
  }
}

// —— 2、3. 手机 4G 下的 LCP 和首屏 JS

let baseline = null;
try {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  baseline = new Set([...manifest.rootMainFiles, ...manifest.polyfillFiles].map((f) => `/_next/${f}`));
} catch {
  console.log(`（读不到 ${manifestPath}，量不了落地页自身的首屏 JS）`);
}

const measures = [];
for (let n = 0; n < runs; n++) {
  const { context, page, requests } = await phone4gPage(browser);

  await page.goto(`${origin}/`, { waitUntil: "load", timeout: 120000 });
  // 等光层加载完、淡入（浏览器空闲以后），顺便量它的大小。
  const glAt = await glOn(page, 60000);
  await page.waitForTimeout(1500);
  const lcp = await lastLcp(page);
  const loadEnd = await page.evaluate(() => performance.getEntriesByType("navigation")[0].loadEventEnd);

  // 首屏 JS = load 事件之前请求的脚本；之后的（空闲时加载的光层、点了才加载的登录面板）不算。
  const all = [...requests.values()];
  const loadAt = Math.min(...all.map((r) => r.t)) + loadEnd / 1000;
  const scripts = all.filter((r) => r.type === "Script" && r.bytes);
  const initial = scripts.filter((r) => r.t <= loadAt);
  const later = scripts.filter((r) => r.t > loadAt);
  const own = baseline ? initial.filter((r) => !baseline.has(new URL(r.url).pathname)) : [];
  const kB = (xs) => +(xs.reduce((a, r) => a + r.bytes, 0) / 1024).toFixed(1);
  measures.push({
    lcp,
    initialKB: kB(initial),
    ownKB: kB(own),
    own: own.map((r) => new URL(r.url).pathname),
    laterKB: kB(later),
    glAt,
    tier: await page.evaluate(() => document.documentElement.dataset.lpTier),
  });
  await context.close();
}

const lcpMs = medianByLcp(measures).lcp?.t ?? NaN;
report(`手机 4G 下的 LCP 不超过 ${LCP_BUDGET_MS} ms（${runs} 轮的中位数）`, lcpMs <= LCP_BUDGET_MS, `${lcpMs.toFixed(0)} ms`);
report(
  "LCP 元素是标题文字",
  measures.every((m) => m.lcp?.id === "lp-title"),
  measures.map((m) => m.lcp?.id || m.lcp?.text || "无").join("、"),
);
if (baseline) {
  const ownKB = Math.max(...measures.map((m) => m.ownKB));
  report(
    `落地页自身的首屏 JS 不超过 ${OWN_JS_BUDGET_KB} KB（压缩后，不含框架基线）`,
    ownKB <= OWN_JS_BUDGET_KB,
    `${ownKB} KB，整页 ${measures[0].initialKB} KB；${measures[0].own.join(" ")}`,
  );
} else {
  report("落地页自身的首屏 JS", null, "没有框架基线");
}
report(
  "手机上光层在 load 之后、空闲时才加载（不算首屏）",
  measures.every((m) => m.glAt !== null),
  measures.map((m) => `${m.tier} 档，load 后 ${m.glAt ?? "∞"} ms 淡入，之后加载 ${m.laterKB} KB`).join("；"),
);

// —— 4–6. 光层和两个降级档

const shots = process.env.LANDING_SHOTS ?? path.join(frontend, "screenshots", "landing-check");
mkdirSync(shots, { recursive: true });
const DESKTOP = { viewport: { width: 1440, height: 900 } };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

/** 滚到第 1 幕幕内进度 p 的地方（运动版式）；静止版式下滚到第 1 幕那一屏。 */
async function toAct1(page, p) {
  await page.evaluate(
    ({ p, act1 }) => {
      const wrap = document.querySelector(".lp-stage-wrap");
      const top = wrap.getBoundingClientRect().top + window.scrollY;
      const motion = document.documentElement.dataset.lpLayout === "motion";
      window.scrollTo(0, motion ? top + p * act1 * window.innerHeight : top);
    },
    { p, act1: ACT1_SCREENS },
  );
  await page.waitForTimeout(1200);
}

/** 这一页的时间线：组合数从页面上数。 */
const timelineOn = async (page) => timelineOf(await page.locator(".lp-seg").count());

/**
 * 运动版式里滚到时间线上第 `screens` 屏（LightStage 的 scrollOf 反过来：钉住的一段一一对应，照常往上走的
 * 一段按比例，它的最后一屏一一对应）。
 */
async function toScreens(page, screens) {
  const { sections } = await timelineOn(page);
  await page.evaluate(
    ({ screens, sections }) => {
      const els = [...document.querySelectorAll("[data-lp-section]")];
      const s = sections.find((s) => screens < s.from + s.screens) ?? sections.at(-1);
      const el = els[s.index];
      const top = el.getBoundingClientRect().top + window.scrollY;
      const vh = window.innerHeight;
      const into = screens - s.from;
      let y;
      if (s.pinned || el.offsetHeight <= vh) y = top + (into / s.screens) * el.offsetHeight;
      else if (into < s.screens - 1) y = top + (into / (s.screens - 1)) * (el.offsetHeight - vh);
      else y = top + el.offsetHeight - vh + (into - s.screens + 1) * vh;
      window.scrollTo(0, y);
    },
    { screens, sections },
  );
  await page.waitForTimeout(1600);
}

/** 停在第 5 幕前半屏，等它的场景画布建好、体素小人站上去。 */
async function act5Ready(page, act5) {
  await toScreens(page, act5.from - 0.5);
  await page.waitForFunction(() => !!document.querySelector(".lp-memory-canvas"), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(5000);
}

/** CSS 白光的尽头在不在落地页模型的锚点上（差不到 1.5 px）。 */
async function beamAnchored(page) {
  const b = await page.evaluate(() => {
    const r = document.querySelector(".lp-beam").getBoundingClientRect();
    return { right: r.right, bottom: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: document.documentElement.clientWidth, h: window.innerHeight };
  });
  const portrait = b.h > b.w * 1.1;
  const [x, y, ax, ay] = portrait ? [b.cx, b.bottom, b.w * 0.5, b.h * 0.3] : [b.right, b.cy, b.w * 0.46, b.h * 0.66];
  return { ok: Math.abs(x - ax) <= 1.5 && Math.abs(y - ay) <= 1.5, detail: `尽头 (${x.toFixed(1)}, ${y.toFixed(1)})，锚点 (${ax.toFixed(1)}, ${ay.toFixed(1)})` };
}

/**
 * 平均帧耗时：3 秒里相邻两帧的间隔（落地页按帧降档量的也是它）。受屏幕刷新率封顶，只说明没慢到降档，量不出一帧实际
 * 画了多久。`scrollAct5` 时这 3 秒从第 5 幕钉住那一段的开头匀速滚到结尾，否则停着量。
 */
const frameMs = (page, { scrollAct5 = false } = {}) =>
  page.evaluate(
    (through) =>
      new Promise((resolve) => {
        const wrap = document.querySelector(".lp-memory");
        const from = wrap.getBoundingClientRect().top + window.scrollY;
        const to = from + wrap.offsetHeight - innerHeight;
        const t = [];
        const step = (now) => {
          t.push(now);
          const f = (now - t[0]) / 3000;
          if (through) window.scrollTo(0, from + (to - from) * Math.min(1, f));
          if (f < 1) requestAnimationFrame(step);
          else resolve((t.at(-1) - t[0]) / (t.length - 1));
        };
        requestAnimationFrame(step);
      }),
    scrollAct5,
  );

/** 页面上的报错和警告（OGL 缺 uniform、React 水合不一致等都会打在控制台上）。 */
function watchConsole(page) {
  const seen = [];
  page.on("console", (m) => ["error", "warning"].includes(m.type()) && seen.push(`${m.type()}: ${m.text().slice(0, 120)}`));
  page.on("pageerror", (e) => seen.push(`pageerror: ${e.message.slice(0, 120)}`));
  return seen;
}

{
  const complaints = [];
  for (const [name, options] of [
    ["电脑", DESKTOP],
    ["竖屏手机", PHONE],
  ]) {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    complaints.push(watchConsole(page));
    await page.goto(`${origin}/`, { waitUntil: "load" });
    const anchored = await beamAnchored(page);
    report(`${name}：首屏 CSS 白光的尽头就是光层白光的锚点`, anchored.ok, anchored.detail);
    if (name === "电脑") {
      await page.screenshot({ path: path.join(shots, "full-act0-css.png") });
      const at = await glOn(page);
      await page.waitForTimeout(1200);
      const fade = await page.evaluate(() => {
        const opacity = (s) => getComputedStyle(document.querySelector(s)).opacity;
        const title = document.querySelector("#lp-title").getBoundingClientRect();
        return { beam: opacity(".lp-beam"), canvas: opacity(".lp-canvas"), title: opacity("#lp-title"), titleTop: title.top };
      });
      report(
        "完整档：光层画好后淡入，CSS 白光淡出，标题一直可见",
        at !== null && fade.beam === "0" && fade.canvas === "1" && fade.title === "1" && fade.titleTop >= 0,
        `${await tierOf(page)} 档，load 后 ${at ?? "∞"} ms 淡入；CSS 白光 ${fade.beam}、画布 ${fade.canvas}、标题 ${fade.title}`,
      );
      await page.screenshot({ path: path.join(shots, "full-act0-gl.png") });
      for (const p of [0.08, 0.3, 0.55, 1]) {
        await toAct1(page, p);
        await page.screenshot({ path: path.join(shots, `full-act1-${Math.round(p * 100)}.png`) });
      }
    } else {
      await glOn(page);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(shots, "phone-act0.png") });
      for (const p of [0.3, 1]) {
        await toAct1(page, p);
        await page.screenshot({ path: path.join(shots, `phone-act1-${Math.round(p * 100)}.png`) });
      }
    }
    await context.close();
  }

  // 「减少动态效果」档。
  const reduced = await browser.newContext({ ...DESKTOP, reducedMotion: "reduce" });
  const page = await reduced.newPage();
  complaints.push(watchConsole(page));
  await page.goto(`${origin}/`, { waitUntil: "load" });
  const at = await glOn(page);
  const lenis = await page.evaluate(() => document.documentElement.classList.contains("lenis"));
  report("「减少动态效果」：定格档，不加载 Lenis，着色器画出定格的一帧", (await tierOf(page)) === "reduced" && !lenis && at !== null, `${await tierOf(page)} 档，Lenis ${lenis ? "在" : "没有"}，load 后 ${at ?? "∞"} ms 画好`);
  await toAct1(page, 0);
  const before = await page.locator(".lp-act1").screenshot();
  await page.mouse.move(200, 200);
  await page.mouse.wheel(0, 160);
  await page.waitForTimeout(1500);
  const after = await page.locator(".lp-act1").screenshot();
  report("「减少动态效果」：等一会儿、动一下指针、滚一下，第 1 幕的画面都不变", before.equals(after));
  await toAct1(page, 0);
  await page.screenshot({ path: path.join(shots, "reduced-act1.png") });
  await reduced.close();
  const all = complaints.flat();
  report("完整档、简化档和定格档的控制台没有报错和警告", all.length === 0, all.join("；") || "没有");
}

{
  // 「不支持 WebGL」档：关掉 WebGL 启动的 Chromium。
  const noGl = await chromium.launch({ args: ["--disable-3d-apis", "--disable-webgl", "--disable-webgl2"] });
  const context = await noGl.newContext(DESKTOP);
  const page = await context.newPage();
  const scripts = [];
  let loaded = false;
  page.on("request", (r) => loaded && r.resourceType() === "script" && scripts.push(new URL(r.url()).pathname));
  await page.goto(`${origin}/`, { waitUntil: "load" });
  loaded = true;
  await page.waitForTimeout(3000);
  const state = await page.evaluate(() => ({
    tier: document.documentElement.dataset.lpTier,
    why: document.documentElement.dataset.lpWhy,
    gl: document.querySelector(".lp-root").classList.contains("lp-gl-on"),
    canvas: getComputedStyle(document.querySelector(".lp-canvas")).display,
  }));
  await page.screenshot({ path: path.join(shots, "static-act0.png") });
  await toAct1(page, 0);
  const svg = await page.locator(".lp-static-landscape").isVisible();
  await page.screenshot({ path: path.join(shots, "static-act1.png") });
  report(
    "「不支持 WebGL」：静态档，不显示画布，load 之后不再加载脚本，SVG 画的光在",
    state.tier === "static" && !state.gl && state.canvas === "none" && scripts.length === 0 && svg,
    `${state.tier} 档（${state.why}），画布 ${state.canvas}，load 之后加载的脚本 ${scripts.length ? scripts.join(" ") : "没有"}，SVG ${svg ? "在" : "不在"}`,
  );
  await noGl.close();
}
// —— 3b. 第 4 幕的手机：three.js 和模型不算首屏，滚到第 3 幕附近才加载，另外报大小
{
  const { context, page, requests } = await phone4gPage(browser);
  await page.goto(`${origin}/`, { waitUntil: "load", timeout: 120000 });
  await glOn(page, 60000);
  await page.waitForTimeout(1500);
  const before = new Set([...requests.keys()]);
  const early = [...requests.values()].filter((r) => r.url.includes("/landing/phone/"));
  const tl = timelineOf(await page.locator(".lp-seg").count());
  const act3 = spanOf(tl, 3);
  if (act3) {
    await toScreens(page, act3.from + 0.3);
    const loaded = await page
      .waitForFunction(() => !!document.querySelector(".lp-phone-canvas") && performance.getEntriesByType("resource").some((e) => e.name.endsWith("/landing/phone/phone.bin") && e.responseEnd > 0), null, { timeout: 90000 })
      .then(
        () => true,
        () => false,
      );
    await page.waitForTimeout(3000);
    const later = [...requests.entries()].filter(([id]) => !before.has(id)).map(([, r]) => r);
    const kB = (xs) => +(xs.reduce((a, r) => a + (r.bytes ?? 0), 0) / 1024).toFixed(1);
    const scripts = later.filter((r) => r.type === "Script");
    const model = later.filter((r) => r.url.includes("/landing/phone/"));
    report(
      "第 4 幕的手机：three.js 和模型在首屏之后、滚到第 3 幕附近才加载（不算首屏）",
      early.length === 0 && loaded && scripts.length > 0 && model.length > 0,
      `首屏时模型 ${early.length ? "已经在下载" : "没有下载"}；滚到第 3 幕后脚本 ${kB(scripts)} KB（${scripts.map((r) => new URL(r.url).pathname.split("/").at(-1)).join(" ")}），模型 ${kB(model)} KB（${model.length} 个文件，传输大小）`,
    );
  }
  await context.close();
}

// —— 3c. 第 5 幕的场景：场景代码和体素文件不算首屏，滚到第 5 幕前约一屏才加载，另外报大小
{
  const { context, page, requests } = await phone4gPage(browser);
  await page.goto(`${origin}/`, { waitUntil: "load", timeout: 120000 });
  await glOn(page, 60000);
  await page.waitForTimeout(1500);
  const before = new Set([...requests.keys()]);
  const early = [...requests.values()].filter((r) => r.url.includes("/landing-voxels/"));
  const tl = timelineOf(await page.locator(".lp-seg").count());
  const act5 = spanOf(tl, 5);
  // 先经过第 4 幕：three.js 在那里已经随手机下载了，这里量的是第 5 幕自己多出来的。
  const act4 = spanOf(tl, 4);
  if (act4) {
    await toScreens(page, act4.from + 0.5);
    await page.waitForTimeout(8000);
  }
  const atAct4 = new Set([...requests.keys()]);
  await toScreens(page, act5.from - 0.5);
  const loaded = await page
    .waitForFunction(() => !!document.querySelector(".lp-memory-canvas") && Number(getComputedStyle(document.querySelector(".lp-memory")).getPropertyValue("--lp-memory")) > 0, null, { timeout: 90000 })
    .then(
      () => true,
      () => false,
    );
  await page.waitForTimeout(8000);
  const kB = (xs) => +(xs.reduce((a, r) => a + (r.bytes ?? 0), 0) / 1024).toFixed(1);
  const later = [...requests.entries()].filter(([id]) => !atAct4.has(id)).map(([, r]) => r);
  const scripts = later.filter((r) => r.type === "Script");
  const voxels = [...requests.entries()].filter(([id, r]) => !before.has(id) && r.url.includes("/landing-voxels/")).map(([, r]) => r);
  report(
    "第 5 幕的场景：场景代码和体素文件在首屏之后、滚到第 5 幕前约一屏才加载（不算首屏）",
    early.length === 0 && loaded && scripts.length > 0,
    `首屏时体素文件 ${early.length ? "已经在下载" : "没有下载"}；第 5 幕的场景代码 ${kB(scripts)} KB（${scripts.map((r) => new URL(r.url).pathname.split("/").at(-1)).join(" ")}），体素文件 ${kB(voxels)} KB（${voxels.length} 个，传输大小${voxels.length ? "" : "；存储桶里没有体素文件或没配存储桶地址"}）`,
  );
  await context.close();
}

// —— 7. 第 2 到 7 幕

{
  const complaints = [];
  for (const [name, options] of [
    ["full", DESKTOP],
    ["phone", PHONE],
  ]) {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    complaints.push(watchConsole(page));
    await page.goto(`${origin}/?tier=${name === "full" ? "full" : "lite"}`, { waitUntil: "load" });
    await glOn(page);
    const tl = await timelineOn(page);
    const act2 = spanOf(tl, 2);
    const act3 = spanOf(tl, 3);
    const act4 = spanOf(tl, 4);
    const act5 = spanOf(tl, 5);
    const act7 = spanOf(tl, 7);
    if (act2) {
      await toScreens(page, act2.from + 0.5);
      await page.screenshot({ path: path.join(shots, `${name}-act2-regroup.png`) });
      const units = await page.locator(".lp-seg-name").allInnerTexts();
      const u = Math.min(1, units.length - 1);
      await toScreens(page, holdAt(tl, u));
      const bar = await page.locator(".lp-unitbar-name").innerText();
      report(`${name}：停在第 ${u + 1} 个组合时，底部的组合名是「${units[u]}」`, bar === units[u], `显示「${bar}」`);
      await page.screenshot({ path: path.join(shots, `${name}-act2-unit${u + 1}.png`) });
      // 聚焦：电脑上指针移上去，手机上点一下。
      const plate = page.locator(".lp-seg").nth(u).locator(".lp-plate").first();
      if (name === "full") await plate.hover();
      else await plate.tap();
      await page.waitForTimeout(2500);
      const focused = await page.evaluate(() => document.querySelector(".lp-act2")?.dataset.focus ?? null);
      report(`${name}：聚焦一位偶像`, focused !== null, focused ?? "没有聚焦");
      await page.screenshot({ path: path.join(shots, `${name}-act2-focus.png`) });
    }
    if (act3) {
      for (const [label, at] of [
        ["act3", act3.from + act3.length * 0.55],
        ["act3-end", act3.from + act3.length * 0.95],
      ]) {
        await toScreens(page, at);
        await page.screenshot({ path: path.join(shots, `${name}-${label}.png`) });
      }
      // 第 4 幕的手机：她的光收成竖线 → 交接 → 侧面 → 背面 → 正面 → 亮屏、来电，往回滚再看一次背面。
      // 进度按 model/phone.ts 的时间线。
      for (const [label, p] of [
        ["light", 0.1],
        ["handoff", 0.15],
        ["side", 0.2],
        ["back", 0.38],
        ["front", 0.55],
      ]) {
        await toScreens(page, act4.from + act4.length * p);
        await page.screenshot({ path: path.join(shots, `${name}-act4-${label}.png`) });
      }
      await toScreens(page, restAt(tl, 4));
      await page.screenshot({ path: path.join(shots, `${name}-act4.png`) });
      const call = await page.evaluate(() => {
        const box = (s) => document.querySelector(s)?.getBoundingClientRect();
        const voice = getComputedStyle(document.querySelector(".lp-voice"));
        const px = (v) => parseFloat(voice.getPropertyValue(v));
        return {
          on: document.querySelector(".lp-root").classList.contains("lp-phone-on"),
          ui: box(".lp-screen"),
          poster: !!document.querySelector(".lp-poster[data-shown]"),
          title: box(".lp-act4-copy .lp-act-title"),
          body: box(".lp-act4-copy .lp-act-body"),
          screen: { x: px("--lp-screen-x"), y: px("--lp-screen-y"), w: px("--lp-screen-w"), h: px("--lp-screen-h") },
          top: px("--lp-phone-top"),
          bottom: px("--lp-phone-bottom"),
        };
      });
      const near = (a, b) => Math.abs(a - b) <= 4; // 振动最多 4 px
      report(
        `${name}：手机画出来了，屏幕上的来电界面摆在落地页模型给的屏幕矩形里`,
        call.on && near(call.ui.x + call.ui.width / 2, call.screen.x) && near(call.ui.y + call.ui.height / 2, call.screen.y) && near(call.ui.width, call.screen.w),
        `lp-phone-on ${call.on}；界面中心 (${Math.round(call.ui.x + call.ui.width / 2)}, ${Math.round(call.ui.y + call.ui.height / 2)})、宽 ${Math.round(call.ui.width)}，屏幕 (${Math.round(call.screen.x)}, ${Math.round(call.screen.y)})、宽 ${Math.round(call.screen.w)}`,
      );
      report(
        `${name}：标题在手机上方、正文在手机下方，不和手机重叠`,
        call.title.bottom <= call.top && call.body.top >= call.bottom && call.body.bottom <= (name === "full" ? DESKTOP : PHONE).viewport.height,
        `标题底 ${Math.round(call.title.bottom)} ≤ 机身顶 ${Math.round(call.top)}；正文 ${Math.round(call.body.top)}–${Math.round(call.body.bottom)}，机身底 ${Math.round(call.bottom)}`,
      );
      console.log(`      ${name}：来电画面上是${call.poster ? "她的卡图" : "印象色的后备海报（没有卡图，或者加载不出来）"}`);
      // 振动：手机和屏幕上的界面在同一个容器里，响铃时这个容器在抖。
      const shakes = async () => {
        const seen = [];
        for (let i = 0; i < 40; i++) {
          seen.push(await page.evaluate(() => getComputedStyle(document.querySelector(".lp-phone")).translate));
          await page.waitForTimeout(100);
        }
        return seen.filter((t) => t !== "none" && !/^0px( 0px)?$/.test(t)).length;
      };
      const ringing = await shakes();
      await toScreens(page, act4.from + act4.length * 0.38);
      await page.screenshot({ path: path.join(shots, `${name}-act4-back-reverse.png`) });
      await toScreens(page, restAt(tl, 4));
      // 接听：电脑上把圆钮拖过一半（先拖不到一半松手，不该接通），手机上点一下。
      const status = () => page.locator(".lp-call-status").innerText();
      if (name === "full") {
        const slide = await page.locator(".lp-slide").boundingBox();
        const knob = await page.locator(".lp-slide-knob").boundingBox();
        const drag = async (to) => {
          await page.mouse.move(knob.x + knob.width / 2, knob.y + knob.height / 2);
          await page.mouse.down();
          for (let i = 1; i <= 8; i++) await page.mouse.move(knob.x + knob.width / 2 + (to * i) / 8, knob.y + knob.height / 2);
          await page.mouse.up();
          await page.waitForTimeout(400);
        };
        await drag(slide.width * 0.2);
        const short = await status();
        report("full：圆钮拖不到一半松手，不接听", short.startsWith("来电"), `「${short}」`);
        await drag(slide.width * 0.75);
      } else await page.locator(".lp-slide").tap();
      await page.waitForTimeout(800);
      const connected = await status();
      report(`${name}：${name === "full" ? "拖过一半" : "点一下「滑动接听」"}就接通`, connected.startsWith("通话中"), `「${connected}」`);
      await page.screenshot({ path: path.join(shots, `${name}-act4-connected-rise.png`) });
      await page.waitForTimeout(3500);
      await page.screenshot({ path: path.join(shots, `${name}-act4-connected.png`) });
      const after = await shakes();
      report(`${name}：响铃时手机和屏幕上的界面一起振动，接通以后不振动`, ringing > 0 && after === 0, `响铃时 4 秒里抖了 ${ringing} 次，接通以后 ${after} 次`);
      // 挂断：「通话结束」和时长，约 1.5 秒后回到来电，可以再接一次。
      if (name === "full") await page.locator(".lp-hang-up").click();
      else await page.locator(".lp-hang-up").tap();
      await page.waitForTimeout(300);
      const ended = await status();
      report(`${name}：点挂断键，屏幕上是「通话结束」和时长`, /^通话结束\s*\d\d:\d\d$/.test(ended), `「${ended}」`);
      await page.screenshot({ path: path.join(shots, `${name}-act4-ended.png`) });
      await page.waitForTimeout(1700);
      const again = await status();
      report(`${name}：通话结束约 1.5 秒后回到来电`, again.startsWith("来电") && (await page.locator(".lp-slide").count()) === 1, `「${again}」`);
      if (name === "full") {
        // 键盘：聚焦滑块按回车接听，焦点交给状态那一行；Tab 到挂断键按回车挂断，焦点还在状态那一行。
        await page.locator(".lp-slide").focus();
        await page.keyboard.press("Enter");
        await page.waitForTimeout(300);
        const onStatus = () => page.evaluate(() => document.activeElement?.classList.contains("lp-call-status") ?? false);
        const keyConnected = (await status()).startsWith("通话中") && (await onStatus());
        await page.keyboard.press("Tab");
        const onHangUp = await page.evaluate(() => document.activeElement?.classList.contains("lp-hang-up") ?? false);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(300);
        const keyEnded = (await status()).startsWith("通话结束") && (await onStatus());
        report("full：键盘回车接听、Tab 到挂断键回车挂断，焦点都留在状态那一行", keyConnected && onHangUp && keyEnded, `接听 ${keyConnected}，Tab 到挂断键 ${onHangUp}，挂断 ${keyEnded}`);
        await page.waitForTimeout(1700);
      }
      if (name === "full") {
        // 手机画布丢了 WebGL 上下文：换成事先渲染好的手机图，屏幕还在图上的屏幕处，落地页不降档。最后再做，后面的截图
        // 不受影响（第 5 幕以后没有手机）。
        const tierBefore = await tierOf(page);
        await page.evaluate(() => document.querySelector(".lp-phone-canvas")?.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext());
        await page.waitForTimeout(1500);
        await page.waitForFunction(() => document.querySelector(".lp-phone-img")?.complete, null, { timeout: 10000 }).catch(() => {});
        const lost = await page.evaluate(() => ({ on: document.querySelector(".lp-root").classList.contains("lp-phone-on"), canvas: !!document.querySelector(".lp-phone-canvas") }));
        const still = await stillPhoneOn(page);
        report(
          "手机画布丢了上下文：换成事先渲染好的手机图，屏幕在图上的屏幕处，落地页不降档",
          !lost.on && !lost.canvas && still.ok && (await tierOf(page)) === tierBefore,
          `lp-phone-on ${lost.on}，画布 ${lost.canvas ? "还在" : "收起了"}，${still.detail}，档位 ${tierBefore} → ${await tierOf(page)}`,
        );
        await page.screenshot({ path: path.join(shots, "full-act4-lost.png") });
      }
    }
    for (const [label, at] of [
      ["act6", spanOf(tl, 6).from + 0.2],
      ["act7", act7.from + act7.length],
    ]) {
      await toScreens(page, at);
      await page.screenshot({ path: path.join(shots, `${name}-${label}.png`) });
    }
    if (name === "full") {
      await page.locator(".lp-act7-copy button").click();
      const dialog = await page.getByRole("dialog").waitFor({ timeout: 10000 }).then(
        () => true,
        () => false,
      );
      report("第 7 幕的行动按钮弹出登录面板", dialog);
    }
    await context.close();
  }
  const all = complaints.flat();
  report("第 2 到 7 幕的控制台没有报错和警告", all.length === 0, all.join("；") || "没有");

  // 第 5 幕：某位的体素文件加载不到（拦下果穗的那一份），她的位置是她印象色的方块加名字。截图看。
  {
    const context = await browser.newContext(DESKTOP);
    const page = await context.newPage();
    let stopped = 0;
    await page.route("**/landing-voxels/kaho.json", (route) => {
      stopped += 1;
      return route.fulfill({ status: 404, body: "" });
    });
    await page.goto(`${origin}/?tier=full`, { waitUntil: "load" });
    await glOn(page);
    const tl = await timelineOn(page);
    const act5 = spanOf(tl, 5);
    await act5Ready(page, act5);
    await toScreens(page, act5.from + act5.length * 0.53);
    await page.screenshot({ path: path.join(shots, "full-act5-no-voxels.png") });
    report(
      "第 5 幕：某位的体素文件加载不到",
      stopped ? null : false,
      stopped ? "截图 full-act5-no-voxels.png 里果穗的位置应是印象色方块加名字" : "没拦到果穗的体素文件（没配存储桶地址？）",
    );
    await context.close();
  }

  // 第 5 幕要用显卡看：软件渲染（SwiftShader）一帧几百毫秒，完整档一开场就按帧降档了。没有显卡时照样截图，帧耗时和档位
  // 那几项跳过。
  {
    const gpu = await chromium.launch({ args: ["--enable-gpu", ...(process.platform === "win32" ? ["--use-angle=d3d11"] : [])] });
    const softwareOn = (page) =>
      page.evaluate(() => {
        const gl = document.createElement("canvas").getContext("webgl2");
        const info = gl?.getExtension("WEBGL_debug_renderer_info");
        return !info || /swiftshader|llvmpipe/i.test(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
      });
    const [liteSlow] = SLOW_MS.lite;

    // 电脑（完整档）、竖屏手机（触屏，起步就是简化档）不带 ?tier= 打开：九个节拍的当中各截一张，往回滚到副本过桥那一拍
    // 截一张，档位一直不降。手机再把 CPU 降速 4 倍（中端安卓机），停在开场、终局全景和一路滚过这一幕时量帧耗时，
    // 不超过简化档降档的门槛：超了就该给手指操作的设备换 64 格的体素（docs/deploy.md「体素小人」）。
    for (const [name, options, want] of [
      ["full", DESKTOP, "full"],
      ["phone", PHONE, "lite"],
    ]) {
      const context = await gpu.newContext(options);
      const page = await context.newPage();
      await page.goto(`${origin}/`, { waitUntil: "load" });
      const software = await softwareOn(page);
      const tl = await timelineOn(page);
      const act5 = spanOf(tl, 5);
      if (name === "full") {
        // 整页一路滚过第 4 幕到第 6 幕的衔接：手机离开后夜空接上来，最后一屏画布淡出、接上第 6 幕。截图看。
        for (const [label, at] of [
          ["act4-out", act5.from - 0.6],
          ["act5-in", act5.from - 0.2],
          ["act5-out", act5.to - 0.5],
          ["act6-in", act5.to + 0.3],
        ]) {
          await toScreens(page, at);
          // 从页面开头一下跳到第 4 幕末尾：手机（three.js 和模型）这时才开始加载，多等一会儿它画出来、开始淡出。
          if (label === "act4-out") await page.waitForTimeout(4000);
          await page.screenshot({ path: path.join(shots, `gpu-${name}-seam-${label}.png`) });
        }
      }
      await act5Ready(page, act5);
      const beatMid = (k) => (BEATS[k].at + (BEATS[k + 1]?.at ?? 1)) / 2;
      for (let k = 0; k < BEATS.length; k++) {
        await toScreens(page, act5.from + act5.length * beatMid(k));
        await page.screenshot({ path: path.join(shots, `${name}-act5-beat${k}.png`) });
      }
      const bridgeBeat = BEATS.findIndex((b) => b.name === "记忆沿桥传给果穗");
      await toScreens(page, act5.from + act5.length * beatMid(bridgeBeat));
      await page.screenshot({ path: path.join(shots, `${name}-act5-back-beat${bridgeBeat}.png`) });
      const after = await tierOf(page);
      report(
        `${name}：第 5 幕九个节拍和往回滚（截图 ${name}-act5-beat0…${BEATS.length - 1}.png、${name}-act5-back-beat${bridgeBeat}.png），档位停在 ${want}`,
        software ? null : after === want,
        software ? "没有显卡，跳过" : `档位 ${after}`,
      );
      if (name === "full") {
        // 场景画布丢了上下文（停在往回滚的那一拍）：在显卡上才验得到完整档不因此降档。
        const tierBefore = await tierOf(page);
        await page.evaluate(() => document.querySelector(".lp-memory-canvas")?.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext());
        await page.waitForTimeout(1500);
        const lost = await page.evaluate(() => ({
          canvas: !!document.querySelector(".lp-memory-canvas"),
          gl: document.querySelector(".lp-root").classList.contains("lp-gl-on"),
          lines: [...document.querySelectorAll(".lp-line")].every((l) => Number(getComputedStyle(l).opacity) === 0),
        }));
        const still = await memoryStillOn(page);
        report(
          "第 5 幕的场景画布丢了上下文：收起画布，换成事先渲染好的全景图，几句话收起来，光层照旧，落地页不降档",
          still.ok === null ? null : !lost.canvas && still.ok && lost.lines && lost.gl && (await tierOf(page)) === tierBefore,
          `画布 ${lost.canvas ? "还在" : "收起了"}，${still.detail}，几句话${lost.lines ? "收起来了" : "还显示着"}，光层 ${lost.gl ? "在" : "不在"}，档位 ${tierBefore} → ${await tierOf(page)}`,
        );
        await page.screenshot({ path: path.join(shots, "full-act5-lost.png") });
      }
      if (name === "phone") {
        const cdp = await context.newCDPSession(page);
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
        const measured = [];
        for (const k of [0, BEATS.length - 1]) {
          await toScreens(page, act5.from + act5.length * beatMid(k));
          measured.push([`停在第 ${k} 拍`, await frameMs(page)]);
        }
        measured.push(["滚过这一幕", await frameMs(page, { scrollAct5: true })]);
        const worst = Math.max(...measured.map(([, ms]) => ms));
        const tier = await tierOf(page);
        report(
          `phone：CPU 降速 4 倍时第 5 幕的帧耗时在简化档降档的门槛（${liteSlow} ms）以内，档位不降`,
          software ? null : worst <= liteSlow && tier === "lite",
          `${software ? "没有显卡，跳过；" : ""}${measured.map(([at, ms]) => `${at} ${ms.toFixed(1)} ms`).join("，")}，档位 ${tier}`,
        );
      }
      await context.close();
    }

    // 完整档、简化档的开场全景各截一张（完整档有阴影和泛光，简化档没有、粒子少一半，场景其他照常），简化档停在开场全景量一段
    // 帧耗时。
    for (const tier of ["full", "lite"]) {
      const context = await gpu.newContext(DESKTOP);
      const page = await context.newPage();
      await page.goto(`${origin}/?tier=${tier}`, { waitUntil: "load" });
      const software = await softwareOn(page);
      const tl = await timelineOn(page);
      const act5 = spanOf(tl, 5);
      await act5Ready(page, act5);
      await toScreens(page, act5.from + act5.length * 0.02);
      await page.screenshot({ path: path.join(shots, `${tier}-act5-dressing.png`) });
      if (tier === "full") {
        const after = await tierOf(page);
        report("第 5 幕完整档的开场全景（截图 full-act5-dressing.png：楼、路灯、各人岛上的东西、AI 的梗、云和粒子，有阴影和泛光）", software ? null : after === "full", software ? "没有显卡，跳过" : `档位停在 ${after}`);
      } else {
        const ms = await frameMs(page);
        const after = await tierOf(page);
        report(
          `第 5 幕简化档：开场全景的帧耗时在简化档降档的门槛（${liteSlow} ms）以内（截图 lite-act5-dressing.png：没有阴影和泛光，粒子少一半）`,
          software ? null : ms <= liteSlow && after === "lite",
          software ? `没有显卡，跳过（软件渲染 ${ms.toFixed(1)} ms）` : `平均 ${ms.toFixed(1)} ms，档位 ${after}`,
        );
      }
      await context.close();
    }
    await gpu.close();
  }

  // 静止版式：每一幕截一张，幕名轨亮的就是这一幕。
  const RAIL = { ".lp-seg": "光譜", ".lp-act3": "ことば", ".lp-act4": "着信", ".lp-act5": "記憶", ".lp-act6": "ことわり", ".lp-act7": "はじまり" };
  for (const tier of ["reduced", "static"]) {
    const context = await browser.newContext({ ...DESKTOP, reducedMotion: tier === "reduced" ? "reduce" : "no-preference" });
    const page = await context.newPage();
    await page.goto(`${origin}/?tier=${tier}`, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    const rails = [];
    for (const [sel, act] of Object.entries(RAIL)) {
      if (!(await page.locator(sel).count())) continue;
      await page.locator(sel).first().evaluate((el) => el.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(shots, `${tier}-${sel.slice(4)}.png`) });
      const lit = await page.locator(".lp-rail [data-current]").innerText();
      if (lit.replace(/\s/g, "") !== act) rails.push(`${act} 那一屏亮的是 ${lit.replace(/\s/g, "")}`);
    }
    report(`${tier}：静止版式的幕名轨跟着滚动走`, rails.length === 0, rails.join("；") || "每一幕都对");
    await context.close();
  }

  // 静止版式的第 4 幕：事先渲染好的手机图，屏幕在停稳时的屏幕矩形里，不振动；来电、接通各截一张，键盘接听、挂断。
  for (const tier of ["reduced", "static"]) {
    for (const [name, options] of [
      ["desktop", DESKTOP],
      ["phone", PHONE],
    ]) {
      const context = await browser.newContext({ ...options, reducedMotion: tier === "reduced" ? "reduce" : "no-preference" });
      const page = await context.newPage();
      await page.goto(`${origin}/?tier=${tier}`, { waitUntil: "load" });
      const scripts = [];
      page.on("request", (r) => r.resourceType() === "script" && scripts.push(new URL(r.url()).pathname));
      if (!(await page.locator(".lp-act4").count())) {
        report(`${tier}（${name}）：第 4 幕`, null, "没有打来电话的那一位");
        await context.close();
        continue;
      }
      await page.locator(".lp-act4").evaluate((el) => el.scrollIntoView({ block: "start" }));
      await page.waitForFunction(() => document.querySelector(".lp-phone-img")?.complete, null, { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const still = await stillPhoneOn(page);
      const placed = await page.evaluate(() => {
        const box = (s) => document.querySelector(s).getBoundingClientRect();
        const { x, y, width, height } = box(".lp-act4");
        const screen = box(".lp-screen");
        return {
          act: { w: width, h: height },
          screen: { x: screen.x - x, y: screen.y - y, w: screen.width, h: screen.height },
          shake: getComputedStyle(document.querySelector(".lp-phone")).translate,
        };
      });
      const { rect } = phoneRest(placed.act);
      const near = (a, b) => Math.abs(a - b) <= 1.5;
      report(
        `${tier}（${name}）：第 4 幕是事先渲染好的手机图，屏幕在落地页模型停稳时的屏幕矩形里，不振动`,
        still.ok &&
          near(placed.screen.x + placed.screen.w / 2, rect.x) &&
          near(placed.screen.y + placed.screen.h / 2, rect.y) &&
          near(placed.screen.w, rect.w) &&
          near(placed.screen.h, rect.h) &&
          /^(none|0px( 0px)?)$/.test(placed.shake),
        `${still.detail}；屏幕中心 (${Math.round(placed.screen.x + placed.screen.w / 2)}, ${Math.round(placed.screen.y + placed.screen.h / 2)})、${Math.round(placed.screen.w)}×${Math.round(placed.screen.h)}，模型 (${Math.round(rect.x)}, ${Math.round(rect.y)})、${Math.round(rect.w)}×${Math.round(rect.h)}；振动 ${placed.shake}`,
      );
      await page.screenshot({ path: path.join(shots, `${tier}-${name}-act4-ringing.png`) });
      // 键盘：聚焦滑块按回车接听，焦点交给状态那一行；Tab 到挂断键按回车挂断。
      const status = () => page.locator(".lp-call-status").innerText();
      const onStatus = () => page.evaluate(() => document.activeElement?.classList.contains("lp-call-status") ?? false);
      await page.locator(".lp-slide").focus();
      await page.keyboard.press("Enter");
      await page.waitForTimeout(400);
      const connected = (await status()).startsWith("通话中") && (await onStatus());
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(shots, `${tier}-${name}-act4-connected.png`) });
      const screen = await page.evaluate(() => ({
        stand: !!document.querySelector(".lp-screen-stand"),
        wall: getComputedStyle(document.querySelector(".lp-screen-wall")).display !== "none",
        hello: !!document.querySelector(".lp-hello"),
      }));
      await page.keyboard.press("Tab");
      const onHangUp = await page.evaluate(() => document.activeElement?.classList.contains("lp-hang-up") ?? false);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(400);
      const ended = (await status()).startsWith("通话结束") && (await onStatus());
      report(
        `${tier}（${name}）：键盘回车接听、Tab 到挂断键回车挂断，焦点都留在状态那一行`,
        connected && onHangUp && ended,
        `接听 ${connected}，Tab 到挂断键 ${onHangUp}，挂断 ${ended}`,
      );
      if (tier === "static") {
        report(
          `static（${name}）：接通后卡图留着、没有立绘、有开场白的字幕；load 之后到挂断都不加载脚本`,
          !screen.stand && !screen.wall && screen.hello && scripts.length === 0,
          `立绘 ${screen.stand ? "有" : "没有"}，深色底 ${screen.wall ? "盖住了卡图" : "没有"}，开场白 ${screen.hello ? "有" : "没有"}，脚本 ${scripts.join(" ") || "没有"}`,
        );
      } else {
        report(`reduced（${name}）：接通后换成深色底、有开场白的字幕`, screen.wall && screen.hello, `深色底 ${screen.wall}，立绘 ${screen.stand}，开场白 ${screen.hello}`);
      }
      await context.close();
    }
  }

  // 静止版式的第 5 幕：事先渲染好的全景图，下面是标题、正文、按顺序的几句话和最后一句；存储桶里没有图时只有文字。
  for (const tier of ["reduced", "static"]) {
    for (const [name, options] of [
      ["desktop", DESKTOP],
      ["phone", PHONE],
    ]) {
      for (const missing of [false, true]) {
        const context = await browser.newContext({ ...options, reducedMotion: tier === "reduced" ? "reduce" : "no-preference" });
        const page = await context.newPage();
        if (missing) await page.route("**/landing-memory/still.webp", (r) => r.fulfill({ status: 404, body: "" }));
        await page.goto(`${origin}/?tier=${tier}`, { waitUntil: "load" });
        const scripts = [];
        page.on("request", (r) => r.resourceType() === "script" && scripts.push(new URL(r.url()).pathname));
        await page.locator(".lp-act5").evaluate((el) => el.scrollIntoView({ block: "start" }));
        await page.waitForTimeout(1000);
        const order = await page.evaluate(() => [...document.querySelector(".lp-act5").children].map((c) => c.className.split(" ")[0]));
        const want = ["lp-memory-still", "lp-act5-copy", "lp-lines", "lp-closing"].filter((c) => order.includes("lp-memory-still") || c !== "lp-memory-still");
        const ordered = order.join() === want.join();
        const quiet = tier === "reduced" || scripts.length === 0;
        const arranged = `排法 ${order.join(" → ")}${quiet ? "" : `，load 之后加载了脚本 ${scripts.join(" ")}`}`;
        const label = `${tier}（${name}）：第 5 幕`;
        if (missing) {
          await page.waitForFunction(() => !document.querySelector(".lp-memory-still"), null, { timeout: 10000 }).catch(() => {});
          const gone = !(await page.locator(".lp-memory-still").count());
          report(`${label}在存储桶里没有静止图时只有文字，没有破图`, gone && ordered && quiet, `图${gone ? "拿掉了" : "还在"}，${arranged}`);
          await page.locator(".lp-act5").screenshot({ path: path.join(shots, `${tier}-${name}-act5-no-still.png`) });
        } else {
          const still = await memoryStillOn(page);
          report(
            `${label}是事先渲染好的全景图，下面是标题、正文、按顺序的几句话和最后一句${tier === "static" ? "；滚到这里不加载脚本" : ""}`,
            still.ok === null ? null : still.ok && ordered && quiet,
            `${still.detail}，${arranged}`,
          );
          await page.locator(".lp-act5").screenshot({ path: path.join(shots, `${tier}-${name}-act5.png`) });
        }
        await context.close();
      }
    }
  }
}

/** 第 5 幕事先渲染好的全景图显示着、加载出来了（等它加载完）。没有这张图（没配存储桶地址、存储桶里没有）时 ok 是 null。 */
async function memoryStillOn(page) {
  await page.waitForFunction(() => document.querySelector(".lp-memory-still")?.complete !== false, null, { timeout: 10000 }).catch(() => {});
  const got = await page.evaluate(() => {
    const img = document.querySelector(".lp-memory-still");
    if (!img) return null;
    const b = img.getBoundingClientRect();
    return { shown: getComputedStyle(img).display !== "none" && b.width > 0, loaded: img.complete && img.naturalWidth > 0, w: Math.round(b.width), h: Math.round(b.height) };
  });
  if (!got) return { ok: null, detail: "没有全景图（没配存储桶地址，或者存储桶里没有 landing-memory/still.webp）" };
  return { ok: got.shown && got.loaded, detail: `全景图${got.shown ? `显示着（${got.w}×${got.h}）` : "没显示"}、${got.loaded ? "加载出来了" : "没加载出来"}` };
}

/**
 * 事先渲染好的手机图显示着、加载出来了，屏幕（.lp-screen）落在图上的屏幕处：图四周比机身多留机身高度的 STILL_MARGIN，
 * 屏幕在机身正中（model/phone.ts 的 PHONE_MM）。
 */
async function stillPhoneOn(page) {
  const got = await page.evaluate(() => {
    const img = document.querySelector(".lp-phone-img");
    const box = (el) => {
      const b = el.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height };
    };
    return {
      shown: getComputedStyle(img).display !== "none",
      loaded: img.complete && img.naturalWidth > 0,
      img: box(img),
      screen: box(document.querySelector(".lp-screen")),
    };
  });
  const body = got.img.h / (1 + 2 * STILL_MARGIN);
  const want = { w: (body * PHONE_MM.screen.w) / PHONE_MM.h, h: (body * PHONE_MM.screen.h) / PHONE_MM.h };
  const near = (a, b) => Math.abs(a - b) <= 2;
  const ok = got.shown && got.loaded && near(got.screen.x, got.img.x) && near(got.screen.y, got.img.y) && near(got.screen.w, want.w) && near(got.screen.h, want.h);
  return {
    ok,
    detail: `手机图${got.shown ? "显示着" : "没显示"}、${got.loaded ? "加载出来了" : "没加载出来"}，图上的屏幕 ${Math.round(want.w)}×${Math.round(want.h)}，界面 ${Math.round(got.screen.w)}×${Math.round(got.screen.h)}，中心差 (${Math.round(got.screen.x - got.img.x)}, ${Math.round(got.screen.y - got.img.y)})`,
  };
}

/** 页面上一个元素在不在画面里、看不看得见（连同祖先的不透明度）。 */
const shownIn = (page, handle) =>
  page.evaluate((el) => {
    const b = el.getBoundingClientRect();
    let o = 1;
    for (let n = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
    const inView = b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth;
    return { ok: inView && o > 0.5, at: `(${Math.round(b.left)}, ${Math.round(b.top)})`, o: Math.round(o * 100) / 100 };
  }, handle);

// —— 8. 键盘

for (const tier of ["full", "reduced", "static"]) {
  const context = await browser.newContext({ ...DESKTOP, reducedMotion: tier === "reduced" ? "reduce" : "no-preference" });
  const page = await context.newPage();
  await page.goto(`${origin}/?tier=${tier}`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const bad = [];
  let stops = 0;
  let end = false;
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(900);
    const handle = await page.evaluateHandle(() => document.activeElement);
    const label = await page.evaluate((el) => (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 12), handle);
    if (label === "BODY") break;
    stops += 1;
    const seen = await shownIn(page, handle);
    if (!seen.ok) bad.push(`「${label}」在 ${seen.at}，不透明度 ${seen.o}`);
    if (await page.evaluate((el) => el.matches(".lp-footer a:last-child"), handle)) {
      end = true;
      break;
    }
  }
  report(
    `${tier}：按 Tab 一路走到页脚最后一个链接，没卡在哪一幕，走过的每一处焦点都在画面上、看得见`,
    end && bad.length === 0,
    [...bad, ...(end ? [] : ["没走到页脚"])].join("；") || `${stops} 处`,
  );
  await context.close();
}

// —— 9. 页内查找

{
  const context = await browser.newContext(DESKTOP);
  const page = await context.newPage();
  await page.goto(`${origin}/?tier=full`, { waitUntil: "load" });
  await glOn(page);
  const names = await page.locator(".lp-name").allInnerTexts();
  const targets = [names.at(-1), names[Math.floor(names.length / 2)], names[0], "今天的天空", "听真乃说你要考试了", "她们在屏幕的另一边"].filter(Boolean);
  const bad = [];
  for (const text of targets) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);
    // 访客按了查找（无头浏览器不弹查找栏，页面照样收到这一下）。
    await page.keyboard.press("Control+f");
    // 同一页里跳到一个文本片段：和页内查找一样，会把 until-found 的文字找出来、滚进画面。
    await page.evaluate((t) => (location.hash = `:~:text=${encodeURIComponent(t)}`), text);
    // 浏览器滚完、页面停下来以后落地页才滚到它显示的地方；无头浏览器画一帧很慢，多等一会儿。
    await page.waitForTimeout(6000);
    const handle = await page.evaluateHandle((t) => [...document.querySelectorAll("p, h2, span")].find((e) => e.textContent.trim().startsWith(t)), text);
    const seen = await shownIn(page, handle);
    if (!seen.ok) bad.push(`「${text}」在 ${seen.at}，不透明度 ${seen.o}`);
  }
  report("页内查找找到的字在画面上、看得见", bad.length === 0, bad.join("；") || targets.join("、"));
  await context.close();

  // 没在查找时：第 3 幕的原文和字幕、各幕的说明，在开头（都还看不见）也都在无障碍树上。
  const fresh = await (await browser.newContext(DESKTOP)).newPage();
  await fresh.goto(`${origin}/?tier=full`, { waitUntil: "load" });
  await glOn(fresh);
  await fresh.waitForTimeout(2000);
  const cdp = await fresh.context().newCDPSession(fresh);
  await cdp.send("Accessibility.enable");
  const { nodes } = await cdp.send("Accessibility.getFullAXTree");
  const inTree = nodes.filter((n) => !n.ignored && n.name?.value).map((n) => n.name.value);
  // 每一段里读屏器该读到的字：不算 aria-hidden 的装饰（第 1 幕竖排的「プリズム」）。
  const wanted = await fresh.evaluate(() =>
    [...document.querySelectorAll("[data-lp-find]")]
      .flatMap((el) => [el, ...el.querySelectorAll("*")])
      .filter((e) => e.children.length === 0 && !e.closest("[aria-hidden]") && e.textContent.trim())
      .map((e) => e.textContent.trim().slice(0, 8)),
  );
  const lost = wanted.filter((t) => !inTree.some((n) => n.includes(t)));
  report("没在查找时，跟着滚动淡入淡出的文字都在无障碍树上", lost.length === 0, lost.join("、") || `${wanted.length} 段`);
  // 读屏器的顺序：第 5 幕的标题、正文、几个人说的话（按出现的顺序）、最后一句，在无障碍树上一段接一段。
  // 一段段文字按文字节点算：气泡里说话的人的名字和她的话是同一个元素里的两段。
  const act5Texts = await fresh.evaluate(() => {
    const walker = document.createTreeWalker(document.querySelector(".lp-act5"), NodeFilter.SHOW_TEXT);
    const texts = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode())
      if (n.textContent.trim() && !n.parentElement.closest("[aria-hidden]")) texts.push(n.textContent.trim());
    return texts;
  });
  let from = -1;
  const outOfOrder = act5Texts.filter((t) => {
    const i = inTree.findIndex((n, k) => k > from && n.includes(t));
    if (i < 0) return true;
    from = i;
    return false;
  });
  report("读屏器按顺序读第 5 幕：标题、正文、几句话、最后一句", outOfOrder.length === 0, outOfOrder.join("、") || act5Texts.join(" / "));
  await fresh.context().close();
}

// —— 10. 浏览器后退

{
  const context = await browser.newContext(DESKTOP);
  const page = await context.newPage();
  await page.goto(`${origin}/?tier=full`, { waitUntil: "load" });
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.scrollTo(0, Math.round(document.documentElement.scrollHeight * 0.55)));
  await page.waitForTimeout(1500);
  const before = await page.evaluate(() => scrollY);
  // 不用 click()：它会先把链接滚进画面。
  await page.evaluate(() => document.querySelector(".lp-footer a").click());
  await page.waitForURL("**/privacy");
  await page.goBack();
  await page.waitForTimeout(2500);
  const after = await page.evaluate(() => scrollY);
  report("从落地页点进隐私政策再后退，回到原来的位置", Math.abs(after - before) < 30, `之前 ${before}，之后 ${after}`);
  await context.close();
}

// —— 11. 按帧降档

{
  const context = await browser.newContext({ viewport: { width: 480, height: 800 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
  await page.goto(`${origin}/?tier=full`, { waitUntil: "load" });
  const order = ["full", "lite", "basic", "static"];
  const seen = [await tierOf(page)];
  for (let i = 0; i < 40; i++) {
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(1000);
    const t = await tierOf(page);
    if (t !== seen.at(-1)) seen.push(t);
  }
  const down = seen.every((t, i) => i === 0 || order.indexOf(t) > order.indexOf(seen[i - 1]));
  report("按帧降档：档位只降不升，不来回切换", down, seen.join(" → "));
  await context.close();
}

await browser.close();
console.log(`截图在 ${shots}`);

process.exit(results.some((r) => r.ok === false) ? 1 : 0);

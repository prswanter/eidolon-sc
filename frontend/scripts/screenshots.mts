/**
 * 每页的截图存档（.scratch/shadcn-redesign/spec.md「Testing Decisions」）：在无界面的 Chromium 里打开本地跑着的网站，
 * 每页按电脑、手机两种宽度，浅色、深色两种模式各拍一张整页图，写到 `screenshots/<名字>/<页面>-<宽度>-<模式>.png`。
 * 只做存档，不做比对。通话层依赖实时状态，不在这里。
 *
 *   node scripts/screenshots.mts [--name <名字>] [--origin <网址>] [--user <名字>] [--only <页面,…>]
 *
 * 连的是本地真实的后端和开发库，不造假数据：先起后端（.env 里 EIDOLON_DEV_LOGIN=1），再 `npm run build` 后
 * `npm run start`，默认网址 http://localhost:3000。登录后的页面用开发登录按 `--user`（没有时取环境变量
 * EIDOLON_SCREENSHOT_USER）的名字登录；要拍后台，这个名字得是管理者。不给名字时只拍登录、条款、隐私。
 * `--name` 默认是当前时间；`--only` 只拍列出的页面，例如 `--only login,terms`。
 *
 * 浏览器里的时间固定在同一刻，「3 分钟前」这类相对时间每次拍出来一样；后端给的数据（看板的数字等）照实拍。
 * 需要 Playwright 的 Chromium（`npx playwright install --with-deps chromium`）。退出码：0 成功；1 参数或登录有误；
 * 2 有页面拍摄失败，其余照常写出；3 打不开 Chromium。
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import { chromium, type Browser, type BrowserContext } from "playwright";

const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 390, height: 844 },
} as const;
const SCHEMES = ["light", "dark"] as const;
/** 浏览器里固定的时刻。 */
const FIXED_TIME = new Date("2026-10-01T12:00:00+08:00");
/** 页面安静下来以后再等多久才拍（毫秒），给水合后的布局和字体换上留时间。 */
const SETTLE_MS = 500;
const PAGE_TIMEOUT_MS = 30_000;
/** 一张图片最多等它解码多久（毫秒）。 */
const IMAGE_TIMEOUT_MS = 5_000;

/** 让同一页每次拍出来逐像素一样：不分块、不用 GPU 光栅化，否则头像的圆边、按钮的边缘每次差几十个像素。 */
const DETERMINISTIC_RENDERING = [
  "--disable-gpu",
  "--disable-partial-raster",
  "--disable-skia-runtime-opts",
  "--force-color-profile=srgb",
  "--font-render-hinting=none",
];

const frontend = path.resolve(import.meta.dirname, "..");

const { values: args } = parseArgs({
  options: {
    name: { type: "string" },
    origin: { type: "string", default: "http://localhost:3000" },
    user: { type: "string" },
    only: { type: "string" },
  },
});
const origin = args.origin.replace(/\/$/, "");
const user = args.user ?? process.env.EIDOLON_SCREENSHOT_USER;
const only = args.only ? new Set(args.only.split(",").map((s) => s.trim())) : null;
const outDir = path.join(frontend, "screenshots", args.name ?? new Date().toISOString().replace(/[:.]/g, "-"));

/** 要拍的一页：`name` 是文件名的开头；`path` 可以要先问后端才知道（某位角色、某位用户）。 */
type Shot = { name: string; signedIn: boolean; path: string | ((ask: Ask) => Promise<string | null>) };
type Ask = (apiPath: string) => Promise<unknown>;

const SHOTS: Shot[] = [
  { name: "login", signedIn: false, path: "/login" },
  { name: "terms", signedIn: false, path: "/terms" },
  { name: "privacy", signedIn: false, path: "/privacy" },
  { name: "conversations", signedIn: true, path: "/conversations" },
  {
    name: "conversation",
    signedIn: true,
    path: async (ask) => {
      const characters = (await ask("/api/characters")) as { id: string }[];
      return characters.length > 0 ? `/conversation/${encodeURIComponent(characters[0].id)}` : null;
    },
  },
  { name: "settings", signedIn: true, path: "/settings" },
  { name: "memories", signedIn: true, path: "/settings/memories" },
  { name: "admin", signedIn: true, path: "/admin" },
  { name: "admin-config", signedIn: true, path: "/admin/config" },
  { name: "admin-users", signedIn: true, path: "/admin/users" },
  {
    name: "admin-user",
    signedIn: true,
    // 拍别人：登录用的这位每拍一次「最近活动」就变一次，详情页就不能逐像素对上了。
    path: async (ask) => {
      const page = (await ask("/api/admin/users?limit=50&sort=newest")) as { users: { id: string; name: string }[] };
      const other = page.users.find((u) => u.name !== user);
      return other ? `/admin/users/${encodeURIComponent(other.id)}` : null;
    },
  },
];

async function main(): Promise<number> {
  const shots = SHOTS.filter((shot) => (!only || only.has(shot.name)) && (user || !shot.signedIn));
  if (shots.length === 0) {
    console.error("没有要拍的页面：检查 --only 的页面名，或用 --user 给出登录用的名字");
    return 1;
  }
  let browser: Browser;
  try {
    browser = await chromium.launch({ args: DETERMINISTIC_RENDERING });
  } catch (error) {
    console.error(`打不开 Playwright 的 Chromium（先运行 npx playwright install --with-deps chromium）：${messageOf(error)}`);
    return 3;
  }
  const failed: string[] = [];
  let taken = 0;
  try {
    await mkdir(outDir, { recursive: true });
    for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
      for (const scheme of SCHEMES) {
        const anonymous = await browser.newContext({ viewport, colorScheme: scheme });
        const signedIn = user ? await browser.newContext({ viewport, colorScheme: scheme }) : null;
        try {
          if (signedIn && user && !(await signIn(signedIn, user))) return 1;
          for (const shot of shots) {
            const label = `${shot.name}-${viewportName}-${scheme}`;
            const context = shot.signedIn ? signedIn : anonymous;
            if (!context) continue;
            try {
              const target = typeof shot.path === "string" ? shot.path : await shot.path(asker(context));
              if (target === null) {
                console.warn(`${label}：后端没有可拍的对象，跳过`);
                continue;
              }
              await take(context, target, path.join(outDir, `${label}.png`));
              taken++;
            } catch (error) {
              failed.push(label);
              console.error(`${label} 拍摄失败：${messageOf(error)}`);
            }
          }
        } finally {
          await anonymous.close();
          await signedIn?.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`拍了 ${taken} 张，写在 ${outDir}`);
  if (failed.length > 0) {
    console.error(`${failed.length} 张拍摄失败：${failed.join("、")}`);
    return 2;
  }
  return 0;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 让这个浏览器上下文用开发登录按名字登录（后端检查 Origin，要带上），返回是否登录成功。 */
async function signIn(context: BrowserContext, name: string): Promise<boolean> {
  const res = await context.request.post(`${origin}/api/auth/dev-login`, {
    data: { name },
    headers: { origin },
  });
  if (!res.ok()) console.error(`开发登录失败（${res.status()}）：后端要开着 EIDOLON_DEV_LOGIN=1`);
  return res.ok();
}

/** 用这个浏览器上下文的登录状态问后端，拿回 JSON。 */
function asker(context: BrowserContext): Ask {
  return async (apiPath) => {
    const res = await context.request.get(`${origin}${apiPath}`);
    if (!res.ok()) throw new Error(`${apiPath} 返回 ${res.status()}`);
    return res.json();
  };
}

async function take(context: BrowserContext, target: string, file: string): Promise<void> {
  const page = await context.newPage();
  try {
    page.setDefaultTimeout(PAGE_TIMEOUT_MS);
    await page.clock.setFixedTime(FIXED_TIME);
    await page.goto(`${origin}${target}`, { waitUntil: "networkidle" });
    // 等字体换上、图片解码完；头像没解码完就拍，前后两次会差几十个像素。整页截图会拍到视口外面，
    // 懒加载的图片先改成立即加载，否则永远等不到；解码失败或太久的不等。
    await page.evaluate(async (timeoutMs) => {
      await document.fonts.ready;
      const images = [...document.images];
      for (const image of images) image.loading = "eager";
      const decoded = (image: HTMLImageElement) => image.decode().catch(() => undefined);
      const later = () => new Promise((resolve) => setTimeout(resolve, timeoutMs));
      await Promise.all(images.map((image) => Promise.race([decoded(image), later()])));
    }, IMAGE_TIMEOUT_MS);
    await page.waitForTimeout(SETTLE_MS);
    const png = await page.screenshot({ fullPage: true, animations: "disabled", caret: "hide", type: "png" });
    await writeFile(file, png);
  } finally {
    await page.close();
  }
}

try {
  process.exitCode = await main();
} catch (error) {
  // 例如本地网站没起来：说清楚原因，不留一大段堆栈
  console.error(`截图出错：${messageOf(error)}`);
  process.exitCode = 3;
}

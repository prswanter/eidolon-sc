// 打开对话页 → 更多操作 → 换衣装，数一数面板里有多少张卡，并截图。
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const CHARACTER = process.env.CHARACTER ?? "mano";
const OUT = process.env.OUT ?? "../../.workbuddy/outfit-picker.png";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const failed: string[] = [];
page.on("requestfailed", (r) => failed.push(`${r.url()} :: ${r.failure()?.errorText}`));

await page.goto(BASE, { waitUntil: "domcontentloaded" });
// 开发登录 + 同意条款（走同源 /api，和页面用的是同一套 cookie）
const status = await page.evaluate(async () => {
  await fetch("/api/auth/dev-login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "producer" }),
  }).catch(() => {});
  await fetch("/api/account/consent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agree_to_terms: true, at_least_13: true }),
  }).catch(() => {});
  return (await fetch("/api/service-status")).status;
});
console.log("service-status:", status);

await page.goto(`${BASE}/conversation/${CHARACTER}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

// 用图标按钮的 aria 找：先列出所有按钮的可访问名，方便排错
const names = await page.locator("button").evaluateAll((els) =>
  els.map((e) => (e.getAttribute("aria-label") || e.textContent || "").trim()).filter(Boolean),
);
console.log("按钮:", JSON.stringify(names.slice(0, 20)));

const trigger = page.locator('button[aria-haspopup="menu"]').last();
console.log("更多操作候选:", await page.locator('button[aria-haspopup="menu"]').count());
await trigger.click({ timeout: 5000 }).catch((e) => console.log("点击更多操作失败:", e.message));
await page.waitForTimeout(600);

const menu = await page.locator('[role="menuitem"]').evaluateAll((els) =>
  els.map((e) => (e.textContent || "").trim()),
);
console.log("菜单项:", JSON.stringify(menu));

const outfitItem = page.locator('[role="menuitem"]').filter({ hasText: /衣装/ }).first();
await outfitItem.click({ timeout: 5000 }).catch((e) => console.log("点击换衣装失败:", e.message));
await page.waitForTimeout(2500);

const cards = await page.locator("img").evaluateAll((els) =>
  els.map((e) => e.getAttribute("src") || "").filter((s) => s.includes("thumbnails")),
);
console.log("面板里的缩略图:", cards.length, cards.slice(0, 3));
await page.screenshot({ path: OUT, fullPage: false });
console.log("截图:", OUT);
if (failed.length) console.log("--- 失败请求 ---\n" + failed.slice(0, 10).join("\n"));
await browser.close();

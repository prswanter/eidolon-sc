// 打开设置的「档案」页：看有哪些可编辑项，填一段「关于我」并保存，确认存下来了。
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "../../.workbuddy/settings-profile.png";

const ABOUT = `我在做影像制作，常常熬夜剪片。喜欢安静的咖啡馆。（${new Date().toISOString().slice(11, 19)}）`;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.evaluate(async () => {
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
});

await page.goto(`${BASE}/settings/profile`, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);

const labels = await page
  .locator("label, [role=combobox], input, textarea, button")
  .evaluateAll((els) =>
    els
      .map((e) => (e.getAttribute("aria-label") || e.textContent || e.getAttribute("placeholder") || "").trim())
      .filter(Boolean),
  );
console.log("可见控件：", JSON.stringify([...new Set(labels)]));

const about = page.getByLabel("关于我");
await about.fill(ABOUT);
await page.getByRole("button", { name: "保存档案" }).click();
await page.waitForTimeout(1500);

await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(800);
console.log("重新打开后输入框里是：", JSON.stringify(await page.getByLabel("关于我").inputValue()));
console.log("改过就没保存的字样还在吗：", await page.getByText("尚未保存").count());

await page.screenshot({ path: OUT, fullPage: true });
console.log("截图:", OUT);

await browser.close();

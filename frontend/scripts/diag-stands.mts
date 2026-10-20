// 诊断：模拟浏览器在 http://localhost:3000 页面上取立绘素材，看会不会被证书/跨域挡住。
import { chromium } from "playwright";

const PAGE = process.env.PAGE ?? "http://localhost:3000";
const IGNORE = process.env.IGNORE_HTTPS === "1";

const browser = await chromium.launch();
const context = await browser.newContext({ ignoreHTTPSErrors: IGNORE });
const page = await context.newPage();

const problems = [];
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`[console] ${m.text()}`);
});
page.on("requestfailed", (r) => problems.push(`[failed] ${r.url()} :: ${r.failure()?.errorText}`));

await page.goto(PAGE, { waitUntil: "domcontentloaded", timeout: 30000 }).catch((e) =>
  problems.push(`[goto] ${e.message}`),
);

const result = await page.evaluate(async () => {
  const out = {};
  const json = await fetch("/api/characters", { credentials: "include" }).then((r) => r.json());
  const list = Array.isArray(json) ? json : (json.characters ?? []);
  const withStand = list.filter((c) => c.stand);
  out.characters = list.length;
  out.withStand = withStand.length;
  const one = withStand[0];
  if (!one) return out;
  out.id = one.id;
  out.outfitsUrl = one.stand.outfits_url;
  const origin = new URL(one.stand.outfits_url).origin;
  out.origin = origin;
  try {
    const r = await fetch(one.stand.outfits_url);
    out.listStatus = r.status;
    const body = await r.json();
    out.cards = (body.cards ?? []).length;
  } catch (e) {
    out.listError = String(e);
  }
  try {
    const r = await fetch(one.stand.default_outfit.url + "data.json");
    out.spineStatus = r.status;
  } catch (e) {
    out.spineError = String(e);
  }
  return out;
});

console.log(JSON.stringify(result, null, 2));
if (problems.length) console.log("--- 页面/网络问题 ---\n" + problems.slice(0, 15).join("\n"));
await browser.close();

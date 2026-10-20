// 单价和花费（GLOSSARY「看板」）：后端按单价估算的部署者花费，以及「配置」页里的单价。
// 单价依次取后台设定、在线目录（models.dev 和 OpenRouter）、预设；花费全由后端算好，
// 这里只负责措辞、格式化、目录状态的判断和单价表单的换算与校验。

import { api, json } from "@/lib/api";
import { copy } from "@/i18n";
import { formatAmount, formatCount, type ServiceName, unitWord } from "@/lib/dashboard";

export type Unit = "tokens" | "bytes" | "characters" | "seconds" | "images";
export const UNITS: Unit[] = ["tokens", "bytes", "characters", "seconds", "images"];

export type Currency = "USD" | "CNY";
export const CURRENCIES: Currency[] = ["USD", "CNY"];

/** 单价从哪来：后台设定、在线目录、按原厂价格估算（服务地址不在目录里，例如中转）、预设。 */
export type PriceSource = "override" | "catalog" | "catalog_upstream" | "preset";

/**
 * 每 `per` 个单位的输入、输出价；`output` 为 null 时输出按输入价算。`cache_read` 是输入里命中服务商缓存那部分的价，
 * 为 null 时命中的部分也按输入价算。
 */
export type Price = {
  input: number;
  output: number | null;
  cache_read: number | null;
  currency: string;
  per: number;
  /** 预设：整理价格的日期；目录：拉取目录的日期；后台设定：设定的日期。 */
  as_of: string;
  source: PriceSource;
  /** 来自目录时，目录里对应的提供方和模型。 */
  match?: { provider: string; model: string };
};

export type Amount = { currency: string; amount: number };

/** 一个模型在这段时间里的部署者用量和花费。`unit` 为 null 表示这个模型的调用都没说用量。 */
export type CostRow = {
  service: ServiceName;
  provider: string;
  model: string;
  unit: string | null;
  calls: number;
  usage_unknown: number;
  input: number | null;
  output: number | null;
  /** 输入里命中缓存的部分；都没说时为 null。 */
  cached: number | null;
  price: Price | null;
  currency: string | null;
  amount: number | null;
};

export type Cost = {
  totals: Amount[];
  services: { service: ServiceName; totals: Amount[]; unpriced: number; usage_unknown: number }[];
  rows: CostRow[];
  usage_unknown: number;
  trend: { start: string; amounts: Record<string, number> }[];
  own_keys: { service: ServiceName; unit: string | null; calls: number; input: number | null; output: number | null }[];
  preset_as_of: string | null;
  /** 目录最近一次拉取成功的日期，从没成功过时为 null。 */
  catalog_as_of: string | null;
};

/** 一项单价：生效的来源（没有单价时为 null），以及并列的预设、目录和后台设定。 */
export type PriceEntry = {
  provider: string;
  model: string;
  unit: string;
  per: number;
  source: PriceSource | null;
  preset: Price | null;
  catalog: Price | null;
  override: Price | null;
};

/** 在线目录的状态：最近一次拉取成功的时间，之后最近一次失败的时间和原因，是否正在拉取。 */
export type CatalogState = {
  fetched_at: string | null;
  failed_at: string | null;
  error: string | null;
  fetching: boolean;
};

export type Prices = {
  preset_as_of: string | null;
  catalog: CatalogState;
  prices: PriceEntry[];
  /** 最近用过却没有单价的模型，名字和运行记录里的一致。 */
  unpriced: { service: ServiceName; provider: string; model: string; unit: string }[];
};

const NONE = "—";

const SYMBOLS: Record<string, string> = { USD: "$", CNY: "¥" };

/** 一笔钱："$0.012"、"¥1,234.57"；不到 0.0001 的写成 "<$0.0001"，免得估出来的小钱显示成 0。 */
export function formatMoney(amount: number, currency: string): string {
  const sign = SYMBOLS[currency];
  const money = (text: string) => (sign ? `${sign}${text}` : `${text} ${currency}`);
  if (amount <= 0) return money("0");
  if (amount < 0.0001) return `<${money("0.0001")}`;
  if (amount >= 1) {
    return money(amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  }
  return money(String(Number(amount.toPrecision(2))));
}

/**
 * 金额轴上的刻度和趋势图的读数：不像 `formatMoney` 那样把很小的数都写成「<¥0.0001」，否则花费很少时几个刻度
 * 一模一样；按两位有效数字写出，例如 ¥0.00002、¥0.00004。
 */
export function formatMoneyTick(amount: number, currency: string): string {
  if (amount >= 0.0001 || amount <= 0) return formatMoney(amount, currency);
  const sign = SYMBOLS[currency];
  const text = amount.toLocaleString("en-US", { maximumSignificantDigits: 2, maximumFractionDigits: 20 });
  return sign ? `${sign}${text}` : `${text} ${currency}`;
}

/** 几种币种的合计，各算各的、不换算："$1.20 + ¥3.40"；一笔都没有时是 "—"。 */
export function formatTotals(totals: Amount[]): string {
  return totals.map((t) => formatMoney(t.amount, t.currency)).join(" + ") || NONE;
}

export { unitWord };

/** 单价的计价口径："每百万 tokens"、"每小时"。 */
export function perWord(unit: string, per: number): string {
  return copy.admin.usage.per[unit] ?? copy.admin.usage.perCount(formatCount(per), unitWord(unit));
}

/**
 * 一个单价："输入 $2 · 命中缓存 $0.2 · 输出 $8 / 每百万 tokens"；没有缓存命中价的不写那一项，输出也不单独计价时只有一个数。
 */
export function formatPrice(price: Price, unit: string): string {
  const words = copy.admin.prices.priceParts;
  const money = (amount: number) => formatUnitPrice(amount, price.currency);
  const parts = [
    ...(price.cache_read === null ? [] : [words.cacheRead(money(price.cache_read))]),
    ...(price.output === null ? [] : [words.output(money(price.output))]),
  ];
  const amounts = parts.length === 0 ? money(price.input) : [words.input(money(price.input)), ...parts].join(" · ");
  return `${amounts} / ${perWord(unit, price.per)}`;
}

/** 单价本身照原样写，不像花费那样四舍五入到两位有效数字。 */
function formatUnitPrice(amount: number, currency: string): string {
  const sign = SYMBOLS[currency];
  return sign ? `${sign}${amount}` : `${amount} ${currency}`;
}

/** 一行的用量："输入 2,000 · 输出 1,000 tokens"、"3,600 秒"；全都没说用量时是 "—"。 */
export function formatRowUsage(row: Pick<CostRow, "unit" | "input" | "output">): string {
  if (row.unit === null) return NONE;
  return formatAmount(row.unit, row.input, row.output);
}

/** 一行花费怎么显示：算出了钱；有用量但没有单价（「未设单价」）；或者调用都没说用量。 */
export type CostStatus = "priced" | "unpriced" | "unknown";

export function costStatus(row: Pick<CostRow, "unit" | "price">): CostStatus {
  if (row.unit === null) return "unknown";
  return row.price === null ? "unpriced" : "priced";
}

/** 花费趋势里出现过的币种，每种画一张图（不同币种不能共用一根轴）。 */
export function trendCurrencies(trend: Cost["trend"]): string[] {
  return [...new Set(trend.flatMap((point) => Object.keys(point.amounts)))].sort();
}

/** 金额轴的刻度：从 0 起，间隔是 10 的幂的 1、2、5 倍，最多 4 段，可以是小数。 */
export function amountTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? 10 * power;
  const ticks: number[] = [];
  for (let i = 0; ticks.length === 0 || ticks[ticks.length - 1] < max; i += 1) {
    ticks.push(Number((i * step).toPrecision(12)));
  }
  return ticks;
}

/**
 * 目录的状态怎么说：正在拉取；从没拉取过；从没拉取成功（只用预设）；拉取成功；
 * 最近一次拉取失败、继续用之前拉取的目录。
 */
export type CatalogStatus = "fetching" | "never" | "unreachable" | "fresh" | "kept";

export function catalogStatus(state: CatalogState): CatalogStatus {
  if (state.fetching) return "fetching";
  if (state.fetched_at === null) return state.error === null ? "never" : "unreachable";
  return state.error === null ? "fresh" : "kept";
}

/** 来自目录的单价在目录里对应的条目："anthropic/claude-opus-5-5"；其他单价为 null。 */
export function matchText(price: Price): string | null {
  return price.match ? `${price.match.provider}/${price.match.model}` : null;
}

/** 看板的花费用到了哪几种单价，各注明日期：用到目录的才说目录拉取于哪天，用到预设的才说预设整理于哪天。 */
export function costPriceDates(
  cost: Pick<Cost, "preset_as_of" | "catalog_as_of"> & { rows: Pick<CostRow, "price">[] },
): { preset: string | null; catalog: string | null } {
  const sources = new Set(cost.rows.map((row) => row.price?.source));
  return {
    preset: sources.has("preset") ? cost.preset_as_of : null,
    catalog: sources.has("catalog") || sources.has("catalog_upstream") ? cost.catalog_as_of : null,
  };
}

/** 单价表里生效的那一列；按原厂价格估算的也在目录一列。 */
export function effectiveColumn(entry: Pick<PriceEntry, "source">): "override" | "catalog" | "preset" | null {
  return entry.source === "catalog_upstream" ? "catalog" : entry.source;
}

/** 单价表单：各项都是输入框里的原文。 */
export type PriceForm = {
  provider: string;
  model: string;
  unit: Unit;
  input: string;
  output: string;
  cacheRead: string;
  currency: Currency;
};

export type PriceChange = {
  provider: string;
  model: string;
  unit: Unit;
  input: number;
  output: number | null;
  cache_read: number | null;
  currency: Currency;
};

export type PriceProblem = {
  field: "provider" | "model" | "input" | "output" | "cacheRead";
  reason: "required" | "amount";
};

export function emptyPriceForm(): PriceForm {
  return { provider: "", model: "", unit: "tokens", input: "", output: "", cacheRead: "", currency: "USD" };
}

/** 修改一项单价时表单的初值：后台设定的，没有就是目录的，再没有就是预设的。 */
export function priceFormOf(
  entry: Pick<PriceEntry, "provider" | "model" | "unit" | "preset" | "catalog" | "override">,
): PriceForm {
  const price = entry.override ?? entry.catalog ?? entry.preset;
  return {
    provider: entry.provider,
    model: entry.model,
    unit: isUnit(entry.unit) ? entry.unit : "tokens",
    input: price ? String(price.input) : "",
    output: price?.output == null ? "" : String(price.output),
    cacheRead: price?.cache_read == null ? "" : String(price.cache_read),
    currency: price && isCurrency(price.currency) ? price.currency : "USD",
  };
}

/** 表单换成要保存的单价，或者所有不对的地方（每项一条，按表单顺序）。输出价、缓存命中价留空表示按输入价算。 */
export function priceChangeOf(form: PriceForm): { change: PriceChange } | { problems: PriceProblem[] } {
  const provider = form.provider.trim();
  const model = form.model.trim();
  const problems: PriceProblem[] = [];
  if (!provider) problems.push({ field: "provider", reason: "required" });
  if (!model) problems.push({ field: "model", reason: "required" });
  const input = form.input.trim() ? amountOf(form.input) : null;
  if (!form.input.trim()) problems.push({ field: "input", reason: "required" });
  else if (input === null) problems.push({ field: "input", reason: "amount" });
  const output = form.output.trim() ? amountOf(form.output) : null;
  if (form.output.trim() && output === null) problems.push({ field: "output", reason: "amount" });
  // 只有按 tokens 计价时表单才显示缓存命中价；换成别的单位后，填过的也不算数。
  const cacheText = form.unit === "tokens" ? form.cacheRead.trim() : "";
  const cacheRead = cacheText ? amountOf(cacheText) : null;
  if (cacheText && cacheRead === null) problems.push({ field: "cacheRead", reason: "amount" });
  if (problems.length > 0 || input === null) return { problems };
  return {
    change: { provider, model, unit: form.unit, input, output, cache_read: cacheRead, currency: form.currency },
  };
}

function amountOf(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

function isUnit(value: string): value is Unit {
  return (UNITS as string[]).includes(value);
}

function isCurrency(value: string): value is Currency {
  return (CURRENCIES as string[]).includes(value);
}

export async function getPrices(): Promise<Prices> {
  return json(await api("/api/admin/prices"));
}

/** 从现在起按这个单价估算，取代同一提供方、模型和单位的目录价格和预设。 */
export async function savePrice(change: PriceChange): Promise<Prices> {
  return json(
    await api("/api/admin/prices", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(change),
    }),
  );
}

/** 立即重新拉取在线目录；已经在拉取的，等它拉完。拉取失败时返回的目录状态里有原因。 */
export async function refreshCatalog(): Promise<Prices> {
  return json(await api("/api/admin/prices/refresh", { method: "POST" }));
}

/** 恢复成目录或预设的单价；两者都没有的就不再有单价。 */
export async function restorePrice(entry: Pick<PriceEntry, "provider" | "model" | "unit">): Promise<Prices> {
  const query = new URLSearchParams({ provider: entry.provider, model: entry.model, unit: entry.unit });
  return json(await api(`/api/admin/prices?${query}`, { method: "DELETE" }));
}

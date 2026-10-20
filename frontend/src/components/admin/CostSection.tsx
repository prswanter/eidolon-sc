"use client";

import { StatTile } from "@/components/app/admin/StatTile";
import { CardPair, DashboardCard, DashboardGroup, RowList, TableOrRows } from "@/components/admin/DashboardParts";
import { TrendChart } from "@/components/admin/TrendChart";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { copy } from "@/i18n";
import {
  amountTicks,
  type Cost,
  costPriceDates,
  type CostRow,
  costStatus,
  formatMoney,
  formatMoneyTick,
  formatPrice,
  formatRowUsage,
  formatTotals,
  matchText,
  trendCurrencies,
} from "@/lib/adminPrices";
import { type Dashboard, formatCount, type ServiceName } from "@/lib/dashboard";

const t = copy.admin.dashboard.cost;
const services = copy.admin.dashboard.health.services;

function serviceName(service: ServiceName): string {
  return services[service] ?? service;
}

/**
 * 看板的花费一组：每种币种的合计（估算，不扣免费额度，不换算汇率）、每种币种一张趋势图（和按服务的明细
 * 宽屏两张一排）、按模型的明细（没有单价的模型显示用量和「未设单价」），以及自带密钥的用量（只有数量，不算钱）。
 * 金额全由后端按单价算好。每一块一张 Card。
 */
export function CostSection({ board }: { board: Dashboard }) {
  const { cost } = board;
  const dates = costPriceDates(cost);
  const unknown = cost.usage_unknown > 0 ? t.totalNote(formatCount(cost.usage_unknown)) : undefined;
  return (
    <DashboardGroup title={t.title} hint={t.hint(dates.catalog, dates.preset)}>
      {cost.totals.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.empty}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {cost.totals.map((total) => (
            <StatTile
              key={total.currency}
              label={`${t.total} · ${total.currency}`}
              value={formatMoney(total.amount, total.currency)}
              note={unknown}
            />
          ))}
        </div>
      )}

      <CardPair>
        {trendCurrencies(cost.trend).map((currency) => (
          <DashboardCard key={currency} title={t.trendTitle(currency)} hint={t.trendHint[board.bucket]}>
            <TrendChart
              points={cost.trend.map((p) => ({ start: p.start, value: p.amounts[currency] ?? 0 }))}
              bucket={board.bucket}
              title={t.trendTitle(currency)}
              total={t.trendTotal(
                copy.admin.dashboard.ranges[board.range],
                formatMoneyTick(cost.totals.find((c) => c.currency === currency)?.amount ?? 0, currency),
              )}
              describe={(span, i) => t.trendReadout(span, formatMoneyTick(cost.trend[i].amounts[currency] ?? 0, currency))}
              empty={t.trendEmpty}
              ticks={amountTicks}
              format={(value) => formatMoneyTick(value, currency)}
            />
          </DashboardCard>
        ))}
        {cost.services.length > 0 && (
          <DashboardCard title={t.byService}>
            <ServicesTable cost={cost} />
          </DashboardCard>
        )}
      </CardPair>

      {cost.rows.length > 0 && (
        <DashboardCard title={t.byModel}>
          <ModelsTable rows={cost.rows} />
        </DashboardCard>
      )}

      {cost.own_keys.length > 0 && (
        <DashboardCard title={t.own.title} hint={t.own.hint}>
          <OwnKeysTable cost={cost} />
        </DashboardCard>
      )}
    </DashboardGroup>
  );
}

function serviceNotes(row: Cost["services"][number]): string {
  return [
    row.unpriced > 0 ? t.unpricedModels(formatCount(row.unpriced)) : null,
    row.usage_unknown > 0 ? t.unknownCalls(formatCount(row.usage_unknown)) : null,
  ]
    .filter(Boolean)
    .join("，");
}

function ServicesTable({ cost }: { cost: Cost }) {
  return (
    <TableOrRows
      table={
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.service}</TableHead>
              <TableHead className="text-right">{t.amount}</TableHead>
              <TableHead>{t.notes}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cost.services.map((row) => (
              <TableRow key={row.service}>
                <TableCell>{serviceName(row.service)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatTotals(row.totals)}</TableCell>
                <TableCell className="whitespace-normal text-muted-foreground">{serviceNotes(row) || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
      rows={
        <RowList
          rows={cost.services.map((row) => ({
            id: row.service,
            label: serviceName(row.service),
            description: serviceNotes(row) || undefined,
            end: formatTotals(row.totals),
          }))}
        />
      }
    />
  );
}

/** 一个模型的单价：没有单价时照说；有单价时下面一行写单价从哪来。 */
function PriceCell({ row }: { row: CostRow }) {
  const status = costStatus(row);
  if (status === "unpriced") return <Badge variant="outline">{t.unpriced}</Badge>;
  if (status === "unknown" || row.price === null || row.unit === null)
    return <span className="text-muted-foreground">{t.usageUnknown}</span>;
  return (
    <>
      {formatPrice(row.price, row.unit)}
      <span className="block text-xs break-words text-muted-foreground">
        {[t.sources[row.price.source], row.price.source === "catalog_upstream" ? matchText(row.price) : null]
          .filter(Boolean)
          .join(" · ")}
      </span>
    </>
  );
}

/** 窄屏上一个模型的单价一行字：没有单价时照说。 */
function priceText(row: CostRow): string {
  const status = costStatus(row);
  if (status === "unpriced") return t.unpriced;
  if (status === "unknown" || row.price === null || row.unit === null) return t.usageUnknown;
  return `${formatPrice(row.price, row.unit)} · ${t.sources[row.price.source]}`;
}

function amountText(row: CostRow): string {
  return row.amount === null || row.currency === null ? "—" : formatMoney(row.amount, row.currency);
}

function ModelsTable({ rows }: { rows: CostRow[] }) {
  const data = rows.map((row) => ({ id: `${row.service}|${row.provider}|${row.model}|${row.unit ?? ""}`, row }));
  return (
    <TableOrRows
      at="xl"
      table={
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.service}</TableHead>
              <TableHead>{t.model}</TableHead>
              <TableHead>{t.usage}</TableHead>
              <TableHead>{t.price}</TableHead>
              <TableHead className="text-right">{t.amount}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map(({ id, row }) => (
              <TableRow key={id}>
                <TableCell>{serviceName(row.service)}</TableCell>
                <TableCell className="whitespace-normal break-words">
                  {row.model}
                  <span className="block text-xs text-muted-foreground">{row.provider}</span>
                </TableCell>
                <TableCell className="whitespace-normal">
                  {formatRowUsage(row)}
                  {row.usage_unknown > 0 && (
                    <span className="block text-xs text-muted-foreground">{t.unknownCalls(formatCount(row.usage_unknown))}</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-normal">
                  <PriceCell row={row} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{amountText(row)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
      rows={
        <RowList
          rows={data.map(({ id, row }) => ({
            id,
            label: row.model,
            description: (
              <>
                <span>{`${serviceName(row.service)} · ${row.provider}`}</span>
                <span>{formatRowUsage(row)}</span>
                <span>{priceText(row)}</span>
              </>
            ),
            end: amountText(row),
          }))}
        />
      }
    />
  );
}

function OwnKeysTable({ cost }: { cost: Cost }) {
  const data = cost.own_keys.map((row) => ({ id: `${row.service}|${row.unit ?? ""}`, row }));
  return (
    <TableOrRows
      table={
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.service}</TableHead>
              <TableHead className="text-right">{t.own.calls}</TableHead>
              <TableHead>{t.usage}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map(({ id, row }) => (
              <TableRow key={id}>
                <TableCell>{serviceName(row.service)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCount(row.calls)}</TableCell>
                <TableCell className="whitespace-normal">{formatRowUsage(row)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
      rows={
        <RowList
          rows={data.map(({ id, row }) => ({
            id,
            label: serviceName(row.service),
            description: formatRowUsage(row),
            end: formatCount(row.calls),
          }))}
        />
      }
    />
  );
}

import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

/**
 * 看板的数字卡：上面是标签（CardDescription），中间是数字（Stat：1.5rem semibold、等宽数字），
 * 下面可以有一行注释（0.75rem、muted）。保留 Card 默认的细线（DESIGN.md「The Flat Rule」的后台例外）。
 */
export function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </CardHeader>
      {note && (
        <CardContent>
          <p className="text-xs text-muted-foreground">{note}</p>
        </CardContent>
      )}
    </Card>
  );
}

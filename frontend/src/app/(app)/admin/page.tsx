import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { rangeFromQuery, tabFromQuery } from "@/lib/dashboard";

/** 时间范围和分组从地址里的 `?range=`、`?tab=` 读，收藏的「7 天的花费」打开就是 7 天的花费。 */
export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const query = await searchParams;
  return <AdminDashboard initialRange={rangeFromQuery(query.range)} initialTab={tabFromQuery(query.tab)} />;
}

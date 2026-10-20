import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { rangeFromQuery } from "@/lib/dashboard";

/** 时间范围从地址里的 `?range=` 读，收藏的「7 天看板」打开就是 7 天。 */
export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return <AdminDashboard initialRange={rangeFromQuery((await searchParams).range)} />;
}

import { AdminConfig } from "@/components/AdminConfig";
import { tabFromQuery } from "@/lib/adminConfig";

/** 分类标签从地址里的 `?tab=` 读，收藏的「单价」打开就是单价。 */
export default async function AdminConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return <AdminConfig initialTab={tabFromQuery((await searchParams).tab)} />;
}

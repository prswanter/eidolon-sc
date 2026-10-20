import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { AdminShell } from "@/components/app/admin/AdminShell";
import { getAdmin } from "@/lib/backend";

/**
 * 后台的每一页先问后端这位用户是不是管理者：不是（含未登录、名单为空）就是 Next 的 404，
 * 和不存在的地址一样，外人看不出有后台。
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await getAdmin((await cookies()).toString());
  if (admin === null) notFound();
  return <AdminShell name={admin.name}>{children}</AdminShell>;
}

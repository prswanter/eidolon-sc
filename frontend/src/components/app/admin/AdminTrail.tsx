"use client";

import { createContext, useContext, useEffect } from "react";

/** AdminShell 放下来的设置函数：页面告诉外壳面包屑在当前页后面再接哪一级，undefined 是不接。 */
export const AdminTrailContext = createContext<((trail: string | undefined) => void) | null>(null);

/**
 * 页面里放一个 `<AdminTrail value={用户名} />`，后台页首的面包屑就成了「后台 › 用户 › 用户名」，
 * 「用户」那一级变成回列表的链接。后台的 layout 是服务端组件，拿不到页面的数据，所以由页面来报。
 * 不渲染任何东西；离开这一页（卸载）时撤掉。值还没取到时传 undefined。
 */
export function AdminTrail({ value }: { value: string | undefined }) {
  const setTrail = useContext(AdminTrailContext);
  useEffect(() => {
    if (!setTrail) return;
    setTrail(value);
    return () => setTrail(undefined);
  }, [setTrail, value]);
  return null;
}

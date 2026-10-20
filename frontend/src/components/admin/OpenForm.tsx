"use client";

import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

// 配置页同一时间只开一个修改表单：开一个，另一个就收起，不会同时摊开好几份表单。

const OpenFormContext = createContext<[string | null, Dispatch<SetStateAction<string | null>>] | null>(null);

/** 包住配置页：记着哪一个表单开着（配置项名，或单价的 "prices"）。 */
export function OpenFormProvider({ children }: { children: ReactNode }) {
  const state = useState<string | null>(null);
  return <OpenFormContext value={state}>{children}</OpenFormContext>;
}

/**
 * `id` 这个表单开着没有，以及开、关它。开它会收起别的表单；关它只在它开着时生效。
 * 没有 `OpenFormProvider` 时各管各的，和原来一样。
 */
export function useOpenForm(id: string): [boolean, (open: boolean) => void] {
  const shared = useContext(OpenFormContext);
  const local = useState<string | null>(null);
  const [current, setCurrent] = shared ?? local;
  return [current === id, (open) => setCurrent((now) => (open ? id : now === id ? null : now))];
}

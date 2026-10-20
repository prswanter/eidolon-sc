"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { StatusDot } from "@/components/app/StatusDot";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { copy } from "@/i18n";
import { STATUS_REFRESH_MS, getServiceStatus, worst, type ServiceStatus } from "@/lib/serviceStatus";
import { cn } from "@/lib/utils";
import { ServiceStatusIcon } from "@/theme/icons";

const t = copy.conversationList;

/**
 * 对话列表页首铃铛左边的服务状态按钮和它打开的小窗口（GLOSSARY.md「服务状态」，DESIGN.md「Conversation list」）。
 * 有服务不稳定或故障时按钮右上角一个小圆点，颜色取最差的那一项（故障红、不稳定琥珀），全部正常时没有点。
 * 小窗口两种屏宽都是挂在按钮下面的 Popover：每项一行，名字和状态；不稳定、故障前面加点、加粗，正常和最近没有调用只写 muted 的字；
 * 底下一行统计的时段。列表载入时拉一次，之后每 5 分钟、切回这个标签页、点开小窗口时各拉一次；拉不到就保持上一次的。
 * 一次都没拉到，或者后台一项都没显示时，按钮不出现。
 */
export function ServiceStatusButton() {
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [isOpen, setOpen] = useState(false);
  // 卸载以后回来的结果不再写进状态。
  const mounted = useRef(true);
  const load = useCallback(() => {
    getServiceStatus().then(
      (got) => mounted.current && setStatus(got),
      () => {}, // 服务状态不是要紧的事，不报错，保持上一次的
    );
  }, []);

  useEffect(() => {
    mounted.current = true;
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    load();
    const timer = window.setInterval(load, STATUS_REFRESH_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const openChange = (open: boolean) => {
    if (open) load();
    setOpen(open);
  };

  if (!status || status.services.length === 0) return null;
  const worstStatus = worst(status);

  return (
    <Popover open={isOpen} onOpenChange={openChange}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label={worstStatus ? t.serviceStatusFailing : t.serviceStatus}
            className="relative"
          />
        }
      >
        <ServiceStatusIcon />
        {worstStatus && (
          <span
            aria-hidden
            className={cn(
              "absolute top-1.5 right-1.5 size-1.5 rounded-full",
              worstStatus === "down" ? "bg-destructive" : "bg-warning",
            )}
          />
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60">
        <PopoverHeader>
          <PopoverTitle>{t.serviceStatus}</PopoverTitle>
        </PopoverHeader>
        <ul className="flex flex-col gap-1.5">
          {status.services.map(({ service, status: state }) => {
            const failing = state === "down" || state === "unsteady";
            return (
              <li key={service} className="flex items-center justify-between gap-3">
                <span>{t.serviceStatusNames[service]}</span>
                <span className={cn("flex items-center gap-1.5", failing ? "font-medium" : "text-muted-foreground")}>
                  {failing && <StatusDot variant={state === "down" ? "error" : "warning"} />}
                  {t.serviceStatuses[state]}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-meta text-muted-foreground">{t.serviceStatusWindow(status.window_minutes)}</p>
      </PopoverContent>
    </Popover>
  );
}

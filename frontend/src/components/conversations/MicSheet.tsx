"use client";

import { useEffect, useState } from "react";

import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { copy } from "@/i18n";
import { listMicrophones } from "@/lib/microphone";
import { cn } from "@/lib/utils";

const t = copy.call.micSheet;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** 正在用的麦克风；空白是系统默认。 */
  micId: string;
  /** 选了另一个麦克风（空白是系统默认）。 */
  onSelect: (micId: string) => void;
};

/**
 * 通话中切换麦克风（DESIGN.md「Overlays」）：底部面板列出这台设备上的麦克风，当前这个铺中性的 `bg-muted`、
 * 标明「正在使用」（选中状态不用她的颜色，所以不注入 herVars）。选中后当场换过去，也成为以后通话的默认麦克风。
 */
export function MicSheet({ isOpen, onOpenChange, micId, onSelect }: Props) {
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);

  // 每次打开都重新列一遍：通话中可能刚插上或拔掉了设备。
  useEffect(() => {
    if (!isOpen) return;
    let current = true;
    listMicrophones().then(
      (found) => current && setMics(found),
      () => {},
    );
    return () => {
      current = false;
    };
  }, [isOpen]);

  const choices = [
    { id: "", label: t.systemDefault },
    ...mics.map((mic, i) => ({ id: mic.deviceId, label: mic.label || t.numbered(i + 1) })),
  ];

  return (
    <Drawer open={isOpen} onOpenChange={(open) => onOpenChange(open)} showSwipeHandle>
      {/* 电脑上不铺满整个窗口宽，居中一条 */}
      <DrawerContent className="md:mx-auto md:max-w-md">
        <DrawerHeader>
          <DrawerTitle>{t.title}</DrawerTitle>
          <DrawerDescription>{t.hint}</DrawerDescription>
        </DrawerHeader>
        <ul className="flex flex-col gap-1 overflow-y-auto p-4">
          {choices.map((choice) => {
            const inUse = choice.id === micId;
            return (
              <li key={choice.id || "system-default"}>
                <button
                  type="button"
                  aria-current={inUse || undefined}
                  onClick={() => {
                    onOpenChange(false);
                    if (!inUse) onSelect(choice.id);
                  }}
                  className={cn(
                    "flex min-h-11 w-full flex-col items-start justify-center gap-0.5 rounded-lg px-3 py-2 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                    inUse ? "bg-muted" : "hover:bg-muted/60",
                  )}
                >
                  <span className="text-body">{choice.label}</span>
                  {inUse && <span className="text-xs text-muted-foreground">{t.inUse}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </DrawerContent>
    </Drawer>
  );
}

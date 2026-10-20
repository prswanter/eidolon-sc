import { cn } from "@/lib/utils";

type Props = {
  /** `warning`：出错偏多、配置标签里有覆盖没有生效（琥珀色）；`error`：大量出错（挂断红）。正常的不加点，只写字（DESIGN.md「Admin status & charts」）。 */
  variant: "warning" | "error";
  /** 读屏念的状态；旁边已经写着同样的字时不传，点就只是装饰。 */
  label?: string;
};

/** 状态点：8px 的实心圆点，跟在出问题的项前面。颜色在页面底和卡片底上都 ≥ 3（themeContrast.test.ts）。 */
export function StatusDot({ variant, label }: Props) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("inline-block size-2 shrink-0 rounded-full", variant === "warning" ? "bg-warning" : "bg-destructive")}
    />
  );
}

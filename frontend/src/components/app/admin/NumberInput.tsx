"use client";

import { NumberField } from "@base-ui/react/number-field";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = {
  /** 读屏念的名字；旁边另有看得见的标签时也要传（和它一样）。 */
  label: string;
  /** 空着是 null。 */
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  /** 只收整数：小数会按步长 1 取整。 */
  isIntegerOnly?: boolean;
  /** 校验没通过：输入框标红（aria-invalid），说明写在外面。 */
  isInvalid?: boolean;
  disabled?: boolean;
  className?: string;
};

/**
 * 数字输入框：Base UI 的 NumberField（解析、上下键增减、失焦时夹到 min/max），外观和 shadcn 的 Input 一样。
 * 不带加减按钮，后台的限额、参数直接打字。
 */
export function NumberInput({ label, value, onChange, min, max, isIntegerOnly, isInvalid, disabled, className }: Props) {
  return (
    <NumberField.Root
      value={value}
      onValueChange={(next) => onChange(next)}
      min={min}
      max={max}
      step={isIntegerOnly ? 1 : "any"}
      format={isIntegerOnly ? { maximumFractionDigits: 0, useGrouping: false } : { useGrouping: false }}
      disabled={disabled}
      className={cn("max-w-40", className)}
    >
      <NumberField.Input render={<Input />} aria-label={label} aria-invalid={isInvalid || undefined} />
    </NumberField.Root>
  );
}

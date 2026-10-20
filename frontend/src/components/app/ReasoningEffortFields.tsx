import { useEffect, useState } from "react";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { copy } from "@/i18n";
import { getEffortHint } from "@/lib/api";
import { EFFORT_ITEMS, effortHintText, effortOptions, type EffortHint } from "@/lib/reasoningEffort";

// 一个模型的思考强度和额外请求参数（GLOSSARY.md「思考强度」）：后台的模型和设置页的自带 LLM 共用这两个字段。
// 取值怎么校验由各自的表单决定，这里只显示传进来的问题。

/** 停手多久再查档位提示，毫秒：地址和模型名是一个字一个字打的。 */
const HINT_DELAY = 400;

/** 表单里正在填的这个模型的档位提示（ADR-0019）：地址和模型名都填着时向服务器查，查不到、没填全或查询失败时是 null。 */
export function useEffortHint(protocol: string, baseUrl: string, model: string): EffortHint | null {
  const base = baseUrl.trim();
  const name = model.trim();
  const asked = JSON.stringify([protocol, base, name]);
  const [found, setFound] = useState<{ asked: string; hint: EffortHint | null } | null>(null);

  useEffect(() => {
    if (!base || !name) return;
    const aborted = new AbortController();
    const timer = setTimeout(() => {
      // 只是提示：查询失败就当查不到，不报错。
      const settle = (hint: EffortHint | null) => !aborted.signal.aborted && setFound({ asked, hint });
      getEffortHint(protocol, base, name, aborted.signal).then(settle, () => settle(null));
    }, HINT_DELAY);
    return () => {
      clearTimeout(timer);
      aborted.abort();
    };
  }, [protocol, base, name, asked]);

  return found?.asked === asked ? found.hint : null;
}

/** 一项思考强度的下拉框，`choice` 是表单里的值（`EFFORT_UNSET` 或一档）。Anthropic 接口没有「极低」，不列（ADR-0019）。
 * 有档位提示（`catalogHint`）时，目录里没写的档位标上「models.dev 未列出」，照样能选。 */
export function EffortField({
  id,
  label,
  hint,
  protocol,
  choice,
  onChoose,
  problem,
  catalogHint = null,
  showCatalogNote = false,
}: {
  id: string;
  label: string;
  hint?: string;
  protocol: string;
  choice: string;
  onChoose: (choice: string) => void;
  /** 选的这档填不了时说什么。 */
  problem?: string;
  catalogHint?: EffortHint | null;
  /** 在说明下面加一句目录里怎么写的：一个模型的几项强度只在第一项说。 */
  showCatalogNote?: boolean;
}) {
  const catalogNote = showCatalogNote ? effortHintText(catalogHint) : null;
  return (
    <Field data-invalid={problem ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select items={EFFORT_ITEMS} value={choice} onValueChange={(value) => value && onChoose(String(value))}>
        <SelectTrigger id={id} className="w-full" aria-invalid={problem ? true : undefined}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {effortOptions(protocol, catalogHint).map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
              {option.unlisted && (
                <span className="text-muted-foreground">{copy.reasoningEffort.catalog.unlisted}</span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <FieldDescription>{hint}</FieldDescription>}
      {catalogNote && <FieldDescription>{catalogNote}</FieldDescription>}
      {problem && <FieldError>{problem}</FieldError>}
    </Field>
  );
}

/** 额外请求参数的多行框：一段 JSON，留空是不设置。 */
export function ExtraBodyField({
  id,
  label,
  hint,
  text,
  onChange,
  problem,
}: {
  id: string;
  label: string;
  hint?: string;
  text: string;
  onChange: (text: string) => void;
  /** 填的不是 JSON 对象时说什么。 */
  problem?: string;
}) {
  return (
    <Field data-invalid={problem ? true : undefined}>
      <FieldLabel htmlFor={id}>
        {label}
        <span className="font-normal text-muted-foreground">{copy.common.optional}</span>
      </FieldLabel>
      <Textarea
        id={id}
        value={text}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={problem ? true : undefined}
        placeholder='{"enable_thinking": false}'
        spellCheck={false}
        autoComplete="off"
        rows={4}
      />
      {hint && <FieldDescription>{hint}</FieldDescription>}
      {problem && <FieldError>{problem}</FieldError>}
    </Field>
  );
}

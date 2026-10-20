// 思考强度（GLOSSARY.md「思考强度」）和额外请求参数：后台的模型和设置页的自带 LLM 共用这一份。
// 档位按接口原样发给服务，服务不支持时保存或检查时报错（ADR-0019），所以这里只管接口写得出哪些档。

import { copy } from "@/i18n";

/** The efforts, as the backend's `config.REASONING_EFFORTS` has them, in order. */
export const REASONING_EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

/** In a form, no effort: nothing is sent, the model's own default holds. */
export const EFFORT_UNSET = "unset";

/** The efforts `protocol` has a way to write: the Anthropic protocol has no minimal. */
function effortsFor(protocol: string): ReasoningEffort[] {
  return REASONING_EFFORTS.filter((effort) => !(protocol === "anthropic" && effort === "minimal"));
}

/** A model's effort choices in a form, unset first. */
export function effortChoices(protocol: string): string[] {
  return [EFFORT_UNSET, ...effortsFor(protocol)];
}

/** The effort a form's choice sends: null when unset, undefined when `protocol` cannot write it. */
export function effortOf(choice: string, protocol: string): ReasoningEffort | null | undefined {
  if (choice === EFFORT_UNSET) return null;
  return effortsFor(protocol).find((effort) => effort === choice);
}

/** 思考强度一档的中文名：「高」，没设是「不设置」。 */
export function effortName(effort: string): string {
  const efforts = copy.reasoningEffort;
  if (effort === EFFORT_UNSET) return efforts.unset;
  return efforts.names[effort] ?? effort;
}

/** 思考强度的一档：「高（high）」，没设是「不设置」。 */
export function effortLabel(effort: string): string {
  if (effort === EFFORT_UNSET) return effortName(effort);
  return copy.reasoningEffort.option(effortName(effort), effort);
}

/** 思考强度下拉框认得的每一档，包括这种接口不列的（换成 Anthropic 时还选着的「极低」照样显示名字）。 */
export const EFFORT_ITEMS = [EFFORT_UNSET, ...REASONING_EFFORTS].map((value) => ({ value, label: effortLabel(value) }));

/** How a model thinks, as models.dev lists it, for the efforts a protocol sends (the backend's
 * `price_catalog.describe_thinking`): the efforts it takes save none, and whether it is turned off
 * by the effort none, by a switch of its own, or not at all. */
export type EffortHint = {
  provider: string;
  model: string;
  thinks: boolean;
  efforts: ReasoningEffort[];
  turns_off: "by_effort" | "by_switch" | null;
};

/** Whether `hint` leaves `choice` out: none unless turned off by that effort, any other effort
 * unless listed. Unset is never left out, nor is anything without a hint. */
function unlisted(choice: string, hint: EffortHint | null): boolean {
  if (!hint || choice === EFFORT_UNSET) return false;
  if (choice === "none") return hint.turns_off !== "by_effort";
  return !hint.efforts.some((effort) => effort === choice);
}

/** 下拉框里的每一档（`effortChoices`），目录里没写的带上标注。只是提示：一档不少，选哪档都照常保存（ADR-0019）。 */
export function effortOptions(
  protocol: string,
  hint: EffortHint | null,
): { value: string; label: string; unlisted: boolean }[] {
  return effortChoices(protocol).map((value) => ({ value, label: effortLabel(value), unlisted: unlisted(value, hint) }));
}

/** 下拉框下面那句「据 models.dev……」，查不到这个模型时没有。不说默认是哪档：各目录说法不一。 */
export function effortHintText(hint: EffortHint | null): string | null {
  if (!hint) return null;
  const t = copy.reasoningEffort.catalog;
  const said = hint.thinks
    ? [
        hint.efforts.length ? t.efforts(hint.efforts.map(effortName).join(t.separator)) : t.noEfforts,
        t.turnsOff[hint.turns_off ?? "none"],
      ].join("；")
    : t.doesNotThink;
  return `${t.source(hint.provider, hint.model)}${said}。${t.onlyAHint}`;
}

export type JsonObject = { [key: string]: unknown };

/** An extra request body as typed in: empty for none, else what keeps it from being sent,
 * if it is not a JSON object. Which keys it may not set the backend checks (`config.checked_extra_body`). */
export function parseExtraBody(text: string): { value: JsonObject | null } | { problem: "json" | "jsonObject" } {
  if (!text.trim()) return { value: null };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { problem: "json" };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { problem: "jsonObject" };
  return { value: value as JsonObject };
}

/** An extra request body as a form starts with it: indented JSON, empty for none. */
export function extraBodyText(value: unknown): string {
  return value === null || value === undefined ? "" : JSON.stringify(value, null, 2);
}

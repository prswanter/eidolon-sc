// 免限额密钥（GLOSSARY.md「免限额密钥」）说给人听：部署者选了哪几项，`/api/account` 的 `exempting_keys` 给出。
// 是否计入只按那份列表和服务器的回答说，这里不自己推规则。

import { copy } from "@/i18n";
import type { LimitExemption } from "@/lib/api";
import type { OwnService } from "@/lib/localOwnKeys";

/** The services named in one phrase, in the order given: 「LLM」「LLM 和语音识别」「LLM、语音合成和语音识别」. */
export function serviceList(services: readonly OwnService[]): string {
  const { separator, last } = copy.serviceList;
  const names = services.map((service) => copy.ownServices[service]);
  const phrase = names.length < 2 ? names.join("") : `${names.slice(0, -1).join(separator)}${last}${names.at(-1)}`;
  return spaced(phrase);
}

/** The sentence `say` makes of `services` named in one phrase, a Latin name kept a space apart
 * from the Chinese beside it wherever the phrase lands. */
export function sayServices(say: (services: string) => string, services: readonly OwnService[]): string {
  return spaced(say(serviceList(services)));
}

function spaced(text: string): string {
  return text.replace(/([A-Za-z])(\p{Script=Han})/gu, "$1 $2").replace(/(\p{Script=Han})([A-Za-z])/gu, "$1 $2");
}

/** What the settings page says of whether the user's turns and calls count towards the limit, as
 * the server answered for the keys this browser keeps (`exemption`); a call needs every one of
 * `exemptingKeys`. A call may count towards none while text turns do: where the LLM is not one of them. */
export function exemptionNote({ turns, calls }: LimitExemption, exemptingKeys: readonly OwnService[]): string {
  const t = copy.settings.ownKeys;
  if (turns && calls) return t.exemptAll;
  if (turns) return sayServices(t.exemptTurns, exemptingKeys);
  return calls ? t.exemptCalls : t.exemptNone;
}

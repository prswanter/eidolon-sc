import { describe, expect, it } from "vitest";
import { EFFORT_UNSET, effortChoices, effortHintText, effortOptions, type EffortHint } from "@/lib/reasoningEffort";

const deepseek: EffortHint = {
  provider: "deepseek",
  model: "deepseek-v4-pro",
  thinks: true,
  efforts: ["low", "high", "max"],
  turns_off: "by_switch",
};

describe("effortOptions", () => {
  it("lists every choice as it does without a hint, none of them noted", () => {
    for (const protocol of ["chat-completions", "anthropic"]) {
      const options = effortOptions(protocol, null);
      expect(options.map((o) => o.value)).toEqual(effortChoices(protocol));
      expect(options.filter((o) => o.unlisted)).toEqual([]);
    }
    expect(effortOptions("chat-completions", null)[0]).toEqual({ value: EFFORT_UNSET, label: "不设置", unlisted: false });
  });

  it("notes the efforts the catalog does not list, leaving every one to choose", () => {
    const options = effortOptions("chat-completions", deepseek);

    expect(options.map((o) => o.value)).toEqual(effortChoices("chat-completions"));
    expect(options.filter((o) => o.unlisted).map((o) => o.value)).toEqual(["none", "minimal", "medium", "xhigh"]);
    expect(options.find((o) => o.value === "medium")?.label).toBe("中（medium）");
  });

  it("notes none only where the catalog does not say it turns off by that effort", () => {
    const off = (turns_off: EffortHint["turns_off"]) =>
      effortOptions("anthropic", { ...deepseek, turns_off }).find((o) => o.value === "none")?.unlisted;

    expect([off("by_effort"), off("by_switch")]).toEqual([false, true]);
  });

  it("notes every effort of a model that does not think", () => {
    const options = effortOptions("chat-completions", { ...deepseek, thinks: false, efforts: [], turns_off: null });

    expect(options.filter((o) => !o.unlisted).map((o) => o.value)).toEqual([EFFORT_UNSET]);
  });
});

describe("effortHintText", () => {
  it("says nothing without a hint", () => {
    expect(effortHintText(null)).toBeNull();
  });

  it("names the catalog's entry, the efforts it lists and how it turns off", () => {
    expect(effortHintText(deepseek)).toBe(
      "据 models.dev 里 deepseek 的 deepseek-v4-pro：支持低、高、最高；用它自己的开关关闭思考，「关闭」不一定管用，可以改用额外请求参数关。仅供参考，不影响保存。",
    );
    expect(effortHintText({ ...deepseek, efforts: ["low", "medium", "high"], turns_off: "by_effort" })).toBe(
      "据 models.dev 里 deepseek 的 deepseek-v4-pro：支持低、中、高；可以关闭思考。仅供参考，不影响保存。",
    );
    expect(effortHintText({ ...deepseek, efforts: [], turns_off: null })).toBe(
      "据 models.dev 里 deepseek 的 deepseek-v4-pro：不按档位调节；不能关闭思考。仅供参考，不影响保存。",
    );
    expect(effortHintText({ ...deepseek, thinks: false, efforts: [], turns_off: null })).toBe(
      "据 models.dev 里 deepseek 的 deepseek-v4-pro：这个模型不思考。仅供参考，不影响保存。",
    );
  });
});

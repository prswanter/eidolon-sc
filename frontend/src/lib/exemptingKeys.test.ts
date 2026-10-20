import { describe, expect, it } from "vitest";

import { copy } from "@/i18n";
import { exemptionNote, sayServices, serviceList } from "@/lib/exemptingKeys";

describe("serviceList", () => {
  it.each([
    [["llm"], "LLM"],
    [["llm", "stt"], "LLM 和语音识别"],
    [["tts", "stt"], "语音合成和语音识别"],
    [["llm", "tts", "stt"], "LLM、语音合成和语音识别"],
  ] as const)("names %j as a phrase", (services, phrase) => {
    expect(serviceList(services)).toBe(phrase);
  });
});

describe("exemptionNote", () => {
  const all = ["llm", "tts", "stt"] as const;

  it("says both count towards no limit", () => {
    expect(exemptionNote({ turns: true, calls: true }, all)).toBe("文字对话和语音通话都不计入每小时限额。");
  });

  it("names what calls need when only text turns are exempt", () => {
    expect(exemptionNote({ turns: true, calls: false }, all)).toBe(
      "文字对话用的是你自己的 LLM，不计入每小时限额；语音通话要带上 LLM、语音合成和语音识别才不计入。",
    );
  });

  it("says calls are exempt and text turns are not, where speech synthesis alone exempts a call", () => {
    expect(exemptionNote({ turns: false, calls: true }, ["tts"])).toBe(
      "语音通话不计入每小时限额；文字对话要用你自己的 LLM 才不计入。",
    );
  });

  it("says both count, without claiming every service is the deployer's", () => {
    expect(exemptionNote({ turns: false, calls: false }, ["llm"])).toBe("现在文字对话和语音通话都计入每小时限额。");
  });
});

describe("sayServices", () => {
  const exempting = copy.settings.ownKeys.exempting;

  it.each([
    [["llm"], "这个部署上，带上自己的 LLM 的通话不计入每小时限额；文字对话带上自己的 LLM 就不计入。"],
    [["tts"], "这个部署上，带上自己的语音合成的通话不计入每小时限额；文字对话带上自己的 LLM 就不计入。"],
  ] as const)("names the exempting keys %j on the settings page", (keys, sentence) => {
    expect(sayServices(exempting, keys)).toBe(sentence);
  });
});

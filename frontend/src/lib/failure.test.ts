import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import { toFailure } from "@/lib/failure";

describe("toFailure", () => {
  it("offers the own keys when the limit refused it", () => {
    expect(toFailure(new ApiError("这一小时的回合次数已经用完了", 429))).toMatchObject({ toOwnKeys: true });
  });

  it.each([
    ["a service failed", new ApiError("LLM 出错了", 502)],
    ["it never reached the backend", new Error("网络断了")],
  ])("offers no own keys when %s", (_, error) => {
    expect(toFailure(error).toOwnKeys).toBeFalsy();
  });
});

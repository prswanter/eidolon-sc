import { describe, expect, it } from "vitest";
import { photoFailureNote, photosUsedUpText } from "@/lib/photoFailure";

describe("photoFailureNote", () => {
  it("says why, with no link", () => {
    expect(photoFailureNote("timeout")).toEqual({ reason: "等太久了", toOwnKeys: false });
  });

  it("sends the user to their own keys where their image key failed", () => {
    expect(photoFailureNote("own_key_failed")).toEqual({ reason: "你的生图密钥没能用", toOwnKeys: true });
  });

  // `toString` is on every object's prototype: a reason is looked up among the reasons' own keys only.
  it.each([null, "toString"])("says the service failed for a reason it does not know: %s", (reason) => {
    expect(photoFailureNote(reason)).toEqual({ reason: "生图服务出错了", toOwnKeys: false });
  });
});

describe("photosUsedUpText", () => {
  it("says from when the user may ask again, as the clock in their time zone reads", () => {
    expect(photosUsedUpText("2026-09-28T01:05:00Z", "Asia/Shanghai")).toBe("这一小时的照片用完了，09:05 以后可以再要");
  });
});

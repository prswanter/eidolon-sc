import { describe, expect, it } from "vitest";

import { formatTimestamp } from "./timestamp";

// 时间都按上海时区写，测试不随跑测试的机器变。
const zone = "Asia/Shanghai";
const now = new Date("2026-10-09T14:30:00+08:00");
const at = (iso: string) => formatTimestamp(iso, { now, timeZone: zone, format: "auto" });

describe("formatTimestamp", () => {
  it("date_time：年月日加时分", () => {
    expect(formatTimestamp("2026-03-05T09:07:00+08:00", { now, timeZone: zone, format: "date_time" })).toBe(
      "2026年3月5日 09:07",
    );
  });

  describe("auto：七天内说相对时间，更早给日期时间", () => {
    it("一分钟内是「现在」", () => {
      expect(at("2026-10-09T14:29:30+08:00")).toBe("现在");
    });

    it("一小时内按分钟", () => {
      expect(at("2026-10-09T14:05:00+08:00")).toBe("25分钟前");
    });

    it("一天内按小时", () => {
      expect(at("2026-10-09T09:30:00+08:00")).toBe("5小时前");
    });

    it("七天内按天", () => {
      expect(at("2026-10-03T14:30:00+08:00")).toBe("6天前");
    });

    it("超过七天给日期时间", () => {
      expect(at("2026-09-30T08:00:00+08:00")).toBe("2026年9月30日 08:00");
    });
  });

  it("认不出的时间原样返回", () => {
    expect(formatTimestamp("不是时间", { now, format: "auto" })).toBe("不是时间");
  });
});

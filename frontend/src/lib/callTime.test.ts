import { describe, expect, it } from "vitest";
import { callTime, clock, showTime } from "@/lib/callTime";

const since = 1_000_000;
const after = (seconds: number) => since + seconds * 1000;

describe("callTime", () => {
  it("counts up from when the call connected", () => {
    expect(callTime(since, 1800, after(0))).toEqual({ kind: "elapsed", seconds: 0 });
    expect(callTime(since, 1800, after(201.9))).toEqual({ kind: "elapsed", seconds: 201 });
  });

  it("shows the time left once less than a minute is left", () => {
    expect(callTime(since, 1800, after(1740))).toEqual({ kind: "elapsed", seconds: 1740 });
    expect(callTime(since, 1800, after(1741))).toEqual({ kind: "remaining", seconds: 59 });
    expect(callTime(since, 1800, after(1799.5))).toEqual({ kind: "remaining", seconds: 1 });
  });

  it("stays at no time left while the last reply is still voiced", () => {
    expect(callTime(since, 1800, after(1830))).toEqual({ kind: "remaining", seconds: 0 });
  });

  it("only counts up when calls have no time limit", () => {
    expect(callTime(since, null, after(7200))).toEqual({ kind: "elapsed", seconds: 7200 });
  });
});

describe("clock", () => {
  it("writes minutes and seconds, minutes going past an hour", () => {
    expect(clock(0)).toBe("00:00");
    expect(clock(201)).toBe("03:21");
    expect(clock(3725)).toBe("62:05");
  });
});

describe("showTime", () => {
  it("says when it is the time left", () => {
    expect(showTime({ kind: "elapsed", seconds: 201 })).toBe("03:21");
    expect(showTime({ kind: "remaining", seconds: 42 })).toBe("还剩 00:42");
  });
});

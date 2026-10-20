import { describe, expect, it } from "vitest";

import { producerTimezone } from "./timezone";

describe("producerTimezone：按后端的规则取制作人的时区", () => {
  it("档案里设了就用它，没设用浏览器报的，都不可用时 Asia/Shanghai", () => {
    expect(producerTimezone("Asia/Tokyo", "Europe/Paris")).toBe("Asia/Tokyo");
    expect(producerTimezone(null, "Europe/Paris")).toBe("Europe/Paris");
    expect(producerTimezone("Mars/Olympus", "Europe/Paris")).toBe("Europe/Paris");
    expect(producerTimezone("Mars/Olympus", "")).toBe("Asia/Shanghai");
  });
});

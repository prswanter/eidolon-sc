import { useEffect, useState } from "react";

import { getProfile } from "@/lib/api";
import { detectTimezone, producerTimezone } from "@/lib/timezone";

/** 制作人的时区（和后端 `effective_timezone` 同一个规则）：档案里的读到之前、读不到时用浏览器报的。 */
export function useProducerTimezone(): string {
  const [timeZone, setTimeZone] = useState(detectTimezone);
  useEffect(() => {
    let current = true;
    getProfile().then(
      (profile) => current && setTimeZone(producerTimezone(profile.timezone)),
      () => {},
    );
    return () => {
      current = false;
    };
  }, []);
  return timeZone;
}

// The time zone this browser reports, sent with every request so that the
// character's "today" and "tonight" match the user's; a time zone set in the
// producer profile takes precedence on the backend.

/** Same as the backend's DEFAULT_TIMEZONE. */
export const FALLBACK_TIMEZONE = "Asia/Shanghai";

export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TIMEZONE;
  } catch {
    return FALLBACK_TIMEZONE;
  }
}

/** The producer's time zone, by the backend's rule (`effective_timezone`): the one set in their
 * profile, else the one this browser reports, else Asia/Shanghai; a zone this browser does not
 * know is passed over. */
export function producerTimezone(profileTimezone: string | null, detected: string = detectTimezone()): string {
  for (const timeZone of [profileTimezone, detected]) {
    if (timeZone && isKnown(timeZone)) return timeZone;
  }
  return FALLBACK_TIMEZONE;
}

function isKnown(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Every time zone this browser knows, for choosing one by hand. */
export function listTimezones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [FALLBACK_TIMEZONE];
  }
}

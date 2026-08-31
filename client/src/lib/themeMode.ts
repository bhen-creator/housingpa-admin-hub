export type Theme = "light" | "dark";

export const EASTERN_TIME_ZONE = "America/New_York";

function easternHour(date: Date): number {
  const hourPart = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hourCycle: "h23",
    timeZone: EASTERN_TIME_ZONE,
  })
    .formatToParts(date)
    .find(part => part.type === "hour");

  if (!hourPart) {
    throw new Error("Unable to determine the current Eastern Time hour.");
  }

  return Number(hourPart.value);
}

/**
 * The hub's automatic theme follows business-local time, including daylight
 * saving time. Dark mode begins at 18:00 ET and ends at 06:00 ET.
 */
export function automaticThemeForEasternTime(date = new Date()): Theme {
  const hour = easternHour(date);
  return hour >= 18 || hour < 6 ? "dark" : "light";
}

/** A session override wins only for the current browser session. */
export function resolveTheme(
  date = new Date(),
  sessionOverride?: Theme | null
): Theme {
  return sessionOverride ?? automaticThemeForEasternTime(date);
}

export function toggledTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}

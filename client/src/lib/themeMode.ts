export type Theme = "light" | "dark";

export const EASTERN_TIME_ZONE = "America/New_York";
export const SESSION_THEME_OVERRIDE_KEY = "housingpa-admin-theme-override";

export interface ThemeSessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function hourInTimeZone(date: Date, timeZone: string): number | null {
  try {
    const hourPart = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone,
    })
      .formatToParts(date)
      .find(part => part.type === "hour");

    const hour = Number(hourPart?.value);
    return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
  } catch {
    return null;
  }
}

/**
 * Resolves an automatic theme for a supplied time zone. If a browser/runtime
 * cannot format that zone, the conservative light fallback keeps the hub
 * readable instead of throwing during application startup.
 */
export function automaticThemeForTimeZone(
  date = new Date(),
  timeZone = EASTERN_TIME_ZONE
): Theme {
  const hour = hourInTimeZone(date, timeZone);
  if (hour === null) return "light";

  return hour >= 18 || hour < 6 ? "dark" : "light";
}

/**
 * The hub's automatic theme follows business-local time, including daylight
 * saving time. Dark mode begins at 18:00 ET and ends at 06:00 ET.
 */
export function automaticThemeForEasternTime(date = new Date()): Theme {
  return automaticThemeForTimeZone(date, EASTERN_TIME_ZONE);
}

/**
 * Theme boundaries occur on a wall-clock minute. Aligning the next sync to
 * that minute avoids an arbitrary 60-second drift after the page first loads.
 */
export function millisecondsUntilNextMinute(date = new Date()): number {
  const elapsedThisMinute = date.getSeconds() * 1_000 + date.getMilliseconds();
  return Math.max(1, 60_000 - elapsedThisMinute);
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

export function readSessionThemeOverride(
  storage: ThemeSessionStorage | null | undefined
): Theme | null {
  if (!storage) return null;

  try {
    const stored = storage.getItem(SESSION_THEME_OVERRIDE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    return null;
  }
}

export function writeSessionThemeOverride(
  storage: ThemeSessionStorage | null | undefined,
  theme: Theme
): void {
  if (!storage) return;

  try {
    storage.setItem(SESSION_THEME_OVERRIDE_KEY, theme);
  } catch {
    // An in-memory override continues to work when browser storage is blocked.
  }
}

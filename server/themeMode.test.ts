import { describe, expect, it, vi } from "vitest";
import {
  automaticThemeForEasternTime,
  automaticThemeForTimeZone,
  millisecondsUntilNextMinute,
  readSessionThemeOverride,
  resolveTheme,
  toggledTheme,
  writeSessionThemeOverride,
} from "../client/src/lib/themeMode";

class MemorySessionStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("Admin Hub Eastern Time theme policy", () => {
  it("uses light mode immediately before 18:00 ET and dark mode at 18:00 ET", () => {
    expect(automaticThemeForEasternTime(new Date("2026-08-31T21:59:59Z"))).toBe(
      "light"
    );
    expect(automaticThemeForEasternTime(new Date("2026-08-31T22:00:00Z"))).toBe(
      "dark"
    );
  });

  it("keeps dark mode through 05:59 ET and returns to light mode at 06:00 ET", () => {
    expect(automaticThemeForEasternTime(new Date("2026-09-01T09:59:59Z"))).toBe(
      "dark"
    );
    expect(automaticThemeForEasternTime(new Date("2026-09-01T10:00:00Z"))).toBe(
      "light"
    );
  });

  it("keeps the Eastern schedule correct over daylight-saving-time changes", () => {
    expect(automaticThemeForEasternTime(new Date("2026-03-08T06:59:59Z"))).toBe(
      "dark"
    );
    expect(automaticThemeForEasternTime(new Date("2026-03-08T07:00:00Z"))).toBe(
      "dark"
    );
    expect(automaticThemeForEasternTime(new Date("2026-11-01T11:00:00Z"))).toBe(
      "light"
    );
  });

  it("aligns a live page resync to the next exact wall-clock minute", () => {
    expect(millisecondsUntilNextMinute(new Date("2026-08-31T21:59:10.000Z"))).toBe(
      50_000
    );
    expect(millisecondsUntilNextMinute(new Date("2026-08-31T21:59:59.999Z"))).toBe(
      1
    );
  });

  it("falls back safely when the zone is invalid or the time formatter is unavailable", () => {
    const evening = new Date("2026-08-31T22:00:00Z");
    expect(automaticThemeForTimeZone(evening, "Not/A-Time-Zone")).toBe("light");

    vi.stubGlobal("Intl", {
      DateTimeFormat: () => {
        throw new Error("formatter unavailable");
      },
    });
    expect(automaticThemeForEasternTime(evening)).toBe("light");
    vi.unstubAllGlobals();
  });

  it("honors a manual session choice across a reload in the same session", () => {
    const evening = new Date("2026-08-31T22:00:00Z");
    const session = new MemorySessionStorage();

    writeSessionThemeOverride(session, "light");
    expect(readSessionThemeOverride(session)).toBe("light");
    expect(resolveTheme(evening, readSessionThemeOverride(session))).toBe("light");
    expect(resolveTheme(evening, readSessionThemeOverride(session))).toBe("light");
  });

  it("uses the automatic Eastern schedule for a new browser session", () => {
    const evening = new Date("2026-08-31T22:00:00Z");
    const newSession = new MemorySessionStorage();

    expect(readSessionThemeOverride(newSession)).toBeNull();
    expect(resolveTheme(evening, readSessionThemeOverride(newSession))).toBe(
      "dark"
    );
    expect(toggledTheme("light")).toBe("dark");
    expect(toggledTheme("dark")).toBe("light");
  });
});

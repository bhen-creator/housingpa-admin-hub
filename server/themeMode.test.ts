import { describe, expect, it } from "vitest";
import {
  automaticThemeForEasternTime,
  resolveTheme,
  toggledTheme,
} from "../client/src/lib/themeMode";

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

  it("honors a manual session choice until that browser session ends", () => {
    const evening = new Date("2026-08-31T22:00:00Z");

    expect(resolveTheme(evening, "light")).toBe("light");
    expect(resolveTheme(evening, "dark")).toBe("dark");
    expect(toggledTheme("light")).toBe("dark");
    expect(toggledTheme("dark")).toBe("light");
  });
});

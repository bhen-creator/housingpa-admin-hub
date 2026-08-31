import React, { createContext, useContext, useEffect, useState } from "react";
import {
  automaticThemeForEasternTime,
  millisecondsUntilNextMinute,
  readSessionThemeOverride,
  resolveTheme,
  toggledTheme,
  type Theme,
  writeSessionThemeOverride,
} from "@/lib/themeMode";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  switchable?: boolean;
}

export function ThemeProvider({
  children,
  switchable = true,
}: ThemeProviderProps) {
  const [sessionOverride, setSessionOverride] = useState<Theme | null>(() => {
    if (!switchable || typeof window === "undefined") return null;
    return readSessionThemeOverride(window.sessionStorage);
  });
  const [theme, setTheme] = useState<Theme>(() =>
    resolveTheme(new Date(), sessionOverride)
  );

  useEffect(() => {
    if (sessionOverride) {
      setTheme(sessionOverride);
      return;
    }

    const syncAutomaticTheme = () => {
      setTheme(automaticThemeForEasternTime());
    };

    syncAutomaticTheme();
    let timeoutId: number | undefined;
    const scheduleNextSync = () => {
      timeoutId = window.setTimeout(() => {
        syncAutomaticTheme();
        scheduleNextSync();
      }, millisecondsUntilNextMinute());
    };
    const syncWhenVisible = () => {
      if (!document.hidden) syncAutomaticTheme();
    };

    scheduleNextSync();
    document.addEventListener("visibilitychange", syncWhenVisible);
    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, [sessionOverride]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

  }, [theme]);

  const toggleTheme = () => {
    if (!switchable) return;

    const nextTheme = toggledTheme(theme);
    setTheme(nextTheme);
    setSessionOverride(nextTheme);
    writeSessionThemeOverride(window.sessionStorage, nextTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, switchable }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}

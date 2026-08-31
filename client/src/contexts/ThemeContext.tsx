import React, { createContext, useContext, useEffect, useState } from "react";
import {
  automaticThemeForEasternTime,
  resolveTheme,
  toggledTheme,
  type Theme,
} from "@/lib/themeMode";

const SESSION_THEME_OVERRIDE_KEY = "housingpa-admin-theme-override";

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

    try {
      const stored = window.sessionStorage.getItem(SESSION_THEME_OVERRIDE_KEY);
      return stored === "light" || stored === "dark" ? stored : null;
    } catch {
      return null;
    }
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
    const intervalId = window.setInterval(syncAutomaticTheme, 60_000);
    return () => window.clearInterval(intervalId);
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
    try {
      window.sessionStorage.setItem(SESSION_THEME_OVERRIDE_KEY, nextTheme);
    } catch {
      // A private browser policy may prevent session storage; the in-memory
      // override still applies until this page is closed.
    }
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

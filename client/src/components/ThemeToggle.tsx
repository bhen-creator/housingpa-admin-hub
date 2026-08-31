import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const nextTheme = theme === "dark" ? "light" : "dark";
  const Icon = theme === "dark" ? Moon : Sun;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-pressed={theme === "dark"}
      aria-label={`Switch to ${nextTheme} mode. Current mode is ${theme}.`}
      title={`Current mode: ${theme}. Switch to ${nextTheme} mode.`}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#c9d7cc] bg-white px-2.5 text-[11px] font-semibold text-[#275c4e] shadow-sm transition hover:border-[#9db9a7] hover:bg-[#eef4ee] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4d8977] dark:border-[#42615c] dark:bg-[#18302f] dark:text-[#d5eee5] dark:hover:border-[#78a494] dark:hover:bg-[#21413e] dark:focus-visible:ring-[#9fc9b9]",
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{theme === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}

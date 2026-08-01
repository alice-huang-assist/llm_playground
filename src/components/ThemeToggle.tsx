"use client";

import { useSyncExternalStore } from "react";

import {
  THEME_PREFERENCES,
  getServerThemeSnapshot,
  getThemeSnapshot,
  setThemePreference,
  subscribeTheme,
  type ThemePreference,
} from "@/lib/theme";

const LABELS: Record<ThemePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

export default function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );

  return (
    <div
      className="inline-flex overflow-hidden rounded-sm border border-border"
      role="group"
      aria-label="Color theme"
    >
      {THEME_PREFERENCES.map((option) => {
        const active = theme === option;
        return (
          <button
            key={option}
            type="button"
            className={`flex-1 border-r border-border px-2 py-1 text-meta transition-colors last:border-r-0 ${
              active
                ? "bg-accent text-on-accent"
                : "text-ink-muted hover:bg-surface-sunken hover:text-ink"
            }`}
            aria-pressed={active}
            onClick={() => setThemePreference(option)}
          >
            {LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}

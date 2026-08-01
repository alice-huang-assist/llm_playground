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

import styles from "./ThemeToggle.module.css";

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
    <div className={styles.group} role="group" aria-label="Color theme">
      {THEME_PREFERENCES.map((option) => (
        <button
          key={option}
          type="button"
          className={styles.option}
          aria-pressed={theme === option}
          onClick={() => setThemePreference(option)}
        >
          {LABELS[option]}
        </button>
      ))}
    </div>
  );
}

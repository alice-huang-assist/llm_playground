import { afterEach, describe, expect, it, vi } from "vitest";

import {
  THEME_BOOTSTRAP_SCRIPT,
  THEME_STORAGE_KEY,
  applyTheme,
  getServerThemeSnapshot,
  getThemeSnapshot,
  isThemePreference,
  parseThemePreference,
  readStoredTheme,
  setThemePreference,
  writeStoredTheme,
} from "./theme";

describe("theme preference helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts only light, dark, and system", () => {
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("auto")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });

  it("parses stored values with a system fallback", () => {
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference(null)).toBe("system");
    expect(parseThemePreference("nope")).toBe("system");
  });

  it("reads and writes localStorage through the shared key", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    };

    expect(readStoredTheme(storage)).toBe("system");
    writeStoredTheme("light", storage);
    expect(store.get(THEME_STORAGE_KEY)).toBe("light");
    expect(readStoredTheme(storage)).toBe("light");
  });

  it("survives storage failures", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };

    expect(readStoredTheme(broken)).toBe("system");
    expect(() => writeStoredTheme("dark", broken)).not.toThrow();
  });

  it("applies data-theme on the document root", () => {
    const root = { setAttribute: vi.fn() };
    applyTheme("dark", root);
    expect(root.setAttribute).toHaveBeenCalledWith("data-theme", "dark");
  });

  it("embeds the storage key in the bootstrap script", () => {
    expect(THEME_BOOTSTRAP_SCRIPT).toContain(THEME_STORAGE_KEY);
    expect(THEME_BOOTSTRAP_SCRIPT).toContain('setAttribute("data-theme"');
  });

  it("exposes a stable server snapshot for hydration", () => {
    expect(getServerThemeSnapshot()).toBe("system");
  });

  it("setThemePreference updates the client snapshot", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
    const root = { setAttribute: vi.fn() };
    vi.stubGlobal("document", { documentElement: root });

    setThemePreference("dark");
    expect(getThemeSnapshot()).toBe("dark");
    expect(store.get(THEME_STORAGE_KEY)).toBe("dark");
    expect(root.setAttribute).toHaveBeenCalledWith("data-theme", "dark");
  });
});

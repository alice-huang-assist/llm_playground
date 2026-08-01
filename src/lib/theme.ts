export const THEME_STORAGE_KEY = "llm-playground-theme";

export const THEME_PREFERENCES = ["light", "dark", "system"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === "string" &&
    (THEME_PREFERENCES as readonly string[]).includes(value)
  );
}

/** Read a stored preference; unknown or missing values fall back to system. */
export function parseThemePreference(value: string | null): ThemePreference {
  return isThemePreference(value) ? value : "system";
}

export function readStoredTheme(
  storage: Pick<Storage, "getItem"> | null | undefined = globalThis.localStorage,
): ThemePreference {
  if (!storage) return "system";
  try {
    return parseThemePreference(storage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function writeStoredTheme(
  theme: ThemePreference,
  storage: Pick<Storage, "setItem"> | null | undefined = globalThis.localStorage,
): void {
  if (!storage) return;
  try {
    storage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Quota / private mode — preference still applies for this session via DOM.
  }
}

export function applyTheme(
  theme: ThemePreference,
  root: Pick<HTMLElement, "setAttribute"> = document.documentElement,
): void {
  root.setAttribute("data-theme", theme);
}

/** Inline bootstrap for `<head>` — keep in sync with `THEME_STORAGE_KEY`. */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t!=="light"&&t!=="dark"&&t!=="system")t="system";document.documentElement.setAttribute("data-theme",t);}catch(e){document.documentElement.setAttribute("data-theme","system");}})();`;

type ThemeListener = () => void;

let clientTheme: ThemePreference | null = null;
const themeListeners = new Set<ThemeListener>();

function emitThemeChange() {
  for (const listener of themeListeners) {
    listener();
  }
}

/** Subscribe for `useSyncExternalStore` — same-tab + cross-tab updates. */
export function subscribeTheme(listener: ThemeListener): () => void {
  themeListeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) {
      clientTheme = readStoredTheme();
      emitThemeChange();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    themeListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getThemeSnapshot(): ThemePreference {
  if (clientTheme === null) {
    clientTheme = readStoredTheme();
  }
  return clientTheme;
}

export function getServerThemeSnapshot(): ThemePreference {
  return "system";
}

/** Persist, apply to `<html>`, and notify subscribers. */
export function setThemePreference(theme: ThemePreference): void {
  clientTheme = theme;
  writeStoredTheme(theme);
  applyTheme(theme);
  emitThemeChange();
}

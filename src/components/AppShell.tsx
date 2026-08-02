"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import ThemeToggle from "@/components/ThemeToggle";
import { DEFAULT_COMFYUI_BASE_URL } from "@/lib/providers/comfyui-shared";
import { DEFAULT_FORGE_BASE_URL } from "@/lib/providers/forge-shared";

const NAV = [
  { href: "/", label: "Chat" },
  { href: "/generate", label: "Images" },
  { href: "/settings", label: "Settings" },
] as const;

const EXTERNAL = [
  { href: DEFAULT_FORGE_BASE_URL, label: "Forge" },
  { href: DEFAULT_COMFYUI_BASE_URL, label: "ComfyUI" },
] as const;

/**
 * Routes fill the rail's contextual area and the right inspector by portalling
 * into these nodes. Passing React elements up through context instead would
 * mean writing to state on every render of the child; portals keep ownership
 * with the route and need no synchronisation.
 */
interface ShellSlots {
  contextualEl: HTMLElement | null;
  inspectorEl: HTMLElement | null;
}

const SlotContext = createContext<ShellSlots>({
  contextualEl: null,
  inspectorEl: null,
});

export function useShellSlots(): ShellSlots {
  return useContext(SlotContext);
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [contextualEl, setContextualEl] = useState<HTMLElement | null>(null);
  const [inspectorEl, setInspectorEl] = useState<HTMLElement | null>(null);

  const slots = useMemo(
    () => ({ contextualEl, inspectorEl }),
    [contextualEl, inspectorEl],
  );

  return (
    // From `lg` up the shell owns the scrolling: it is exactly one viewport
    // tall and each region scrolls itself, so the rail cannot scroll away.
    // `position: sticky` is not an option here — `html, body { overflow-x:
    // hidden }` makes the body a scroll container, which leaves sticky with
    // nothing to stick to. Below `lg` the rail and inspector stack above the
    // canvas and the document scrolls normally.
    <SlotContext.Provider value={slots}>
      <div className="flex min-h-screen flex-col lg:h-screen lg:min-h-0 lg:flex-row lg:overflow-hidden">
        <aside className="order-1 flex w-full flex-col border-b border-border bg-surface lg:h-full lg:w-64 lg:shrink-0 lg:border-r lg:border-b-0">
          <Link href="/" className="px-5 pt-6 pb-5">
            <h1 className="font-display text-h2 leading-none">LLM Playground</h1>
          </Link>

          <nav aria-label="Primary" className="flex flex-col gap-0.5 px-3">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-sm px-2.5 py-1.5 text-label transition-colors ${
                    active
                      ? "bg-accent-subtle text-ink"
                      : "text-ink-muted hover:bg-surface-sunken hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* `empty:hidden` is what keeps this from leaving a border or a gap
              on routes that portal nothing in. */}
          <div
            ref={setContextualEl}
            className="mt-6 min-h-0 flex-1 overflow-y-auto border-t border-border px-3 pt-4 empty:hidden"
          />

          <div className="mt-auto flex flex-col gap-3 px-5 pt-6 pb-5">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {EXTERNAL.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-meta text-ink-subtle underline underline-offset-2 transition-colors hover:text-accent-text"
                >
                  {item.label}
                </a>
              ))}
            </div>
            <ThemeToggle />
          </div>
        </aside>

        <main className="order-3 min-w-0 flex-1 lg:order-2 lg:h-full lg:overflow-y-auto">
          {children}
        </main>

        <aside
          ref={setInspectorEl}
          className="order-2 w-full shrink-0 overflow-y-auto border-b border-border bg-surface empty:hidden lg:order-3 lg:h-full lg:w-80 lg:border-b-0 lg:border-l"
        />
      </div>
    </SlotContext.Provider>
  );
}

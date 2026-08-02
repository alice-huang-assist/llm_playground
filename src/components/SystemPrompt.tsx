"use client";

import { useState } from "react";

export default function SystemPrompt({
  value,
  onChange,
  onCommit,
  defaultOpen = false,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Fired when editing settles, so the prompt can be saved without churn. */
  onCommit?: () => void;
  /** Sessions that stored a prompt open expanded; a fresh one stays folded. */
  defaultOpen?: boolean;
}) {
  // Seeded once per mount, then owned by the user. Driving `open` straight from
  // the prop made the section spring open on its own the moment the first turn
  // persisted a prompt to the session.
  const [open, setOpen] = useState(defaultOpen);

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="group rounded-md border border-border bg-surface"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-label text-ink-muted transition-colors hover:text-ink">
        <span
          aria-hidden="true"
          className="text-ink-subtle transition-transform group-open:rotate-90"
        >
          ›
        </span>
        System prompt
      </summary>
      <div className="px-4 pb-4">
        <label className="sr-only" htmlFor="system-prompt">
          System prompt
        </label>
        <textarea
          id="system-prompt"
          className="w-full resize-y rounded-sm border border-border bg-canvas px-3 py-2 text-body text-ink placeholder:text-ink-subtle"
          rows={3}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => onCommit?.()}
          placeholder="Instructions the model receives before the conversation"
        />
      </div>
    </details>
  );
}

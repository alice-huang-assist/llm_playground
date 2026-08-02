"use client";

import { useState } from "react";

import type { SessionSummary } from "@/lib/db/sessions";

function displayName(session: SessionSummary) {
  return session.name === "" ? "Untitled session" : session.name;
}

export default function SessionSidebar({
  sessions,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: {
  sessions: SessionSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const startRename = (session: SessionSummary) => {
    setConfirmingId(null);
    setRenamingId(session.id);
    setDraftName(displayName(session));
  };

  const commitRename = (id: string) => {
    const name = draftName.trim();
    if (name !== "") onRename(id, name);
    setRenamingId(null);
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="text-meta tracking-wide text-ink-subtle uppercase">
          Sessions
        </h2>
        <button
          type="button"
          className="rounded-sm px-1.5 py-0.5 text-meta text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
          onClick={onNew}
        >
          New
        </button>
      </div>

      {sessions.length === 0 ? (
        <p className="px-1 text-meta text-ink-subtle">No saved sessions yet.</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {sessions.map((session) => {
            const active = session.id === activeId;
            return (
              <li key={session.id} className="group/session">
                {renamingId === session.id ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      commitRename(session.id);
                    }}
                  >
                    <input
                      className="w-full rounded-sm border border-accent bg-canvas px-2 py-1 text-label text-ink"
                      value={draftName}
                      autoFocus
                      onChange={(event) => setDraftName(event.target.value)}
                      onBlur={() => commitRename(session.id)}
                      aria-label="Session name"
                    />
                  </form>
                ) : (
                  <div
                    className={`rounded-sm transition-colors ${
                      active ? "bg-accent-subtle" : "hover:bg-surface-sunken"
                    }`}
                  >
                    <button
                      type="button"
                      className="flex w-full flex-col items-start gap-0.5 px-2 py-1.5 text-left"
                      onClick={() => onSelect(session.id)}
                      aria-current={active ? "true" : undefined}
                    >
                      <span
                        className={`w-full truncate text-label ${
                          active ? "text-ink" : "text-ink-muted"
                        }`}
                      >
                        {displayName(session)}
                      </span>
                      <span className="text-meta text-ink-subtle">
                        {session.messageCount} message
                        {session.messageCount === 1 ? "" : "s"}
                      </span>
                    </button>

                    {/* Focus-within keeps these reachable by keyboard, not just
                        on hover. */}
                    <div
                      className={`flex gap-1 px-2 pb-1.5 ${
                        active
                          ? ""
                          : "invisible group-focus-within/session:visible group-hover/session:visible"
                      }`}
                    >
                      <button
                        type="button"
                        className="rounded-sm text-meta text-ink-subtle transition-colors hover:text-ink"
                        onClick={() => startRename(session)}
                      >
                        Rename
                      </button>
                      {confirmingId === session.id ? (
                        <>
                          <button
                            type="button"
                            className="rounded-sm text-meta text-danger transition-opacity hover:opacity-80"
                            onClick={() => {
                              setConfirmingId(null);
                              onDelete(session.id);
                            }}
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            className="rounded-sm text-meta text-ink-subtle transition-colors hover:text-ink"
                            onClick={() => setConfirmingId(null)}
                          >
                            Keep
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="rounded-sm text-meta text-ink-subtle transition-colors hover:text-ink"
                          onClick={() => setConfirmingId(session.id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

"use client";

import { useState } from "react";

import type { SessionSummary } from "@/lib/db/sessions";

import styles from "./SessionSidebar.module.css";

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
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <h2 className={styles.title}>Sessions</h2>
        <button type="button" className={styles.action} onClick={onNew}>
          New
        </button>
      </div>

      {sessions.length === 0 ? (
        <p className={styles.empty}>No saved sessions yet.</p>
      ) : (
        <ul className={styles.list}>
          {sessions.map((session) => (
            <li
              key={session.id}
              className={
                session.id === activeId ? styles.itemActive : styles.item
              }
            >
              {renamingId === session.id ? (
                <form
                  className={styles.renameRow}
                  onSubmit={(event) => {
                    event.preventDefault();
                    commitRename(session.id);
                  }}
                >
                  <input
                    className={styles.renameInput}
                    value={draftName}
                    autoFocus
                    onChange={(event) => setDraftName(event.target.value)}
                    onBlur={() => commitRename(session.id)}
                    aria-label="Session name"
                  />
                </form>
              ) : (
                <button
                  type="button"
                  className={styles.name}
                  onClick={() => onSelect(session.id)}
                >
                  {displayName(session)}
                  <span className={styles.meta}>
                    {session.messageCount} message
                    {session.messageCount === 1 ? "" : "s"}
                  </span>
                </button>
              )}

              <div className={styles.controls}>
                <button
                  type="button"
                  className={styles.action}
                  onClick={() => startRename(session)}
                >
                  Rename
                </button>
                {confirmingId === session.id ? (
                  <>
                    <button
                      type="button"
                      className={styles.danger}
                      onClick={() => {
                        setConfirmingId(null);
                        onDelete(session.id);
                      }}
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      className={styles.action}
                      onClick={() => setConfirmingId(null)}
                    >
                      Keep
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() => setConfirmingId(session.id)}
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

import type { DatabaseSync } from "node:sqlite";

export interface SessionMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SessionSummary {
  id: string;
  name: string;
  providerId: string | null;
  modelId: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface Session extends SessionSummary {
  systemPrompt: string;
  messages: SessionMessage[];
}

export interface SessionInput {
  name?: string;
  providerId?: string | null;
  modelId?: string | null;
  systemPrompt?: string;
  messages?: SessionMessage[];
}

interface SessionRow {
  id: string;
  name: string;
  provider_id: string | null;
  model_id: string | null;
  system_prompt: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

const SUMMARY_SELECT = `
  SELECT s.id, s.name, s.provider_id, s.model_id, s.system_prompt,
         s.created_at, s.updated_at,
         (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS message_count
  FROM sessions s
`;

function toSummary(row: SessionRow): SessionSummary {
  return {
    id: row.id,
    name: row.name,
    providerId: row.provider_id,
    modelId: row.model_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: Number(row.message_count),
  };
}

/**
 * A readable name for a session that was never named, taken from what the user
 * opened with. Falls back rather than leaving a session anonymous.
 */
export function deriveSessionName(messages: SessionMessage[]): string {
  const first = messages.find((message) => message.role === "user");
  const cleaned = (first?.content ?? "").replace(/\s+/g, " ").trim();
  if (cleaned === "") return "Untitled session";
  return cleaned.length > 48 ? `${cleaned.slice(0, 47).trimEnd()}…` : cleaned;
}

export function createSession(
  db: DatabaseSync,
  input: SessionInput = {},
): Session {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO sessions
       (id, name, provider_id, model_id, system_prompt, created_at, updated_at, sequence)
     VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT IFNULL(MAX(sequence), 0) + 1 FROM sessions))`,
  ).run(
    id,
    input.name ?? "",
    input.providerId ?? null,
    input.modelId ?? null,
    input.systemPrompt ?? "",
    now,
    now,
  );

  if (input.messages?.length) replaceMessages(db, id, input.messages);

  const session = getSession(db, id);
  if (!session) throw new Error("Session vanished immediately after insert");
  return session;
}

/** Newest first, so the sidebar reads as a history. */
export function listSessions(db: DatabaseSync): SessionSummary[] {
  const rows = db
    .prepare(`${SUMMARY_SELECT} ORDER BY s.sequence DESC`)
    .all() as unknown as SessionRow[];

  return rows.map(toSummary);
}

export function getSession(db: DatabaseSync, id: string): Session | null {
  const row = db.prepare(`${SUMMARY_SELECT} WHERE s.id = ?`).get(id) as
    | SessionRow
    | undefined;
  if (!row) return null;

  const messages = db
    .prepare(
      "SELECT role, content FROM messages WHERE session_id = ? ORDER BY position ASC",
    )
    .all(id) as unknown as SessionMessage[];

  return {
    ...toSummary(row),
    systemPrompt: row.system_prompt,
    messages: messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  };
}

function replaceMessages(
  db: DatabaseSync,
  id: string,
  messages: SessionMessage[],
) {
  db.prepare("DELETE FROM messages WHERE session_id = ?").run(id);

  const insert = db.prepare(
    "INSERT INTO messages (session_id, position, role, content) VALUES (?, ?, ?, ?)",
  );
  messages.forEach((message, position) => {
    insert.run(id, position, message.role, message.content);
  });
}

/**
 * Apply a partial update. Only the fields present are touched, so persisting a
 * finished turn does not disturb the session's name or model.
 */
export function updateSession(
  db: DatabaseSync,
  id: string,
  input: SessionInput,
): Session | null {
  const existing = getSession(db, id);
  if (!existing) return null;

  db.exec("BEGIN");
  try {
    if (input.messages !== undefined) {
      replaceMessages(db, id, input.messages);
    }

    // An unnamed session takes its name from the conversation it starts.
    const messages = input.messages ?? existing.messages;
    const name =
      input.name !== undefined
        ? input.name
        : existing.name === "" && messages.length > 0
          ? deriveSessionName(messages)
          : existing.name;

    db.prepare(
      `UPDATE sessions
         SET name = ?, provider_id = ?, model_id = ?, system_prompt = ?, updated_at = ?,
             sequence = (SELECT IFNULL(MAX(sequence), 0) + 1 FROM sessions)
       WHERE id = ?`,
    ).run(
      name,
      input.providerId !== undefined ? input.providerId : existing.providerId,
      input.modelId !== undefined ? input.modelId : existing.modelId,
      input.systemPrompt !== undefined
        ? input.systemPrompt
        : existing.systemPrompt,
      new Date().toISOString(),
      id,
    );

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return getSession(db, id);
}

export function deleteSession(db: DatabaseSync, id: string): boolean {
  const result = db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  return Number(result.changes) > 0;
}

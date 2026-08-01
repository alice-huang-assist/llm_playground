import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

export interface GenerationSummary {
  id: string;
  providerId: string;
  modelId: string;
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  steps: number;
  seed: number | null;
  cfgScale: number;
  sampler: string;
  createdAt: string;
}

export interface Generation extends GenerationSummary {
  filePath: string;
}

export interface GenerationInput {
  providerId: string;
  modelId: string;
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  steps: number;
  seed: number | null;
  cfgScale: number;
  sampler: string;
  /** Raw PNG (or other image) bytes. */
  imageBytes: Buffer;
}

interface GenerationRow {
  id: string;
  provider_id: string;
  model_id: string;
  prompt: string;
  negative_prompt: string;
  width: number;
  height: number;
  steps: number;
  seed: number | null;
  cfg_scale: number;
  sampler: string;
  file_path: string;
  created_at: string;
}

function generationsDir(): string {
  return (
    process.env.PLAYGROUND_GENERATIONS_DIR ??
    path.join(process.cwd(), "data", "generations")
  );
}

function toSummary(row: GenerationRow): GenerationSummary {
  return {
    id: row.id,
    providerId: row.provider_id,
    modelId: row.model_id,
    prompt: row.prompt,
    negativePrompt: row.negative_prompt,
    width: Number(row.width),
    height: Number(row.height),
    steps: Number(row.steps),
    seed: row.seed === null || row.seed === undefined ? null : Number(row.seed),
    cfgScale: Number(row.cfg_scale),
    sampler: row.sampler,
    createdAt: row.created_at,
  };
}

function toGeneration(row: GenerationRow): Generation {
  return { ...toSummary(row), filePath: row.file_path };
}

export function listGenerations(db: DatabaseSync): GenerationSummary[] {
  const rows = db
    .prepare(
      `SELECT id, provider_id, model_id, prompt, negative_prompt,
              width, height, steps, seed, cfg_scale, sampler, file_path, created_at
       FROM generations
       ORDER BY created_at DESC`,
    )
    .all() as unknown as GenerationRow[];
  return rows.map(toSummary);
}

export function getGeneration(
  db: DatabaseSync,
  id: string,
): Generation | null {
  const row = db
    .prepare(
      `SELECT id, provider_id, model_id, prompt, negative_prompt,
              width, height, steps, seed, cfg_scale, sampler, file_path, created_at
       FROM generations WHERE id = ?`,
    )
    .get(id) as unknown as GenerationRow | undefined;
  return row ? toGeneration(row) : null;
}

export function createGeneration(
  db: DatabaseSync,
  input: GenerationInput,
): Generation {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const dir = generationsDir();
  mkdirSync(dir, { recursive: true });
  const absolutePath = path.join(dir, `${id}.png`);
  writeFileSync(absolutePath, input.imageBytes);

  db.prepare(
    `INSERT INTO generations
       (id, provider_id, model_id, prompt, negative_prompt,
        width, height, steps, seed, cfg_scale, sampler, file_path, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.providerId,
    input.modelId,
    input.prompt,
    input.negativePrompt,
    input.width,
    input.height,
    input.steps,
    input.seed,
    input.cfgScale,
    input.sampler,
    absolutePath,
    now,
  );

  const generation = getGeneration(db, id);
  if (!generation) throw new Error("Generation vanished immediately after insert");
  return generation;
}

export function deleteGeneration(db: DatabaseSync, id: string): boolean {
  const existing = getGeneration(db, id);
  if (!existing) return false;

  db.prepare("DELETE FROM generations WHERE id = ?").run(id);

  const absolute = path.isAbsolute(existing.filePath)
    ? existing.filePath
    : path.join(process.cwd(), existing.filePath);
  try {
    unlinkSync(absolute);
  } catch {
    /* file may already be gone */
  }
  return true;
}

/** Resolve on-disk path for serving a generation image. */
export function absoluteGenerationPath(generation: Generation): string {
  return path.isAbsolute(generation.filePath)
    ? generation.filePath
    : path.join(process.cwd(), generation.filePath);
}

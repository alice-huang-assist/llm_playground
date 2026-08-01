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
  usedReference: boolean;
  denoisingStrength: number | null;
  /** Shared id for multi-image runs; null for single-image generations. */
  batchId: string | null;
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
  usedReference?: boolean;
  denoisingStrength?: number | null;
  batchId?: string | null;
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
  used_reference: number | null;
  denoising_strength: number | null;
  batch_id: string | null;
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
    usedReference: Number(row.used_reference ?? 0) === 1,
    denoisingStrength:
      row.denoising_strength === null || row.denoising_strength === undefined
        ? null
        : Number(row.denoising_strength),
    batchId:
      typeof row.batch_id === "string" && row.batch_id !== ""
        ? row.batch_id
        : null,
    createdAt: row.created_at,
  };
}

function toGeneration(row: GenerationRow): Generation {
  return { ...toSummary(row), filePath: row.file_path };
}

const SELECT_COLS = `id, provider_id, model_id, prompt, negative_prompt,
              width, height, steps, seed, cfg_scale, sampler, file_path, created_at,
              used_reference, denoising_strength, batch_id`;

export function listGenerations(db: DatabaseSync): GenerationSummary[] {
  const rows = db
    .prepare(
      `SELECT ${SELECT_COLS}
       FROM generations
       ORDER BY created_at DESC`,
    )
    .all() as unknown as GenerationRow[];
  return rows.map(toSummary);
}

export function listGenerationsByBatchId(
  db: DatabaseSync,
  batchId: string,
): GenerationSummary[] {
  const rows = db
    .prepare(
      `SELECT ${SELECT_COLS}
       FROM generations
       WHERE batch_id = ?
       ORDER BY created_at ASC`,
    )
    .all(batchId) as unknown as GenerationRow[];
  return rows.map(toSummary);
}

export function getGeneration(
  db: DatabaseSync,
  id: string,
): Generation | null {
  const row = db
    .prepare(
      `SELECT ${SELECT_COLS}
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

  const usedReference = input.usedReference === true;
  const strength =
    usedReference && input.denoisingStrength !== undefined
      ? input.denoisingStrength
      : null;
  const batchId =
    typeof input.batchId === "string" && input.batchId !== ""
      ? input.batchId
      : null;

  db.prepare(
    `INSERT INTO generations
       (id, provider_id, model_id, prompt, negative_prompt,
        width, height, steps, seed, cfg_scale, sampler, file_path, created_at,
        used_reference, denoising_strength, batch_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    usedReference ? 1 : 0,
    strength,
    batchId,
  );

  const generation = getGeneration(db, id);
  if (!generation) throw new Error("Generation vanished immediately after insert");
  return generation;
}

function unlinkGenerationFile(filePath: string) {
  const absolute = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);
  try {
    unlinkSync(absolute);
  } catch {
    /* file may already be gone */
  }
}

export function deleteGeneration(db: DatabaseSync, id: string): boolean {
  const existing = getGeneration(db, id);
  if (!existing) return false;

  db.prepare("DELETE FROM generations WHERE id = ?").run(id);
  unlinkGenerationFile(existing.filePath);
  return true;
}

/** Delete every generation sharing a batch id. Returns how many rows were removed. */
export function deleteGenerationsByBatchId(
  db: DatabaseSync,
  batchId: string,
): number {
  if (batchId === "") return 0;
  const rows = db
    .prepare(
      `SELECT ${SELECT_COLS}
       FROM generations WHERE batch_id = ?`,
    )
    .all(batchId) as unknown as GenerationRow[];
  if (rows.length === 0) return 0;

  db.prepare("DELETE FROM generations WHERE batch_id = ?").run(batchId);
  for (const row of rows) {
    unlinkGenerationFile(row.file_path);
  }
  return rows.length;
}

/** Resolve on-disk path for serving a generation image. */
export function absoluteGenerationPath(generation: Generation): string {
  return path.isAbsolute(generation.filePath)
    ? generation.filePath
    : path.join(process.cwd(), generation.filePath);
}

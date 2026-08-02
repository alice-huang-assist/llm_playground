/**
 * Group flat generation history into single rows vs collapsible batches.
 */

export interface HistoryGeneration {
  id: string;
  prompt: string;
  batchId: string | null;
  createdAt: string;
  usedReference: boolean;
}

export type HistoryGroup =
  | { kind: "single"; item: HistoryGeneration }
  | { kind: "batch"; batchId: string; items: HistoryGeneration[] };

/**
 * Preserve newest-first order from the API list. Batches appear once at the
 * position of their newest member; members inside a batch are oldest-first.
 */
export function groupGenerations<T extends HistoryGeneration>(
  generations: T[],
): Array<
  { kind: "single"; item: T } | { kind: "batch"; batchId: string; items: T[] }
> {
  const seenBatches = new Set<string>();
  const groups: Array<
    { kind: "single"; item: T } | { kind: "batch"; batchId: string; items: T[] }
  > = [];

  for (const item of generations) {
    if (!item.batchId) {
      groups.push({ kind: "single", item });
      continue;
    }
    if (seenBatches.has(item.batchId)) continue;
    seenBatches.add(item.batchId);
    const items = generations
      .filter((entry) => entry.batchId === item.batchId)
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    groups.push({ kind: "batch", batchId: item.batchId, items });
  }

  return groups;
}

/**
 * Short relative age for a history row, e.g. `now`, `4m`, `3h`, `2d`.
 * `now` is injectable so the result is testable without freezing the clock.
 * Unparseable or future timestamps fall back to `now` rather than showing a
 * negative age.
 */
export function formatRelativeTime(
  createdAt: string,
  now: number = Date.now(),
): string {
  const then = Date.parse(createdAt);
  if (Number.isNaN(then)) return "now";

  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return "now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  return `${days}d`;
}

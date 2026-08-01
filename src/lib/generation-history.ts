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
  | { kind: "single"; item: T }
  | { kind: "batch"; batchId: string; items: T[] }
> {
  const seenBatches = new Set<string>();
  const groups: Array<
    | { kind: "single"; item: T }
    | { kind: "batch"; batchId: string; items: T[] }
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

import { describe, expect, it } from "vitest";

import { groupGenerations } from "@/lib/generation-history";

describe("groupGenerations", () => {
  it("keeps singles flat and collapses batches", () => {
    const groups = groupGenerations([
      {
        id: "a",
        prompt: "one",
        batchId: null,
        createdAt: "2026-01-03T00:00:00.000Z",
        usedReference: false,
      },
      {
        id: "b2",
        prompt: "batch",
        batchId: "batch-1",
        createdAt: "2026-01-02T00:00:02.000Z",
        usedReference: false,
      },
      {
        id: "b1",
        prompt: "batch",
        batchId: "batch-1",
        createdAt: "2026-01-02T00:00:01.000Z",
        usedReference: false,
      },
      {
        id: "c",
        prompt: "old",
        batchId: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        usedReference: true,
      },
    ]);

    expect(groups).toHaveLength(3);
    expect(groups[0]).toMatchObject({ kind: "single", item: { id: "a" } });
    expect(groups[1]).toMatchObject({ kind: "batch", batchId: "batch-1" });
    if (groups[1]?.kind === "batch") {
      expect(groups[1].items.map((item) => item.id)).toEqual(["b1", "b2"]);
    }
    expect(groups[2]).toMatchObject({ kind: "single", item: { id: "c" } });
  });
});

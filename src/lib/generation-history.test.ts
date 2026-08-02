import { describe, expect, it } from "vitest";

import { formatRelativeTime, groupGenerations } from "@/lib/generation-history";

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

describe("formatRelativeTime", () => {
  const now = Date.parse("2026-01-10T12:00:00.000Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it("reports anything under a minute as now", () => {
    expect(formatRelativeTime(ago(0), now)).toBe("now");
    expect(formatRelativeTime(ago(59_000), now)).toBe("now");
  });

  it("counts whole minutes, then hours, then days", () => {
    expect(formatRelativeTime(ago(60_000), now)).toBe("1m");
    expect(formatRelativeTime(ago(59 * 60_000), now)).toBe("59m");
    expect(formatRelativeTime(ago(60 * 60_000), now)).toBe("1h");
    expect(formatRelativeTime(ago(23 * 3_600_000), now)).toBe("23h");
    expect(formatRelativeTime(ago(24 * 3_600_000), now)).toBe("1d");
    expect(formatRelativeTime(ago(9 * 24 * 3_600_000), now)).toBe("9d");
  });

  it("never reports a negative age for a future or unparseable stamp", () => {
    expect(formatRelativeTime(ago(-5 * 60_000), now)).toBe("now");
    expect(formatRelativeTime("not a date", now)).toBe("now");
  });
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openDatabase } from "@/lib/db/client";
import { FORGE_PROVIDER_ID } from "@/lib/providers/forge";

const fake = vi.hoisted(() => ({
  db: null as unknown,
  generationsDir: "",
  txt2img: vi.fn(),
}));

vi.mock("@/lib/db/client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/db/client")>("@/lib/db/client");
  return {
    ...actual,
    getDatabase: () => fake.db as ReturnType<typeof actual.getDatabase>,
  };
});

vi.mock("@/lib/providers/forge", async () => {
  const actual = await vi.importActual<typeof import("@/lib/providers/forge")>(
    "@/lib/providers/forge",
  );
  return {
    ...actual,
    getForgeBaseUrl: () => "http://forge.test",
    forgeTxt2Img: (...args: unknown[]) => fake.txt2img(...args),
    interruptForge: vi.fn(async () => undefined),
  };
});

const { POST } = await import("./route");

function post(body: unknown, signal?: AbortSignal) {
  return POST(
    new Request("http://localhost:3000/api/images/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    }),
  );
}

async function readNdjson(response: Response) {
  const text = await response.text();
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

beforeEach(() => {
  fake.generationsDir = mkdtempSync(path.join(tmpdir(), "gens-"));
  process.env.PLAYGROUND_GENERATIONS_DIR = fake.generationsDir;
  fake.db = openDatabase(":memory:");
  fake.txt2img.mockReset();
  fake.txt2img.mockImplementation(
    async (request: { onProgress?: (p: { percent: number }) => void }) => {
      request.onProgress?.({ percent: 40 });
      return {
        imageBase64: Buffer.from("png-bytes").toString("base64"),
        seed: 99,
      };
    },
  );
});

afterEach(() => {
  rmSync(fake.generationsDir, { recursive: true, force: true });
  delete process.env.PLAYGROUND_GENERATIONS_DIR;
});

describe("POST /api/images/generate", () => {
  it("streams progress then a persisted generation", async () => {
    const response = await post({
      providerId: FORGE_PROVIDER_ID,
      model: "sdxl.safetensors",
      prompt: "a lighthouse",
      negativePrompt: "blur",
      width: 500,
      height: 1024,
      steps: 20,
      cfgScale: 7,
      seed: null,
      sampler: "Euler a",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain(
      "application/x-ndjson",
    );

    const events = await readNdjson(response);
    expect(events[0]).toMatchObject({ type: "progress", percent: 40 });
    expect(events.at(-1)).toMatchObject({
      type: "done",
      generation: {
        prompt: "a lighthouse",
        width: 512,
        seed: 99,
      },
    });

    expect(fake.txt2img).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "sdxl.safetensors",
        prompt: "a lighthouse",
        negativePrompt: "blur",
        width: 512,
        height: 1024,
        seed: -1,
        sampler: "Euler a",
        onProgress: expect.any(Function),
      }),
      "http://forge.test",
    );
  });

  it("rejects a missing prompt", async () => {
    const response = await post({
      providerId: FORGE_PROVIDER_ID,
      model: "sdxl.safetensors",
      prompt: "  ",
      sampler: "Euler a",
    });
    expect(response.status).toBe(400);
  });

  it("rejects an unknown provider", async () => {
    const response = await post({
      providerId: "midjourney",
      model: "x",
      prompt: "hi",
      sampler: "Euler a",
    });
    expect(response.status).toBe(400);
  });

  it("rejects a non-image reference", async () => {
    const response = await post({
      providerId: FORGE_PROVIDER_ID,
      model: "sdxl.safetensors",
      prompt: "hi",
      sampler: "Euler a",
      referenceImage: `data:image/png;base64,${Buffer.from("nope").toString("base64")}`,
      denoisingStrength: 0.5,
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Reference image must be a PNG, JPEG, or WebP file.",
    });
  });
});

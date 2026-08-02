import { describe, expect, it } from "vitest";

import { DEFAULT_BACKEND_URLS, resolveBackendUrls } from "@/lib/backend-urls";
import { DEFAULT_COMFYUI_BASE_URL } from "@/lib/providers/comfyui-shared";
import { DEFAULT_FORGE_BASE_URL } from "@/lib/providers/forge-shared";

describe("resolveBackendUrls", () => {
  it("uses configured base URLs when both are valid", () => {
    expect(
      resolveBackendUrls({
        forge: { baseUrl: "http://127.0.0.1:7999" },
        comfyui: { baseUrl: "http://127.0.0.1:9111" },
      }),
    ).toEqual({
      forgeUrl: "http://127.0.0.1:7999",
      comfyUrl: "http://127.0.0.1:9111",
    });
  });

  it("falls back per-provider, so one bad value cannot break the other", () => {
    expect(
      resolveBackendUrls({
        forge: { baseUrl: "not a url" },
        comfyui: { baseUrl: "http://127.0.0.1:9111" },
      }),
    ).toEqual({
      forgeUrl: DEFAULT_FORGE_BASE_URL,
      comfyUrl: "http://127.0.0.1:9111",
    });
  });

  it("falls back to defaults for anything unusable", () => {
    for (const payload of [
      undefined,
      null,
      {},
      "nonsense",
      42,
      { forge: {}, comfyui: {} },
      { forge: { baseUrl: "" }, comfyui: { baseUrl: "   " } },
      { forge: { baseUrl: 123 }, comfyui: { baseUrl: {} } },
    ]) {
      expect(resolveBackendUrls(payload)).toEqual({
        forgeUrl: DEFAULT_FORGE_BASE_URL,
        comfyUrl: DEFAULT_COMFYUI_BASE_URL,
      });
    }
  });

  it("never returns an empty href", () => {
    const { forgeUrl, comfyUrl } = resolveBackendUrls(null);
    expect(forgeUrl.length).toBeGreaterThan(0);
    expect(comfyUrl.length).toBeGreaterThan(0);
    expect(DEFAULT_BACKEND_URLS).toEqual({ forgeUrl, comfyUrl });
  });
});

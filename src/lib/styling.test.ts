import { readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

function findModuleStylesheets(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) findModuleStylesheets(path, found);
    else if (entry.name.endsWith(".module.css")) {
      found.push(path.slice(SRC.length + 1));
    }
  }
  return found;
}

describe("styling system", () => {
  /**
   * The UX makeover (ALI-20 → ALI-26) moved every route and component onto
   * Tailwind and the token set in `globals.css`. This keeps a CSS module from
   * quietly reintroducing a second styling system: if you are adding one, the
   * question to answer first is why the tokens are not enough.
   */
  it("has no CSS modules left in src/", () => {
    expect(findModuleStylesheets(SRC)).toEqual([]);
  });
});

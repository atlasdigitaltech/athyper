import { describe, expect, it } from "vitest";

declare global {
  interface ImportMeta {
    glob: (
      pattern: string,
      options: { eager: true; import: string; query: string },
    ) => Record<string, unknown>;
  }
}

const sourceModules = import.meta.glob("../*.tsx", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;
const drawerSources: Array<[string, string]> = Object.entries(sourceModules);

describe("pricing drawer typography contract", () => {
  it.each(drawerSources)("uses semantic typography utilities in %s", (_name, source) => {
    expect(source).not.toMatch(/text-\[\d+(?:\.\d+)?px\]/);
    expect(source).not.toMatch(/\buppercase\b/);
    expect(source).not.toMatch(/\btracking-(?:wide|wider|\[[^\]]+\])/);
  });
});

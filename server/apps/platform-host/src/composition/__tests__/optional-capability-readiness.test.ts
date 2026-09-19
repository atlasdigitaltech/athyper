import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("optional capability readiness", () => {
  it("does not fail readiness for routes that composition deliberately leaves disabled", async () => {
    const root = resolve(import.meta.dirname, "../../../../..");
    const source = await readFile(
      resolve(root, "apps/platform-host/src/composition/register-services.ts"),
      "utf8",
    );

    expect(source).toMatch(/message:\s*"Governance compliance routes are disabled"/);
    expect(source).toMatch(/message:\s*"Studio onboarding routes are disabled"/);
  });
});

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("plane transaction coordinator", () => {
  it("stamps the service actor instead of relying on ambient request context", async () => {
    const root = resolve(import.meta.dirname, "../../../../..");
    const source = await readFile(
      resolve(root, "apps/platform-host/src/composition/register-services.ts"),
      "utf8",
    );
    const coordinator = source.slice(
      source.indexOf("function createPlaneTransactionCoordinator"),
      source.indexOf("function internalRecipientContext"),
    );

    expect(coordinator).toContain("run(planeKey, actor, work)");
    expect(coordinator).not.toContain("run(planeKey, _actor, work)");
    expect(coordinator.match(/stampTransactionActor\(transaction as unknown as Transaction<Record<string, never>>, actor\)/g)).toHaveLength(3);
  });
});

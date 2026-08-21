import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../../../..");

describe("Meta Entity Studio M4 wiring", () => {
  it("blocks legacy operation and lifecycle projection writers with telemetry", () => {
    const route = readFileSync(resolve(root, "server/packages/services/metadata/routes/metadata-admin.route.ts"), "utf8");
    expect(route).toContain('logger?.warn?.("legacy_metadata_mutation_blocked"');
    expect(route).toContain('"CONTRACT_STUDIO_REQUIRED"');
    expect(route).toContain('router.post("/metadata/admin/lifecycle-bindings",          contractStudioRequiredHandler)');
    expect(route).toContain('router.patch("/metadata/admin/entity-operations/:id",      contractStudioRequiredHandler)');
  });

  it("returns a complete 409 merge payload for stale owner patches", () => {
    const service = readFileSync(resolve(root, "server/packages/services/metadata/src/contract-application/contract-application.service.ts"), "utf8");
    expect(service).toContain("currentDocument: current");
    expect(service).toContain("changedPaths:");
    expect(service).toContain("currentLockVersion:");
  });

  it("mounts one shared workspace above every owner tab", () => {
    const page = readFileSync(resolve(root, "apps/admin/app/(shell)/setup/metadata/[entityId]/page.tsx"), "utf8");
    const workspace = readFileSync(resolve(root, "apps/admin/app/(shell)/setup/metadata/[entityId]/_components/MetaEntityContractWorkspace.tsx"), "utf8");
    expect(page).toContain("<MetaEntityContractWorkspace entity={entity} />");
    expect(page).not.toContain("<ContractEditor");
    expect(workspace).toContain("dirtyPathsByOwner");
    expect(workspace).toContain("rebaseContract");
    expect(workspace).toContain("AdvancedJsonEditor");
    expect(workspace).toContain("Path-indexed issues");
  });
});

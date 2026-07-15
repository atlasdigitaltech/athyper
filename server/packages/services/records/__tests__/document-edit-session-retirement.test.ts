import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("retired document edit endpoint", () => {
  it("has no route mount, handler, runtime path, or endpoint-specific contract", () => {
    const recordsRoute = readFileSync(resolve(process.cwd(), "packages/services/records/routes/records.route.ts"), "utf8");
    const runtimePaths = readFileSync(resolve(process.cwd(), "../packages/shared/data-integration/api-contracts/src/runtime-api-v1-paths.ts"), "utf8");
    const contractsIndex = readFileSync(resolve(process.cwd(), "../packages/shared/data-integration/api-contracts/src/index.ts"), "utf8");
    const contractsPackage = readFileSync(resolve(process.cwd(), "../packages/shared/data-integration/api-contracts/package.json"), "utf8");

    expect(recordsRoute).not.toContain("/:entity/:id/edit-session");
    expect(recordsRoute).not.toContain("editSessionHandler");
    expect(recordsRoute).toContain("/:entity/:id/edit/submit");
    expect(runtimePaths).not.toContain("editSession:");
    expect(contractsIndex).not.toContain("schemas/edit-session");
    expect(contractsPackage).not.toContain('"./edit-session"');
  });

  it("keeps header, line, and derived-value mutations on the shared submit service", () => {
    const source = readFileSync(resolve(process.cwd(), "packages/services/records/routes/records.route.ts"), "utf8");
    const serviceStart = source.indexOf("const applyDocumentEditMutation = async");
    const submitStart = source.indexOf("const documentEditSubmitHandler: RequestHandler");
    const service = source.slice(serviceStart, submitStart);
    const submit = source.slice(submitStart, source.indexOf("const patchHandler: RequestHandler", submitStart));

    expect(serviceStart).toBeGreaterThan(0);
    expect(service).toContain("const headerPatch = body.header ?? {}");
    expect(service).toContain("validatedLinesBundle!.delete!");
    expect(service).toContain("validatedLinesBundle!.update!");
    expect(service).toContain("validatedLinesBundle!.create!");
    expect(service).toContain("applyDerivedPatchLineAmounts");
    expect(service).toContain("applyDerivedCreateLineAmounts");
    expect(service).toContain("const lineEntityCode = lineBinding.lineEntityCode");
    expect(service).toContain("action: \"create\"");
    expect(service).toContain("authorizeLineMutation(\"update\", line.id)");
    expect(service).toContain("authorizeLineMutation(\"delete\", lineId)");
    expect(submit).toContain("await entityMutationService.mutateAggregate({");
    expect(submit).toContain("changes: normalizedChanges");
  });

  it("removes the edit-context transport and BFF runtime injection adapters", () => {
    const recordsRoute = readFileSync(resolve(process.cwd(), "packages/services/records/routes/records.route.ts"), "utf8");
    const runtimePaths = readFileSync(resolve(process.cwd(), "../packages/shared/data-integration/api-contracts/src/runtime-api-v1-paths.ts"), "utf8");
    const serverPaths = readFileSync(resolve(process.cwd(), "../packages/shared/data-integration/api-contracts/src/runtime-server-paths.ts"), "utf8");
    const neonCompiler = readFileSync(resolve(process.cwd(), "../apps/neon/lib/server/meta-entity-runtime.ts"), "utf8");

    expect(recordsRoute).not.toContain("/:entity/:id/edit-context");
    expect(recordsRoute).not.toContain("editContextHandler");
    expect(runtimePaths).not.toContain("editContext:");
    expect(serverPaths).not.toContain("documentEditContext:");
    expect(neonCompiler).not.toContain("CANVAS_FLAGS_REGISTRY");
    expect(neonCompiler).not.toContain("CURRENT_DDL_RELATION_BRIDGE");
    expect(neonCompiler).not.toContain("withRuntimeDisplayDefaults");
  });
});

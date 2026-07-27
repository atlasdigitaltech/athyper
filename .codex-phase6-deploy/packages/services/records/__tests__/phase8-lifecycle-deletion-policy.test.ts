import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("../mutation/entity-mutation.service.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../routes/records.route.ts", import.meta.url), "utf8");
const runtimeCompiler = readFileSync(
  new URL("../../../../../packages/shared/runtime-domain/runtime-contracts/src/compiler.ts", import.meta.url),
  "utf8",
);

describe("Phase 8 canonical lifecycle and deletion policy", () => {
  it("delegates generic DELETE to the compiled mutation strategy", () => {
    const start = route.indexOf("const deleteHandler: RequestHandler");
    const end = route.indexOf("const debugHandler: RequestHandler", start);
    const handler = route.slice(start, end);
    expect(handler).toContain("entityMutationService.delete({");
    expect(handler).not.toContain("deleteFrom(fullTable)");
    expect(service).toContain("applyDeletionStrategy(trx, target, command, current)");
    expect(service).toContain('target.manifest.deletionMode === "hard_delete"');
    expect(service).toContain('target.manifest.deletionMode === "soft_delete"');
    expect(service).toContain('target.manifest.deletionMode === "archive"');
    expect(service).toContain('target.manifest.deletionMode === "retire"');
  });

  it("uses compiled lifecycle flags and blocks committed financial deletion", () => {
    expect(service).toContain("resolveCompiledLifecycleState(target.manifest, current)");
    expect(service).toContain("lifecycleState?.isCommitted");
    expect(service).toContain('code: lifecycleState.isReversible ? "REVERSAL_REQUIRED"');
    expect(service).toContain("!lifecycleState.isDeletable");
  });

  it("checks retention, legal holds, and owned references before deletion", () => {
    expect(service).toContain("policy.retentionDays");
    expect(service).toContain("governance.legal_hold");
    expect(service).toContain('code: "LEGAL_HOLD_ACTIVE"');
    expect(service).toContain('code: "DELETE_REFERENCED"');
  });

  it("projects server deletion and lifecycle flags into UI capabilities", () => {
    expect(runtimeCompiler).toContain("entity.capability_manifest");
    expect(runtimeCompiler).toContain('flags["isEditable"] === true');
    expect(runtimeCompiler).toContain('flags["isDeletable"] === true');
    expect(runtimeCompiler).toContain('compiledDeletionMode !== "prohibited"');
    expect(runtimeCompiler).toContain('compiledDeletionMode !== "lifecycle_only"');
  });
});

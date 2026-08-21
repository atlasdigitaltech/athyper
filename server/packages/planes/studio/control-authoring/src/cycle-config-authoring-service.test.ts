import { describe, expect, it } from "vitest";
import type { CycleDesiredStatePayload, CycleTemplateDraft } from "@athyper/server-contract-control-admin";
import { CycleConfigAuthoringService } from "./cycle-config-authoring-service.js";
describe("CycleConfigAuthoringService", () => {
  it("publishes a complete signed desired-state revision", async () => {
    let signed: CycleDesiredStatePayload | undefined;
    const service = new CycleConfigAuthoringService({ hashTemplate: () => "a".repeat(64), now: () => "2026-08-11T00:00:00.000Z", signer: { async sign(payload) { signed = payload; return { algorithm: "Ed25519", keyId: "studio-1", value: "signature" }; } } });
    const result = await service.publishDesiredState({ desiredStateId: "desired-1", sourceBlueprintId: "blueprint-1", sourceRevision: 3, targetPlane: "neon", tenantId: "tenant-1", template: template() });
    expect(result).toMatchObject({ schema: "athyper.cycle-template-desired-state/1.0", sourceRevision: 3, targetPlane: "neon", templateHash: "a".repeat(64), signature: { algorithm: "Ed25519" } });
    expect(signed).not.toHaveProperty("signature");
  });
});
function template(): CycleTemplateDraft { return { cycleType: { id: "type-1", code: "MONTH_END", name: "Month end", domainCode: "finance.close", frequency: "monthly", cleanCyclePolicy: {}, approvalPolicy: {}, runDataSchema: {}, taskDataSchema: {} }, phases: [], categories: [], tasks: [], dependencies: [], crossDependencies: [], carryForwardRules: [] }; }

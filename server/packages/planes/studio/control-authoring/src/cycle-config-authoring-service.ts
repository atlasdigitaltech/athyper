import type { CycleDesiredStatePayload, CycleDesiredStateSigner, CycleTemplateDraft, SignedCycleDesiredStateRevision } from "@athyper/server-contract-control-admin";

export interface PublishCycleBlueprintInput { readonly desiredStateId: string; readonly sourceBlueprintId: string; readonly sourceRevision: number; readonly targetPlane: "studio" | "neon" | "mesh"; readonly tenantId: string; readonly template: CycleTemplateDraft; readonly issuedAt?: string; }

/** Studio signs desired state; each target plane remains responsible for applying it. */
export class CycleConfigAuthoringService {
  constructor(private readonly options: { readonly signer: CycleDesiredStateSigner; readonly hashTemplate: (template: CycleTemplateDraft) => string; readonly now?: () => string }) {}
  async publishDesiredState(input: PublishCycleBlueprintInput): Promise<SignedCycleDesiredStateRevision> {
    if (!input.desiredStateId.trim() || !input.sourceBlueprintId.trim() || !input.tenantId.trim() || !Number.isInteger(input.sourceRevision) || input.sourceRevision < 1) throw coded("CONTROL_AUTHORING_INVALID_BLUEPRINT_REVISION");
    const payload: CycleDesiredStatePayload = { schema: "athyper.cycle-template-desired-state/1.0", desiredStateId: input.desiredStateId, sourceBlueprintId: input.sourceBlueprintId, sourceRevision: input.sourceRevision, targetPlane: input.targetPlane, tenantId: input.tenantId, template: input.template, templateHash: this.options.hashTemplate(input.template), issuedAt: normalizeDate(input.issuedAt ?? this.options.now?.() ?? new Date().toISOString()) };
    return { ...payload, signature: await this.options.signer.sign(payload) };
  }
}
function normalizeDate(value: string): string { const date = new Date(value); if (Number.isNaN(date.getTime())) throw coded("CONTROL_AUTHORING_INVALID_ISSUED_AT"); return date.toISOString(); }
function coded(code: string): Error { return Object.assign(new Error(code), { code }); }

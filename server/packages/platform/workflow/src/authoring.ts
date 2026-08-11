import { createHash } from "node:crypto";
import type { CompiledWorkflowDefinition, WorkflowDefinitionDraft, WorkflowDefinitionStore } from "@athyper/server-contract-workflow";
import { WorkflowError } from "./errors.js";

export function createWorkflowAuthoringService(store: WorkflowDefinitionStore, now: () => Date = () => new Date()) {
  return {
    async compileAndPublish(tenantId: string, draft: WorkflowDefinitionDraft): Promise<CompiledWorkflowDefinition> {
      validate(draft);
      const version = await store.nextVersion(tenantId, draft.code);
      const canonical = canonicalJson({ ...draft, version });
      const definition: CompiledWorkflowDefinition = { ...draft, version, artifactHash: createHash("sha256").update(canonical).digest("hex"), compiledAt: now().toISOString() };
      await store.saveImmutable(tenantId, definition);
      return definition;
    },
  };
}

function validate(draft: WorkflowDefinitionDraft): void {
  if (!/^[A-Za-z][A-Za-z0-9_.-]{1,126}$/.test(draft.code) || !draft.name.trim()) throw new WorkflowError(400, "INVALID_WORKFLOW_DEFINITION", "Definition code and name are required");
  if (!draft.stages.length) throw new WorkflowError(400, "EMPTY_WORKFLOW", "A workflow requires at least one stage");
  const codes = new Set<string>();
  for (const stage of draft.stages) {
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,62}$/.test(stage.code) || codes.has(stage.code)) throw new WorkflowError(400, "INVALID_WORKFLOW_STAGE", `Invalid or duplicate stage: ${stage.code}`);
    codes.add(stage.code);
    if (!stage.approvers.length && !stage.fallback?.length) throw new WorkflowError(400, "UNRESOLVABLE_STAGE", `Stage has no approver or explicit fallback: ${stage.code}`);
    if ((stage.quorum.kind === "count" || stage.quorum.kind === "percentage") && (!stage.quorum.value || stage.quorum.value <= 0)) throw new WorkflowError(400, "INVALID_QUORUM", `Invalid quorum: ${stage.code}`);
  }
}
function canonicalJson(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`; return JSON.stringify(value); }

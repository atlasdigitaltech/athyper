import { createHash } from "node:crypto";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  controlAdminPermissions,
  type CycleConfigService,
  type CycleDesiredStatePayload,
  type CycleDesiredStateVerifier,
  type CycleTemplateDraft,
  type CycleTemplateIssue,
  type CycleTemplatePreview,
  type CycleTemplateRepository,
} from "@athyper/server-contract-control-admin";
import type { ExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";

export function createCycleConfigService(options: { readonly authorizer: Authorizer; readonly repositories: ExactPlaneRepositoryProvider<CycleTemplateRepository>; readonly desiredStateVerifier?: CycleDesiredStateVerifier }): CycleConfigService {
  const inspect = async (context: VerifiedRequestContext, draft: CycleTemplateDraft): Promise<CycleTemplatePreview> => {
    await requirePermission(options.authorizer, context, controlAdminPermissions.cycleTemplateManage);
    const repository = options.repositories.require(context.planeKey);
    const template = normalize(draft);
    const issues = validateLocal(template);
    await validateExternal(context.tenantId, template, repository, issues);
    const topologicalTaskIds = issues.some((item) => item.code === "CYCLIC_DEPENDENCY") ? [] : topological(template);
    return { schema: "athyper.cycle-template/1.0", template, templateHash: cycleTemplateHash(template), valid: issues.length === 0, issues, topologicalTaskIds };
  };
  return {
    preview: inspect,
    validate: inspect,
    async publish(command) {
      const preview = await inspect(command.context, command.template);
      if (!preview.valid) throw coded("CONTROL_ADMIN_CYCLE_TEMPLATE_INVALID", { issues: preview.issues });
      return options.repositories.require(command.context.planeKey).publish({ tenantId: command.context.tenantId, principalId: command.context.principalId, idempotencyKey: command.idempotencyKey, ...(command.expectedLatestVersion !== undefined ? { expectedLatestVersion: command.expectedLatestVersion } : {}), preview });
    },
    async applyDesiredState(command) {
      await requirePermission(options.authorizer, command.context, controlAdminPermissions.cycleTemplateManage);
      const revision = command.revision;
      if (revision.tenantId !== command.context.tenantId || revision.targetPlane !== command.context.planeKey) throw coded("CONTROL_ADMIN_DESIRED_STATE_TARGET_MISMATCH");
      if (cycleTemplateHash(revision.template) !== revision.templateHash) throw coded("CONTROL_ADMIN_DESIRED_STATE_HASH_INVALID");
      const verifier = options.desiredStateVerifier;
      if (!verifier || !(await verifier.verify(desiredStatePayload(revision), revision.signature))) throw coded("CONTROL_ADMIN_DESIRED_STATE_SIGNATURE_INVALID");
      const preview = await inspect(command.context, revision.template);
      if (!preview.valid) throw coded("CONTROL_ADMIN_CYCLE_TEMPLATE_INVALID", { issues: preview.issues });
      return options.repositories.require(command.context.planeKey).publish({ tenantId: command.context.tenantId, principalId: command.context.principalId, idempotencyKey: `studio:${revision.desiredStateId}:${revision.sourceRevision}:${revision.targetPlane}`, ...(command.expectedLatestVersion !== undefined ? { expectedLatestVersion: command.expectedLatestVersion } : {}), preview });
    },
    async readPublished(context, cycleTypeId, version) {
      await requirePermission(options.authorizer, context, controlAdminPermissions.catalogRead);
      const found = await options.repositories.require(context.planeKey).getPublished(context.tenantId, cycleTypeId, version);
      if (!found) throw coded("CONTROL_ADMIN_CYCLE_TEMPLATE_NOT_FOUND");
      return found;
    },
  };
}

export function validateCycleTemplate(template: CycleTemplateDraft): readonly CycleTemplateIssue[] { return validateLocal(normalize(template)); }
export function cycleTemplateHash(template: CycleTemplateDraft): string { return createHash("sha256").update(stable(normalize(template)), "utf8").digest("hex"); }

function validateLocal(template: CycleTemplateDraft): CycleTemplateIssue[] {
  const issues: CycleTemplateIssue[] = [];
  duplicates(template.phases, (item) => item.id, "phases", "id", issues);
  duplicates(template.phases, (item) => item.code, "phases", "code", issues);
  duplicates(template.phases, (item) => item.sortOrder, "phases", "sortOrder", issues, "DUPLICATE_ORDER");
  duplicates(template.categories, (item) => item.id, "categories", "id", issues);
  duplicates(template.categories, (item) => item.code, "categories", "code", issues);
  duplicates(template.categories, (item) => item.sortOrder, "categories", "sortOrder", issues, "DUPLICATE_ORDER");
  duplicates(template.tasks, (item) => item.id, "tasks", "id", issues);
  duplicates(template.tasks, (item) => `${item.entityCode}:${item.code}`, "tasks", "code", issues);
  duplicates(template.tasks, (item) => `${item.phaseId}:${item.sortOrder}`, "tasks", "sortOrder", issues, "DUPLICATE_ORDER");
  duplicates(template.carryForwardRules, (item) => item.deviationType, "carryForwardRules", "deviationType", issues);
  const phaseIds = new Set(template.phases.map((item) => item.id));
  const categoryIds = new Set(template.categories.map((item) => item.id));
  const taskIds = new Set(template.tasks.map((item) => item.id));
  template.tasks.forEach((task, index) => {
    if (!phaseIds.has(task.phaseId)) issue(issues, "MISSING_REFERENCE", `tasks[${index}].phaseId`, `Unknown phase ${task.phaseId}`);
    if (!categoryIds.has(task.categoryId)) issue(issues, "MISSING_REFERENCE", `tasks[${index}].categoryId`, `Unknown category ${task.categoryId}`);
    if (task.completionMode !== "manual" && !task.systemCheckHandler?.trim()) issue(issues, "INVALID_TASK_HANDLER", `tasks[${index}].systemCheckHandler`, "System and hybrid tasks require a handler");
  });
  const edges = new Set<string>();
  template.dependencies.forEach((edge, index) => {
    if (!taskIds.has(edge.predecessorTemplateId)) issue(issues, "MISSING_REFERENCE", `dependencies[${index}].predecessorTemplateId`, `Unknown task ${edge.predecessorTemplateId}`);
    if (!taskIds.has(edge.successorTemplateId)) issue(issues, "MISSING_REFERENCE", `dependencies[${index}].successorTemplateId`, `Unknown task ${edge.successorTemplateId}`);
    if (edge.predecessorTemplateId === edge.successorTemplateId) issue(issues, "SELF_DEPENDENCY", `dependencies[${index}]`, "A task cannot depend on itself");
    const key = `${edge.predecessorTemplateId}:${edge.successorTemplateId}`;
    if (edges.has(key)) issue(issues, "DUPLICATE_DEPENDENCY", `dependencies[${index}]`, `Duplicate dependency ${key}`); else edges.add(key);
  });
  if (taskIds.size > 0 && topological(template).length !== taskIds.size) issue(issues, "CYCLIC_DEPENDENCY", "dependencies", "Task dependency graph contains a cycle");
  template.carryForwardRules.forEach((rule, index) => { if (rule.action === "auto_carry" && !rule.targetCycleTypeId) issue(issues, "INVALID_CARRY_FORWARD_TARGET", `carryForwardRules[${index}].targetCycleTypeId`, "auto_carry requires a target cycle type"); });
  return issues;
}

async function validateExternal(tenantId: string, template: CycleTemplateDraft, repository: CycleTemplateRepository, issues: CycleTemplateIssue[]): Promise<void> {
  const currentType = template.cycleType.id;
  const localPhases = new Set(template.phases.map((phase) => phase.id));
  for (let index = 0; index < template.crossDependencies.length; index += 1) {
    const edge = template.crossDependencies[index]!;
    if (edge.predecessorTypeId !== currentType && edge.successorTypeId !== currentType) { issue(issues, "INVALID_CROSS_CYCLE_REFERENCE", `crossDependencies[${index}]`, "At least one side must reference the template cycle type"); continue; }
    const endpoints = [[edge.predecessorTypeId, edge.predecessorPhaseId, "predecessorPhaseId"], [edge.successorTypeId, edge.successorPhaseId, "successorPhaseId"]] as const;
    for (const [typeId, phaseId, field] of endpoints) {
      const exists = typeId === currentType ? localPhases.has(phaseId) : await repository.externalPhaseExists(tenantId, typeId, phaseId);
      if (!exists) issue(issues, "INVALID_CROSS_CYCLE_REFERENCE", `crossDependencies[${index}].${field}`, `Unknown cycle phase ${typeId}/${phaseId}`);
    }
  }
  for (let index = 0; index < template.carryForwardRules.length; index += 1) {
    const target = template.carryForwardRules[index]!.targetCycleTypeId;
    if (target && target !== currentType && !(await repository.cycleTypeExists(tenantId, target))) issue(issues, "INVALID_CARRY_FORWARD_TARGET", `carryForwardRules[${index}].targetCycleTypeId`, `Unknown cycle type ${target}`);
  }
}

function topological(template: CycleTemplateDraft): string[] {
  const ids = template.tasks.map((task) => task.id);
  const indegree = new Map(ids.map((id) => [id, 0]));
  const outgoing = new Map(ids.map((id) => [id, [] as string[]]));
  for (const edge of template.dependencies) if (indegree.has(edge.predecessorTemplateId) && indegree.has(edge.successorTemplateId) && edge.predecessorTemplateId !== edge.successorTemplateId) { outgoing.get(edge.predecessorTemplateId)!.push(edge.successorTemplateId); indegree.set(edge.successorTemplateId, indegree.get(edge.successorTemplateId)! + 1); }
  const ready = ids.filter((id) => indegree.get(id) === 0).sort(); const result: string[] = [];
  while (ready.length) { const id = ready.shift()!; result.push(id); for (const next of outgoing.get(id)!.sort()) { indegree.set(next, indegree.get(next)! - 1); if (indegree.get(next) === 0) { ready.push(next); ready.sort(); } } }
  return result;
}

function normalize(template: CycleTemplateDraft): CycleTemplateDraft { return { cycleType: template.cycleType, phases: [...template.phases].sort(byOrder), categories: [...template.categories].sort(byOrder), tasks: [...template.tasks].sort((a, b) => a.phaseId.localeCompare(b.phaseId) || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)), dependencies: [...template.dependencies].sort((a, b) => `${a.predecessorTemplateId}:${a.successorTemplateId}`.localeCompare(`${b.predecessorTemplateId}:${b.successorTemplateId}`)), crossDependencies: [...template.crossDependencies].sort((a, b) => stable(a).localeCompare(stable(b))), carryForwardRules: [...template.carryForwardRules].sort((a, b) => a.deviationType.localeCompare(b.deviationType)) }; }
function desiredStatePayload(revision: CycleDesiredStatePayload & { readonly signature: unknown }): CycleDesiredStatePayload { const { signature: _signature, ...payload } = revision; return payload; }
function byOrder<T extends { readonly sortOrder: number; readonly id: string }>(a: T, b: T): number { return a.sortOrder - b.sortOrder || a.id.localeCompare(b.id); }
function duplicates<T>(items: readonly T[], key: (item: T) => string | number, path: string, field: string, issues: CycleTemplateIssue[], code: CycleTemplateIssue["code"] = "DUPLICATE_CODE"): void { const seen = new Set<string | number>(); items.forEach((item, index) => { const value = key(item); if (seen.has(value)) issue(issues, code, `${path}[${index}].${field}`, `Duplicate ${field}: ${value}`); else seen.add(value); }); }
function issue(issues: CycleTemplateIssue[], code: CycleTemplateIssue["code"], path: string, message: string): void { issues.push({ code, path, message }); }
function stable(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`; return JSON.stringify(value); }
async function requirePermission(authorizer: Authorizer, context: VerifiedRequestContext, permissionCode: string): Promise<void> { if (!(await authorizer.authorize({ context, permissionCode })).allowed) throw coded("CONTROL_ADMIN_PERMISSION_DENIED"); }
function coded(code: string, details?: unknown): Error { return Object.assign(new Error(code), { code, details }); }

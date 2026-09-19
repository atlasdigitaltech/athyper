import { JobValidationError } from "@athyper/server-contract-jobs";
import type {
  GovernedSchedule,
  JobDefinitionCatalog,
  JobExecutionCoordinate,
  JobExecutionSummary,
  JobGovernance,
  QueueCatalogEntry,
  ScheduleChangeAudit,
  ScheduleMutation,
} from "@athyper/server-contract-jobs";
import { previewCron } from "./cron-preview.js";

export interface JobGovernanceStore {
  listExecutions(input: { readonly execution: JobExecutionCoordinate; readonly limit: number; readonly cursor?: string }): Promise<readonly JobExecutionSummary[]>;
  listSchedules(execution: JobExecutionCoordinate): Promise<readonly GovernedSchedule[]>;
  createSchedule(input: { readonly execution: JobExecutionCoordinate; readonly schedule: ScheduleMutation; readonly reason: string }): Promise<GovernedSchedule>;
  updateSchedule(input: { readonly execution: JobExecutionCoordinate; readonly scheduleId: string; readonly schedule: ScheduleMutation; readonly reason: string }): Promise<GovernedSchedule>;
  deactivateSchedule(input: { readonly execution: JobExecutionCoordinate; readonly scheduleId: string; readonly reason: string }): Promise<void>;
  listScheduleAudit(input: { readonly execution: JobExecutionCoordinate; readonly scheduleId: string }): Promise<readonly ScheduleChangeAudit[]>;
}

export function createJobGovernanceService(options: { readonly store: JobGovernanceStore; readonly catalog: JobDefinitionCatalog }): JobGovernance {
  return {
    async listQueues() {
      const grouped = new Map<string, { handlers: Set<string>; scopes: Set<string> }>();
      for (const definition of options.catalog.list()) {
        const entry = grouped.get(definition.queue) ?? { handlers: new Set(), scopes: new Set() };
        entry.handlers.add(definition.name); entry.scopes.add(definition.scope); grouped.set(definition.queue, entry);
      }
      return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([queue, entry]): QueueCatalogEntry => ({
        queue,
        handlers: [...entry.handlers].sort(),
        scope: entry.scopes.size > 1 ? "mixed" : entry.scopes.has("tenant") ? "tenant" : "plane",
        operationalControl: "none",
      }));
    },
    listExecutions: (input) => options.store.listExecutions({ ...input, limit: bounded(input.limit ?? 50) }),
    listSchedules: (execution) => options.store.listSchedules(execution),
    previewCron,
    createSchedule(input) { validateMutation(input.schedule, input.execution, options.catalog); requireReason(input.reason); return options.store.createSchedule(input); },
    updateSchedule(input) { validateMutation(input.schedule, input.execution, options.catalog); requireReason(input.reason); return options.store.updateSchedule(input); },
    deactivateSchedule(input) { requireReason(input.reason); return options.store.deactivateSchedule(input); },
    listScheduleAudit: (input) => options.store.listScheduleAudit(input),
  };
}

function validateMutation(value: ScheduleMutation, execution: JobExecutionCoordinate, catalog: JobDefinitionCatalog): void {
  previewCron({ expression: value.cronExpression, timezone: value.timezone, count: 1 });
  for (const [field, candidate] of [["code", value.code], ["name", value.name], ["handlerType", value.handlerType], ["targetQueue", value.targetQueue]] as const) {
    if (!candidate.trim()) throw new JobValidationError(`${field} is required`);
  }
  if (!/^[a-z][a-z0-9_.-]{1,126}$/.test(value.code)) throw new JobValidationError("schedule code is invalid");
  const definition = catalog.get(value.targetQueue, value.handlerType);
  if (!definition) throw new JobValidationError(`Unregistered job handler: ${value.targetQueue}/${value.handlerType}`);
  if (definition.scope !== execution.scope) {
    throw new JobValidationError(`Job handler ${value.targetQueue}/${value.handlerType} requires ${definition.scope} scope`);
  }
  if (execution.scope === "tenant" && !execution.tenantId?.trim()) {
    throw new JobValidationError("Tenant-scoped schedules require tenantId");
  }
  if (execution.scope === "plane" && execution.tenantId !== undefined) {
    throw new JobValidationError("Plane-scoped schedules cannot carry tenantId");
  }
}
function requireReason(value: string): void { if (!value.trim()) throw new JobValidationError("reason is required"); }
function bounded(value: number): number { return Math.max(1, Math.min(200, Math.trunc(value))); }

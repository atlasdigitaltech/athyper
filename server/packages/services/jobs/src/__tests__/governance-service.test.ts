import { JobValidationError, type JobExecutionCoordinate, type ScheduleMutation } from "@athyper/server-contract-jobs";
import { describe, expect, it, vi } from "vitest";
import { createJobDefinitionCatalog } from "../definition-catalog.js";
import { createJobGovernanceService, type JobGovernanceStore } from "../governance-service.js";

const catalog = createJobDefinitionCatalog([
  { code: "reports.generate", owner: "reports", queue: "reports", name: "generate", scope: "tenant", payloadSchema: { name: "reports.generate", version: 1 } },
  { code: "reports.sweep", owner: "reports", queue: "maintenance", name: "sweep", scope: "plane", payloadSchema: { name: "reports.sweep", version: 1 } },
]);
const tenant: JobExecutionCoordinate = { planeKey: "neon", scope: "tenant", tenantId: "tenant-1", principalId: "principal-1" };
const plane: JobExecutionCoordinate = { planeKey: "neon", scope: "plane", principalId: "principal-1" };
const schedule: ScheduleMutation = { code: "daily", name: "Daily report", targetQueue: "reports", handlerType: "generate", cronExpression: "0 * * * *", timezone: "UTC", payloadTemplate: {} };

function setup() {
  const createSchedule = vi.fn<JobGovernanceStore["createSchedule"]>(async (input) => ({ ...input.schedule, id: "schedule-1", enabled: true }));
  const updateSchedule = vi.fn<JobGovernanceStore["updateSchedule"]>(async (input) => ({ ...input.schedule, id: input.scheduleId, enabled: true }));
  const store: JobGovernanceStore = { createSchedule, updateSchedule, listExecutions: async () => [], listSchedules: async () => [], listScheduleAudit: async () => [], deactivateSchedule: async () => undefined };
  return { createSchedule, updateSchedule, service: createJobGovernanceService({ store, catalog }) };
}

describe.each(["create", "update"] as const)("%s schedule catalog validation", (operation) => {
  const invoke = (service: ReturnType<typeof createJobGovernanceService>, execution: JobExecutionCoordinate, mutation: ScheduleMutation) => {
    const input = { execution, schedule: mutation, reason: "Operator change" };
    return operation === "create" ? service.createSchedule(input) : service.updateSchedule({ ...input, scheduleId: "schedule-1" });
  };
  it.each([
    { label: "unknown queue", execution: tenant, mutation: { ...schedule, targetQueue: "missing" } },
    { label: "unknown handler", execution: tenant, mutation: { ...schedule, handlerType: "missing" } },
    { label: "handler registered to another queue", execution: tenant, mutation: { ...schedule, handlerType: "sweep" } },
    { label: "definition code is not the executable handler name", execution: tenant, mutation: { ...schedule, handlerType: "reports.generate" } },
    { label: "tenant handler in plane scope", execution: plane, mutation: schedule },
    { label: "plane handler in tenant scope", execution: tenant, mutation: { ...schedule, targetQueue: "maintenance", handlerType: "sweep" } },
    { label: "missing tenant", execution: { ...tenant, tenantId: "" }, mutation: schedule },
    { label: "plane scope carrying a tenant", execution: { ...plane, tenantId: "tenant-1" }, mutation: { ...schedule, targetQueue: "maintenance", handlerType: "sweep" } },
  ])("rejects $label before persisting", async ({ execution, mutation }) => {
    const test = setup();
    await expect(Promise.resolve().then(() => invoke(test.service, execution, mutation))).rejects.toBeInstanceOf(JobValidationError);
    expect(test.createSchedule).not.toHaveBeenCalled();
    expect(test.updateSchedule).not.toHaveBeenCalled();
  });
  it.each([
    { execution: tenant, mutation: schedule },
    { execution: plane, mutation: { ...schedule, targetQueue: "maintenance", handlerType: "sweep" } },
  ])("persists a registered handler with matching scope: $execution.scope", async ({ execution, mutation }) => {
    const test = setup();
    await expect(invoke(test.service, execution, mutation)).resolves.toMatchObject({ ...mutation, id: "schedule-1" });
    expect(operation === "create" ? test.createSchedule : test.updateSchedule).toHaveBeenCalledWith(expect.objectContaining({ execution, schedule: mutation }));
  });
});

import type { BulkCommand, GovernedRecordJobDispatcher, RecordActionService, RecordBulkService, RecordMutationService } from "@athyper/server-contract-records";

export interface BulkEligibility { check(command: BulkCommand, recordId: string): Promise<{ readonly eligible: boolean; readonly reasonCode?: string }>; }

export function createRecordBulkService(options: { readonly mutations: RecordMutationService; readonly actions: RecordActionService; readonly jobs: GovernedRecordJobDispatcher; readonly eligibility: BulkEligibility; readonly synchronousLimit?: number }): RecordBulkService {
  const threshold = options.synchronousLimit ?? 100;
  return {
    async preflight(command) {
      validate(command);
      const items = await Promise.all(command.items.map(async (item) => ({ recordId: item.recordId, ...await options.eligibility.check(command, item.recordId) })));
      return { batchId: command.batchId, accepted: items.every((item) => item.eligible), governedJob: command.items.length > threshold, items };
    },
    async execute(command) {
      const preflight = await this.preflight(command);
      if (!preflight.accepted) return { batchId: command.batchId, status: "completed", items: preflight.items.map((item) => ({ recordId: item.recordId, result: { kind: "IncompatibleAction", action: command.action === "registered_action" ? "patch" : command.action, reason: item.eligible ? "Batch rejected because another record is ineligible" : item.reasonCode ?? "Not eligible" } })) };
      if (preflight.governedJob) { const jobId = await options.jobs.enqueue("bulk", { command }); return { batchId: command.batchId, status: "queued", jobId, items: [] }; }
      const items = [];
      for (let index = 0; index < command.items.length; index += 1) {
        const item = command.items[index]!; const idempotencyKey = `${command.idempotencyKey}:${index}`;
        try {
          if (command.action === "patch") items.push({ recordId: item.recordId, result: await options.mutations.patch({ context: command.context, entityCode: command.entityCode, recordId: item.recordId, input: item.input ?? {}, expectedVersion: item.expectedVersion, idempotencyKey, origin: "operation", validationMode: "strict" }) });
          else if (command.action === "delete") items.push({ recordId: item.recordId, result: await options.mutations.delete({ context: command.context, entityCode: command.entityCode, recordId: item.recordId, expectedVersion: item.expectedVersion, idempotencyKey, origin: "operation", validationMode: "strict" }) });
          else items.push({ recordId: item.recordId, result: { kind: "ActionCompleted" as const, output: (await options.actions.execute({ context: command.context, entityCode: command.entityCode, recordId: item.recordId, actionCode: command.actionCode!, input: item.input, expectedVersion: item.expectedVersion, idempotencyKey, origin: "operation", validationMode: "strict" })).output } });
        } catch (error) {
          items.push({ recordId: item.recordId, result: { kind: "IncompatibleAction" as const, action: command.action === "registered_action" ? "patch" as const : command.action, reason: error instanceof Error ? error.message : "Record command failed" } });
        }
      }
      return { batchId: command.batchId, status: "completed", items };
    },
  };
}
function validate(command: BulkCommand): void { if (!command.batchId.trim()) throw new TypeError("Bulk batch id is required"); if (!command.items.length) throw new TypeError("Bulk command needs at least one record"); if (command.items.length > 10_000) throw new TypeError("Bulk command exceeds the governed maximum"); if (command.action === "registered_action" && !command.actionCode) throw new TypeError("Registered bulk action code is required"); }

import type { RecordLifecycleService } from "@athyper/server-contract-records";
import type { RecordExecutionOptions } from "./record-execution.js";
import { appendRecordSideEffects, executeRecordCommand, idempotencyFailure } from "./record-execution.js";
import { descriptorFor } from "./query-service.js";

export function createRecordLifecycleService<Transaction>(options: RecordExecutionOptions<Transaction>): RecordLifecycleService {
  return {
    async transition(command) {
      const invalidIdempotency = idempotencyFailure(command); if (invalidIdempotency) return invalidIdempotency;
      let descriptor;
      try { descriptor = await descriptorFor(options.metadata, command.context, command.entityCode); }
      catch { return { kind: "CapabilityUnavailable", entityCode: command.entityCode }; }
      const transition = descriptor.lifecycle?.transitions.find((item) => item.code === command.transitionCode);
      if (!transition || !descriptor.storage.statusField) return { kind: "InvalidTransition", transitionCode: command.transitionCode, reason: "Transition is not published" };
      const decision = await options.authorizer.authorize({
        context: command.context,
        permissionCode: transition.permissionCode,
        resource: { tenantId: command.context.tenantId, resourceCode: command.entityCode, recordId: command.recordId },
      });
      if (!decision.allowed) return { kind: "Forbidden", permissionCode: transition.permissionCode };
      if (descriptor.storage.versionField && command.expectedVersion === undefined) return { kind: "VersionRequired" };
      return options.transactions.run(command.context.planeKey, { tenantId: command.context.tenantId, principalId: command.context.principalId }, async (transaction) => {
        return executeRecordCommand(options, command, transaction, "transition", async () => {
        const projection = descriptor.fields.map((field) => field.key);
        const current = await options.repository.get(descriptor, command.context.tenantId, command.recordId, projection, transaction);
        if (!current) return { kind: "NotFound", entityCode: command.entityCode, recordId: command.recordId } as const;
        const statusKey = descriptor.fields.find((field) => field.storagePath === descriptor.storage.statusField)?.key ?? descriptor.storage.statusField!;
        const currentStatus = String(current[statusKey] ?? "");
        if (!transition.from.includes(currentStatus)) return { kind: "InvalidTransition", transitionCode: command.transitionCode, reason: `Cannot transition from ${currentStatus}` } as const;
        const update: Record<string, unknown> = { [statusKey]: transition.to };
        if (descriptor.fields.some((field) => field.storagePath === "status_changed_by")) update["status_changed_by"] = command.context.principalId;
        if (descriptor.fields.some((field) => field.storagePath === "status_changed_at")) update["status_changed_at"] = new Date().toISOString();
        const result = await options.repository.patch(descriptor, command.context.tenantId, command.recordId, update, command.expectedVersion, transaction);
        if (result.versionConflict !== undefined) return { kind: "VersionConflict", expectedVersion: command.expectedVersion!, currentVersion: result.versionConflict } as const;
        if (!result.record) return { kind: "NotFound", entityCode: command.entityCode, recordId: command.recordId } as const;
        await appendRecordSideEffects(options, command, transaction, "transition", command.recordId, result.record);
        const versionValue = descriptor.storage.versionField ? result.record[descriptor.storage.versionField] : undefined;
        return { kind: "Committed", action: "transition", entityCode: command.entityCode, recordId: command.recordId, record: result.record, ...(typeof versionValue === "number" ? { version: versionValue } : {}), replayed: false } as const;
        });
      });
    },
  };
}

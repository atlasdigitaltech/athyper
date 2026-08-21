import { randomUUID } from "node:crypto";
import type { AuditEvent, AuditEventSink, AuditRecordInput, AuditRecorder } from "@athyper/server-contract-audit";

const EVENT_CODE = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){2,7}$/;
const ACTION = /^[a-z][a-z0-9_]{0,63}$/;

export interface AuditServiceOptions {
  readonly sink: AuditEventSink;
  readonly now?: () => Date;
  readonly createId?: () => string;
  readonly maxMetadataBytes?: number;
}

export function createAuditService(options: AuditServiceOptions): AuditRecorder {
  const maxMetadataBytes = options.maxMetadataBytes ?? 32 * 1_024;
  if (!Number.isInteger(maxMetadataBytes) || maxMetadataBytes < 1) {
    throw new TypeError("Audit metadata limit must be a positive integer");
  }
  return {
    async record(input, transaction): Promise<AuditEvent> {
      validateInput(input, maxMetadataBytes);
      const event: AuditEvent = Object.freeze({
        ...input,
        eventCode: input.eventCode.trim(),
        action: input.action.trim(),
        severity: input.severity ?? severityFor(input.outcome),
        id: options.createId?.() ?? randomUUID(),
        occurredAt: (options.now?.() ?? new Date()).toISOString(),
      });
      await options.sink.append(event, transaction);
      return event;
    },
  };
}

function validateInput(input: AuditRecordInput, maxMetadataBytes: number): void {
  if (!EVENT_CODE.test(input.eventCode.trim())) throw new TypeError(`Invalid audit event code: ${input.eventCode}`);
  if (!ACTION.test(input.action.trim())) throw new TypeError(`Invalid audit action: ${input.action}`);
  if (input.actor.kind !== "system" && !input.actor.principalId?.trim()) {
    throw new TypeError("Non-system audit actors require a principal id");
  }
  if (input.metadata) {
    let serialized: string;
    try { serialized = JSON.stringify(input.metadata); }
    catch { throw new TypeError("Audit metadata must be JSON serializable"); }
    if (Buffer.byteLength(serialized, "utf8") > maxMetadataBytes) {
      throw new TypeError("Audit metadata exceeds the configured size limit");
    }
  }
}

function severityFor(outcome: AuditRecordInput["outcome"]): AuditEvent["severity"] {
  if (outcome === "error") return "error";
  if (outcome === "failure" || outcome === "denied") return "warning";
  return "info";
}

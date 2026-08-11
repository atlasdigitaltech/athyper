import { randomUUID } from "node:crypto";
import type { RecordLockRepository, RecordLockService } from "@athyper/server-contract-records";
import { RecordServiceError } from "../errors.js";

export function createRecordLockService(repository: RecordLockRepository): RecordLockService {
  return {
    async acquire(context, entityCode, recordId, ttlSeconds = 60) { validateTtl(ttlSeconds); return repository.acquire({ tenantId: context.tenantId, entityCode, recordId, principalId: context.principalId, ttlSeconds }); },
    async heartbeat(context, entityCode, recordId, token, fencingToken, ttlSeconds = 60) { validateTtl(ttlSeconds); const lock = await repository.heartbeat({ tenantId: context.tenantId, entityCode, recordId, principalId: context.principalId, token, fencingToken, ttlSeconds }); if (!lock) throw new RecordServiceError(409, "LOCK_SUPERSEDED", "Heartbeat cannot renew an expired or superseded lock"); return lock; },
    async release(context, entityCode, recordId, token, fencingToken) { if (!await repository.release({ tenantId: context.tenantId, entityCode, recordId, principalId: context.principalId, token, fencingToken })) throw new RecordServiceError(409, "LOCK_SUPERSEDED", "Only the current fenced lock can be released"); },
  };
}
export function newLockToken(): string { return randomUUID(); }
function validateTtl(value: number): void { if (!Number.isInteger(value) || value < 15 || value > 300) throw new RecordServiceError(400, "LOCK_TTL_INVALID", "Lock TTL must be between 15 and 300 seconds"); }

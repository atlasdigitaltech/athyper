import { randomUUID } from "node:crypto";
import type { CommandExecutionInput, CommandExecutionStore } from "@athyper/server-contract-events";
import type { RecordMutationResult } from "@athyper/server-contract-records";
import type { MemoryRecordTransaction } from "./in-memory-record-repository.js";

interface Entry {
  readonly id: string;
  readonly input: CommandExecutionInput;
  result?: RecordMutationResult;
}

export function createInMemoryCommandExecutionStore(): CommandExecutionStore<MemoryRecordTransaction, RecordMutationResult> {
  let committed = new Map<string, Entry>();
  const drafts = new WeakMap<MemoryRecordTransaction, Map<string, Entry>>();
  const draftFor = (transaction: MemoryRecordTransaction): Map<string, Entry> => {
    const present = drafts.get(transaction);
    if (present) return present;
    const draft = new Map([...committed].map(([key, entry]) => [key, { ...entry }]));
    drafts.set(transaction, draft);
    transaction.onCommit(() => { committed = draft; });
    return draft;
  };
  return {
    async begin(input, transaction) {
      const draft = draftFor(transaction);
      const key = `${input.tenantId}\0${input.commandCode}\0${input.idempotencyKey}`;
      const existing = draft.get(key);
      if (existing) {
        if (existing.input.requestFingerprint !== input.requestFingerprint) return { kind: "conflict" };
        return existing.result ? { kind: "replay", result: existing.result } : { kind: "in_progress" };
      }
      const executionId = randomUUID();
      draft.set(key, { id: executionId, input });
      return { kind: "started", executionId };
    },
    async complete(executionId, result, _actorPrincipalId, transaction) {
      const entry = [...draftFor(transaction).values()].find((item) => item.id === executionId);
      if (!entry) throw new Error("Unknown in-memory command execution");
      entry.result = structuredClone(result);
    },
  };
}

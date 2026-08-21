import type { FinanceCommand, FinanceCommandRepository, FinanceCommandResult } from "@athyper/server-contract-finance";
import { verifyFinanceCommand } from "./canonical.js";

type Stored = { readonly commandId: string; readonly fingerprint: string; readonly resourceId: string; readonly version: number; readonly output: Readonly<Record<string, unknown>> };

export class InMemoryFinanceCommandRepository<Transaction = unknown> implements FinanceCommandRepository<Transaction> {
  private readonly commands = new Map<string, Stored>();

  async execute<Payload extends Readonly<Record<string, unknown>>, Output extends Readonly<Record<string, unknown>>>(command: FinanceCommand<Payload>, transaction: Transaction, apply: (transaction: Transaction) => Promise<{ readonly resourceId: string; readonly version: number; readonly output: Output }>): Promise<FinanceCommandResult<Output>> {
    verifyFinanceCommand(command);
    const key = `${command.actor.tenantId}:${command.commandCode}:${command.idempotencyKey}`;
    const existing = this.commands.get(key);
    if (existing && existing.fingerprint !== command.requestFingerprint) return { kind: "idempotency_conflict", commandId: command.commandId, existingCommandId: existing.commandId };
    if (existing) return { kind: "replayed", commandId: existing.commandId, resourceId: existing.resourceId, version: existing.version, output: existing.output as Output };
    const applied = await apply(transaction);
    this.commands.set(key, { commandId: command.commandId, fingerprint: command.requestFingerprint, ...applied });
    return { kind: "applied", commandId: command.commandId, ...applied };
  }
}

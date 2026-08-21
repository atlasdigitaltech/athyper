import type { DomainCommand, DomainCommandHandler, DomainCommandRegistry } from "@athyper/server-contract-workflow";

export function createDomainCommandRegistry<Transaction>(): DomainCommandRegistry<Transaction> {
  const handlers = new Map<string, DomainCommandHandler<Transaction>>();
  return {
    register(name, handler) { if (handlers.has(name)) throw new Error(`Domain command already registered: ${name}`); handlers.set(name, handler); },
    async execute(command: DomainCommand, transaction: Transaction) { const handler = handlers.get(command.name); if (!handler) throw new Error(`No domain command handler registered: ${command.name}`); await handler.execute(command, transaction); },
  };
}

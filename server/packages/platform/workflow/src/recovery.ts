import type { WorkItem } from "@athyper/server-contract-workflow";
export interface RecoveryRepository<Transaction> { findStuck(tenantId: string, before: string, limit: number, transaction: Transaction): Promise<readonly WorkItem[]>; recover(item: WorkItem, transaction: Transaction): Promise<boolean>; }
export function createWorkflowRecoveryService<Transaction>(repository: RecoveryRepository<Transaction>) {
  return { async recover(tenantId: string, before: string, limit: number, transaction: Transaction) { const items = await repository.findStuck(tenantId, before, Math.min(Math.max(limit, 1), 500), transaction); const recovered: string[] = []; for (const item of items) if (await repository.recover(item, transaction)) recovered.push(item.id); return Object.freeze(recovered); } };
}

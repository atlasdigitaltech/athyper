import { FinanceContractError, financePermissions, type BookPeriodRecord, type BookPeriodRepository, type BookPeriodTransitionCommand, type FinancePermissionChecker } from "@athyper/server-contract-finance";
import type { FinanceAuditRecorder, FinanceOutboxWriter } from "./evidence.js";

interface TransactionRunner<Transaction> { run<T>(actor: BookPeriodTransitionCommand["actor"], work: (transaction: Transaction) => Promise<T>): Promise<T>; }

export class BookPeriodService<Transaction = unknown> {
  constructor(private readonly options: { readonly repository: BookPeriodRepository<Transaction>; readonly permissions: FinancePermissionChecker; readonly transactions: TransactionRunner<Transaction>; readonly audit: FinanceAuditRecorder<Transaction>; readonly outbox: FinanceOutboxWriter<Transaction> }) {}

  async transition(command: BookPeriodTransitionCommand): Promise<BookPeriodRecord> {
    if (!(await this.options.permissions.isAllowed(command.actor, financePermissions.periodManage))) throw new FinanceContractError("FINANCE_PERMISSION_DENIED");
    return this.options.transactions.run(command.actor, async transaction => {
      const current = await this.options.repository.get(command.actor.tenantId, command.coordinates.ledgerBookId, command.coordinates.fiscalPeriodId, transaction);
      if (!current) throw new FinanceContractError("FINANCE_NOT_FOUND", "Book period was not found");
      if (current.companyCodeId !== command.coordinates.companyCodeId || current.ledgerBookId !== command.coordinates.ledgerBookId || current.fiscalPeriodId !== command.coordinates.fiscalPeriodId) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Book period does not match the requested company/book/period coordinates");
      if (current.version !== command.expectedVersion) throw new FinanceContractError("FINANCE_EXPECTED_VERSION_CONFLICT", "Book period version conflict", { expectedVersion: command.expectedVersion, actualVersion: current.version });
      const reopening = current.status === "soft_close" && command.targetStatus === "open";
      if (!allowed(current.status, command.targetStatus, reopening && command.authorizeReopen === true)) throw new FinanceContractError("FINANCE_INVALID_COMMAND", `Invalid book-period transition: ${current.status} -> ${command.targetStatus}`);
      if (reopening) {
        if (!(await this.options.permissions.isAllowed(command.actor, financePermissions.periodReopen))) throw new FinanceContractError("FINANCE_PERMISSION_DENIED", `Missing permission: ${financePermissions.periodReopen}`);
        if (!command.reopenReason?.trim() || !command.reopenApprovalEvidence || Object.keys(command.reopenApprovalEvidence).length === 0) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Reopen reason and approval evidence are required");
      }
      const changed = await this.options.repository.transition(command, current, transaction);
      const metadata = { previousStatus: current.status, status: changed.status, previousVersion: current.version, version: changed.version, ...(reopening ? { reopenReason: command.reopenReason, reopenApprovalEvidence: command.reopenApprovalEvidence } : {}) };
      await this.options.outbox.append({ tenantId: command.actor.tenantId, topic: "finance", eventType: "finance.book_period.transitioned", eventKey: changed.id, aggregateType: "ledger.book_period_status", aggregateId: changed.id, actorId: command.actor.principalId, correlationId: command.actor.correlationId, payload: metadata }, transaction);
      await this.options.audit.record({ eventCode: reopening ? "finance.book_period.reopened" : "finance.book_period.transitioned", action: reopening ? "reopen" : "transition", outcome: "success", actor: { kind: "user", principalId: command.actor.principalId }, tenantId: command.actor.tenantId, entityType: "ledger.book_period_status", entityId: changed.id, requestId: command.actor.correlationId, correlationId: command.actor.correlationId, metadata }, transaction);
      return changed;
    });
  }
}

export function isPostingPeriod(status: BookPeriodRecord["status"]): boolean { return status === "open"; }
function allowed(from: BookPeriodRecord["status"], to: BookPeriodRecord["status"], reopen: boolean): boolean { return (from === "future" && to === "open") || (from === "open" && (to === "soft_close" || to === "hard_close")) || (from === "soft_close" && to === "hard_close") || (from === "soft_close" && to === "open" && reopen); }

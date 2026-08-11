import { FinanceContractError, financePermissions, type BudgetBalance, type BudgetCoordinate, type BudgetMutationCommand, type BudgetMutationPayload, type BudgetReconciliation, type BudgetRepository, type BudgetService as BudgetServiceContract, type BudgetState, type BudgetTransaction, type FinanceActor, type FinanceCommandRepository, type FinancePeriodAdmissionGuard, type FinancePermissionChecker } from "@athyper/server-contract-finance";
import type { FinanceAuditRecorder,FinanceOutboxWriter } from "../shared/evidence.js";

interface TransactionRunner<Transaction> { run<T>(actor: FinanceActor, work: (transaction: Transaction) => Promise<T>): Promise<T>; }

export class BudgetService<Transaction> implements BudgetServiceContract {
  constructor(private readonly options: { readonly transactions: TransactionRunner<Transaction>; readonly commands: FinanceCommandRepository<Transaction>; readonly repository: BudgetRepository<Transaction>; readonly guard: FinancePeriodAdmissionGuard; readonly permissions: FinancePermissionChecker; readonly audit:FinanceAuditRecorder<Transaction>;readonly outbox:FinanceOutboxWriter<Transaction>; }) {}

  async mutate(command: BudgetMutationCommand) {
    requireNeon(command.actor);
    const permission=command.payload.transactionType==="reverse"?financePermissions.budgetReverse:financePermissions.budgetManage;
    if(!await this.options.permissions.isAllowed(command.actor,permission))throw new FinanceContractError("FINANCE_PERMISSION_DENIED");
    validatePayload(command.payload);
    await this.options.guard.assertPeriodOpen(command.actor, command.payload.postingCoordinates);
    return this.options.transactions.run(command.actor, transaction => this.options.commands.execute<BudgetMutationPayload, { readonly transaction: BudgetTransaction; readonly balance: BudgetBalance }>(command, transaction, async current => {
      const balance = await this.options.repository.getOrCreateBalanceForUpdate(command.actor, command.payload, current);
      if (command.expectedVersion !== undefined && balance.versionNumber !== command.expectedVersion) throw new FinanceContractError("FINANCE_EXPECTED_VERSION_CONFLICT", "Budget balance changed", { expectedVersion: command.expectedVersion, actualVersion: balance.versionNumber });
      const previous = budgetState(balance);
      const effect = await this.resolveEffect(command, current);
      const resulting = applyBudgetTransition(previous, effect.transactionType, effect.amount, effect.direction);
      validateResultingState(resulting);
      const entry = await this.options.repository.append(command, current, { previous, resulting });
      const projected = await this.options.repository.compareAndSwapBalance(command.actor, { ...balance, ...resulting }, balance.versionNumber, current);
      if (!projected) throw new FinanceContractError("FINANCE_EXPECTED_VERSION_CONFLICT", "Concurrent budget mutation");
      await this.options.outbox.append({tenantId:command.actor.tenantId,topic:"finance",eventType:`finance.budget.${command.payload.transactionType}`,eventKey:entry.id,aggregateType:"ledger.budget_balance",aggregateId:projected.id,actorId:command.actor.principalId,correlationId:command.actor.correlationId,payload:{transactionId:entry.id,budgetAllocationId:entry.budgetAllocationId,fiscalYear:entry.fiscalYear,periodNumber:entry.periodNumber,balanceVersion:projected.versionNumber}},current);
      await this.options.audit.record({eventCode:`finance.budget.${command.payload.transactionType}`,action:command.payload.transactionType,outcome:"success",actor:{kind:"user",principalId:command.actor.principalId},tenantId:command.actor.tenantId,entityType:"ledger.budget_transaction",entityId:entry.id,requestId:command.actor.correlationId,correlationId:command.actor.correlationId,metadata:{budgetAllocationId:entry.budgetAllocationId,balanceVersion:projected.versionNumber,reversalOfTransactionId:entry.reversalOfTransactionId}},current);
      return { resourceId: entry.id, version: projected.versionNumber, output: { transaction: entry, balance: projected } };
    }));
  }

  rebuild(actor: FinanceActor, coordinate: BudgetCoordinate): Promise<BudgetState> {
    return new BudgetBalanceService(this.options.transactions, this.options.repository, this.options.permissions).rebuild(actor, coordinate);
  }

  private async resolveEffect(command: BudgetMutationCommand, transaction: Transaction): Promise<{ transactionType: Exclude<BudgetTransaction["transactionType"], "reverse">; amount: string; direction: BudgetTransaction["direction"] }> {
    if (command.payload.transactionType !== "reverse") return command.payload as { transactionType: Exclude<BudgetTransaction["transactionType"], "reverse">; amount: string; direction: BudgetTransaction["direction"] };
    const originalId = command.payload.reversalOfTransactionId;
    if (!originalId) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Reversal requires the original transaction ID");
    const original = await this.options.repository.getTransaction(command.actor, originalId, transaction);
    if (!original || original.transactionType === "reverse") throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Original budget transaction is not reversible");
    if (await this.options.repository.findReversal(command.actor, originalId, transaction)) throw new FinanceContractError("FINANCE_IDEMPOTENCY_CONFLICT", "Budget transaction was already reversed");
    if (!sameCoordinate(command.payload, original) || command.payload.amount !== original.amount || command.payload.currencyCode !== original.currencyCode || command.payload.direction !== opposite(original.direction)) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Reversal must exactly oppose the original transaction");
    return { transactionType: original.transactionType, amount: original.amount, direction: opposite(original.direction) };
  }
}

export class BudgetBalanceService<Transaction> {
  constructor(private readonly transactions: TransactionRunner<Transaction>, private readonly repository: BudgetRepository<Transaction>,private readonly permissions:FinancePermissionChecker) {}
  async rebuild(actor: FinanceActor, coordinate: BudgetCoordinate): Promise<BudgetState> {
    requireNeon(actor);
    if(!await this.permissions.isAllowed(actor,financePermissions.budgetRebuild))throw new FinanceContractError("FINANCE_PERMISSION_DENIED");
    return this.transactions.run(actor, async transaction => rebuildFromLog(await this.repository.listTransactions(actor, coordinate, transaction)));
  }
  async reconcile(actor: FinanceActor, coordinate: BudgetCoordinate): Promise<BudgetReconciliation> {
    requireNeon(actor);
    if(!await this.permissions.isAllowed(actor,financePermissions.budgetRead))throw new FinanceContractError("FINANCE_PERMISSION_DENIED");
    return this.transactions.run(actor, async transaction => {
      const stored = await this.repository.getBalance(actor, coordinate, transaction);
      if(!stored)throw new FinanceContractError("FINANCE_NOT_FOUND","Budget balance not found");
      const rebuilt = rebuildFromLog(await this.repository.listTransactions(actor, coordinate, transaction));
      const current = budgetState(stored);
      return { coordinate, stored: current, rebuilt, matches: statesEqual(current, rebuilt), storedVersion: stored.versionNumber };
    });
  }
}

export function rebuildFromLog(entries: readonly BudgetTransaction[]): BudgetState {
  let next = zeroBudgetState();
  const reversed = new Map(entries.filter(item => item.transactionType === "reverse" && item.reversalOfTransactionId).map(item => [item.reversalOfTransactionId!, item]));
  for (const item of entries) {
    if (!statesEqual(next,item.previousState)) throw new FinanceContractError("FINANCE_IMMUTABLE_EVIDENCE", "Budget transaction predecessor state is inconsistent", { transactionId: item.id });
    if (item.transactionType === "reverse") {
      const original = entries.find(candidate => candidate.id === item.reversalOfTransactionId);
      if (!original || original.transactionType === "reverse") throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Broken budget reversal chain");
      next = applyBudgetTransition(next, original.transactionType, original.amount, opposite(original.direction));
    } else next = applyBudgetTransition(next, item.transactionType, item.amount, item.direction);
    if (!statesEqual(next, item.resultingState)) throw new FinanceContractError("FINANCE_IMMUTABLE_EVIDENCE", "Budget transaction state chain is inconsistent", { transactionId: item.id, reversed: reversed.has(item.id) });
  }
  return next;
}

export function applyBudgetTransition(previous: BudgetState, kind: Exclude<BudgetTransaction["transactionType"], "reverse">, amount: string, direction: BudgetTransaction["direction"]): BudgetState {
  assertPositive(amount); const delta = direction === "debit" ? scaled(amount) : -scaled(amount);
  const values = { opening: scaled(previous.openingAmount), reserved: scaled(previous.reservedAmount), consumed: scaled(previous.consumedAmount), released: scaled(previous.releasedAmount), adjusted: scaled(previous.adjustedAmount) };
  if (kind === "allocate") values.opening += delta;
  else if (kind === "reserve") values.reserved += delta;
  else if (kind === "release") values.released += delta;
  else if (kind === "consume") { values.consumed += delta; values.released += delta; }
  else if (kind === "adjust") values.adjusted += delta;
  if (values.opening < 0n || values.reserved < 0n || values.consumed < 0n || values.released < 0n || values.released > values.reserved) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Budget movement produces an invalid cumulative state");
  const available = values.opening - values.reserved - values.consumed + values.released + values.adjusted;
  return { openingAmount: format(values.opening), reservedAmount: format(values.reserved), consumedAmount: format(values.consumed), releasedAmount: format(values.released), adjustedAmount: format(values.adjusted), availableAmount: format(available) };
}

function validateResultingState(state: BudgetState): void { if (scaled(state.availableAmount) < 0n) throw new FinanceContractError("FINANCE_BUDGET_OVESPEND"); }
function validatePayload(payload: BudgetMutationPayload): void { if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.effectiveDate) || payload.fiscalYear < 1900 || payload.fiscalYear > 9999 || payload.periodNumber < 1 || payload.periodNumber > 16 || !payload.sourceDocumentType.trim() || !payload.postingCoordinates.companyCodeId || !payload.postingCoordinates.ledgerBookId || !payload.postingCoordinates.fiscalPeriodId || payload.postingCoordinates.currencyCode !== payload.currencyCode) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Budget posting coordinates are incomplete or inconsistent"); if ((payload.transactionType === "reverse") !== Boolean(payload.reversalOfTransactionId)) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Only reversal entries may reference an original transaction"); }
function sameCoordinate(left: BudgetCoordinate, right: BudgetCoordinate): boolean { return left.budgetAllocationId === right.budgetAllocationId && left.fiscalYear === right.fiscalYear && left.periodNumber === right.periodNumber; }
function opposite(direction: BudgetTransaction["direction"]): BudgetTransaction["direction"] { return direction === "debit" ? "credit" : "debit"; }
function budgetState(balance: BudgetBalance): BudgetState { const { openingAmount, reservedAmount, consumedAmount, releasedAmount, adjustedAmount, availableAmount } = balance; return { openingAmount, reservedAmount, consumedAmount, releasedAmount, adjustedAmount, availableAmount }; }
function zeroBudgetState(): BudgetState { return { openingAmount: "0.0000", reservedAmount: "0.0000", consumedAmount: "0.0000", releasedAmount: "0.0000", adjustedAmount: "0.0000", availableAmount: "0.0000" }; }
function statesEqual(left: BudgetState, right: BudgetState): boolean { return Object.keys(left).every(key => scaled(left[key as keyof BudgetState]) === scaled(right[key as keyof BudgetState])); }
function requireNeon(actor: FinanceActor): void { if (actor.planeKey !== "neon") throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Finance executes only in Neon"); }
function assertPositive(value: string): void { if (!/^\d+(?:\.\d{1,4})?$/.test(value) || scaled(value) <= 0n) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Amount must be a positive canonical decimal with at most four places"); }
function scaled(value: string): bigint { const sign=value.startsWith("-")?-1n:1n; const normalized=value.replace(/^[+-]/,""); const [whole="0",fraction=""]=normalized.split("."); return sign*(BigInt(whole)*10000n+BigInt((fraction+"0000").slice(0,4))); }
function format(value: bigint): string { const sign=value<0n?"-":"",digits=(value<0n?-value:value).toString().padStart(5,"0");return `${sign}${digits.slice(0,-4)}.${digits.slice(-4)}`; }

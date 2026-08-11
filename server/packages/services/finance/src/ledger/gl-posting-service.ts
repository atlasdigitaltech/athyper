import { FinanceContractError, financePermissions, type CanonicalJournalLine, type CanonicalJournalSnapshot, type CanonicalJournalSourcePort, type FinanceActor, type FinanceCommandRepository, type FinancePermissionChecker, type GlBalance, type GlBalanceQuery, type GlBalanceRepository, type GlCoordinate, type GlPostingCommand, type GlPostingOutput, type GlReconciliation } from "@athyper/server-contract-finance";
import type { FinanceAuditRecorder, FinanceOutboxWriter } from "../shared/evidence.js";
import { FinancePostingGuard } from "../shared/posting-guard.js";
import { roundFinanceDecimal } from "../shared/rounding-resolver.js";
import { decimalString, decimalUnits } from "../shared/decimal.js";

interface TransactionRunner<Transaction> { run<T>(actor: FinanceActor, work: (transaction: Transaction) => Promise<T>): Promise<T>; }

export class GlPostingService<Transaction> {
  constructor(private readonly options: { readonly transactions: TransactionRunner<Transaction>; readonly commands: FinanceCommandRepository<Transaction>; readonly repository: GlBalanceRepository<Transaction>; readonly journals: CanonicalJournalSourcePort; readonly guard: FinancePostingGuard; readonly audit: FinanceAuditRecorder<Transaction>; readonly outbox: FinanceOutboxWriter<Transaction> }) {}

  async post(command: GlPostingCommand) {
    requireNeon(command.actor);
    if (!Number.isSafeInteger(command.payload.postingSequence) || command.payload.postingSequence < 1) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Posting sequence must be a positive safe integer");
    const journal = await this.options.journals.loadImmutable(command.actor, command.payload.journal);
    if (!journal || journal.journalEntryId !== command.payload.journal.sourceId || journal.version !== command.payload.journal.version || journal.hash !== command.payload.journal.hash) throw new FinanceContractError("FINANCE_IMMUTABLE_EVIDENCE", "Canonical journal version/hash evidence does not match");
    const admission = await this.options.guard.admit({ actor: command.actor, permissionCode: financePermissions.ledgerPost, coordinates: journal, roundingSlot: "LINE_NET", source: command.payload.journal });
    if (journal.transactionCurrencyCode !== journal.currencyCode || journal.baseCurrencyCode !== admission.book.baseCurrencyCode) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Journal transaction/base currencies do not match the admitted ledger coordinates");
    validateJournal(journal, admission.rounding);
    const dimensionViolations = await this.options.journals.validateDimensionScope(command.actor, journal);
    if (dimensionViolations.length) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Journal dimensions are outside the company/account scope", { violations: dimensionViolations });
    const aggregates = aggregate(journal);
    return this.options.transactions.run(command.actor, transaction => this.options.commands.execute(command, transaction, async current => {
      const balances: GlBalance[] = [];
      for (const item of aggregates) {
        const result = await this.options.repository.applyAggregate({ actor: command.actor, coordinate: item.coordinate, debit: item.debit, credit: item.credit, postingSequence: command.payload.postingSequence, idempotencyKey: command.idempotencyKey, journalEntryId: journal.journalEntryId, postedAt: journal.postedAt }, current);
        balances.push(result.balance);
      }
      const output: GlPostingOutput = { journalEntryId: journal.journalEntryId, balances, admissionEvidenceHash: admission.evidenceHash };
      await this.options.outbox.append({ tenantId: command.actor.tenantId, topic: "finance", eventType: "finance.gl.posted", eventKey: journal.journalEntryId, aggregateType: "document.journal_entry", aggregateId: journal.journalEntryId, actorId: command.actor.principalId, correlationId: command.actor.correlationId, payload: { commandId: command.commandId, coordinateCount: balances.length, journalVersion: journal.version, journalHash: journal.hash } }, current);
      await this.options.audit.record({ eventCode: "finance.gl.posted", action: "post", outcome: "success", actor: { kind: "user", principalId: command.actor.principalId }, tenantId: command.actor.tenantId, entityType: "document.journal_entry", entityId: journal.journalEntryId, requestId: command.actor.correlationId, correlationId: command.actor.correlationId, metadata: { journalVersion: journal.version, journalHash: journal.hash, admissionEvidenceHash: admission.evidenceHash, coordinateCount: balances.length } }, current);
      return { resourceId: journal.journalEntryId, version: Math.max(...balances.map(item => item.versionNumber)), output };
    }));
  }
}

export class GlBalanceQueryService<Transaction>{constructor(private readonly options:{readonly transactions:TransactionRunner<Transaction>;readonly repository:GlBalanceRepository<Transaction>;readonly permissions:FinancePermissionChecker}){}async reconcile(actor:FinanceActor,query:GlBalanceQuery):Promise<GlReconciliation>{requireNeon(actor);if(!await this.options.permissions.isAllowed(actor,financePermissions.ledgerRead))throw new FinanceContractError("FINANCE_PERMISSION_DENIED");if(!query.companyCodeId||!query.ledgerBookId||!query.fiscalPeriodId)throw new FinanceContractError("FINANCE_INVALID_COMMAND","GL reconciliation scope is incomplete");const list=this.options.repository.list;if(!list)throw new FinanceContractError("FINANCE_NOT_FOUND","GL reconciliation query adapter is unavailable");const balances=await this.options.transactions.run(actor,tx=>list.call(this.options.repository,actor,query,tx)),debit=balances.reduce((sum,item)=>sum+decimalUnits(item.periodDebit,4),0n),credit=balances.reduce((sum,item)=>sum+decimalUnits(item.periodCredit,4),0n);return{query,balances,periodDebit:decimalString(debit,4),periodCredit:decimalString(credit,4),balanced:debit===credit};}}

function validateJournal(journal: CanonicalJournalSnapshot, rounding: Parameters<typeof roundFinanceDecimal>[1]): void {
  if (journal.status !== "posted" || journal.lines.length < 2 || journal.lineCount !== journal.lines.length) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Only a complete posted journal snapshot may update GL");
  let transactionDebit = 0n, transactionCredit = 0n, baseDebit = 0n, baseCredit = 0n;
  for (const line of journal.lines) {
    if (line.transactionCurrencyCode !== journal.transactionCurrencyCode || line.baseCurrencyCode !== journal.baseCurrencyCode) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Journal line currency does not match its immutable header");
    const td = decimalUnits(line.transactionDebit, 4, "transactionDebit"), tc = decimalUnits(line.transactionCredit, 4, "transactionCredit"), bd = decimalUnits(line.baseDebit, 4, "baseDebit"), bc = decimalUnits(line.baseCredit, 4, "baseCredit");
    if (!((td > 0n && tc === 0n) || (tc > 0n && td === 0n)) || !((bd > 0n && bc === 0n) || (bc > 0n && bd === 0n)) || (td > 0n) !== (bd > 0n)) throw new FinanceContractError("FINANCE_INVALID_COMMAND", `Journal line ${line.lineNo} has invalid debit/credit polarity`);
    for (const amount of [line.transactionDebit, line.transactionCredit]) if (decimalUnits(amount, 4) > 0n && decimalUnits(roundFinanceDecimal(amount, rounding), 4) !== decimalUnits(amount, 4)) throw new FinanceContractError("FINANCE_INVALID_COMMAND", `Journal line ${line.lineNo} violates currency rounding`);
    transactionDebit += td; transactionCredit += tc; baseDebit += bd; baseCredit += bc;
  }
  if (transactionDebit !== transactionCredit || baseDebit !== baseCredit || transactionDebit !== decimalUnits(journal.totalDebit, 4) || transactionCredit !== decimalUnits(journal.totalCredit, 4)) throw new FinanceContractError("FINANCE_UNBALANCED_POSTING", "Journal must balance in transaction and base currency and match header totals");
}

function aggregate(journal: CanonicalJournalSnapshot): readonly { coordinate: GlCoordinate; debit: string; credit: string }[] {
  const values = new Map<string, { coordinate: GlCoordinate; debit: bigint; credit: bigint }>();
  for (const line of journal.lines) {
    const coordinate = lineCoordinate(journal, line), key = JSON.stringify(coordinate);
    const current = values.get(key) ?? { coordinate, debit: 0n, credit: 0n };
    current.debit += decimalUnits(line.transactionDebit, 4); current.credit += decimalUnits(line.transactionCredit, 4); values.set(key, current);
  }
  return [...values.values()].sort((a, b) => JSON.stringify(a.coordinate).localeCompare(JSON.stringify(b.coordinate))).map(item => ({ coordinate: item.coordinate, debit: decimalString(item.debit, 4), credit: decimalString(item.credit, 4) }));
}
function lineCoordinate(journal: CanonicalJournalSnapshot, line: CanonicalJournalLine): GlCoordinate { return { companyCodeId: journal.companyCodeId, ledgerBookId: journal.ledgerBookId, fiscalPeriodId: journal.fiscalPeriodId, currencyCode: line.transactionCurrencyCode, glAccountId: line.glAccountId, ...(line.costCenterId ? { costCenterId: line.costCenterId } : {}), ...(line.profitCenterId ? { profitCenterId: line.profitCenterId } : {}), ...(line.projectId ? { projectId: line.projectId } : {}), ...(line.dimensionSetId ? { dimensionSetId: line.dimensionSetId } : {}) }; }
function requireNeon(actor: FinanceActor): void { if (actor.planeKey !== "neon") throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Finance executes only in Neon"); }

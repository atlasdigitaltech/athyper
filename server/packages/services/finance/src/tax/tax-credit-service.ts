import { FinanceContractError, financePermissions, type FinanceActor, type FinanceCommandRepository, type FinancePeriodAdmissionGuard, type FinancePermissionChecker, type TaxCreditBalance, type TaxCreditCoordinate, type TaxCreditMovement, type TaxCreditMovementCommand, type TaxCreditRepository, type TaxCreditSourcePort } from "@athyper/server-contract-finance";
import type { FinanceAuditRecorder, FinanceOutboxWriter } from "../shared/evidence.js";
import { decimalString, decimalUnits } from "../shared/decimal.js";

interface TransactionRunner<Transaction> { run<T>(actor: FinanceActor, work: (transaction: Transaction) => Promise<T>): Promise<T>; }

export class TaxCreditService<Transaction> {
  constructor(private readonly options: { readonly transactions: TransactionRunner<Transaction>; readonly commands: FinanceCommandRepository<Transaction>; readonly repository: TaxCreditRepository<Transaction>; readonly sourceCalculations: TaxCreditSourcePort<Transaction>; readonly guard: FinancePeriodAdmissionGuard; readonly permissions: FinancePermissionChecker; readonly audit: FinanceAuditRecorder<Transaction>; readonly outbox: FinanceOutboxWriter<Transaction> }) {}

  async move(command: TaxCreditMovementCommand) {
    validate(command);
    const permission=command.payload.movementType==="reversal"?financePermissions.taxReverse:financePermissions.taxCalculate;
    if (!await this.options.permissions.isAllowed(command.actor, permission)) throw new FinanceContractError("FINANCE_PERMISSION_DENIED");
    await this.options.guard.assertPeriodOpen(command.actor, command.payload);
    return this.options.transactions.run(command.actor, tx => this.options.commands.execute(command, tx, async current => {
      if (command.payload.movementType === "posting") await this.validatePostingSource(command, current);
      if (command.payload.reversesMovementId) {
        const original = await this.options.repository.get(command.actor, command.payload.reversesMovementId, current);
        if (!original || original.movementType === "reversal") throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Tax-credit reversal must reference an original movement");
        if (await this.options.repository.findReversal(command.actor, original.id, current)) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Tax-credit movement has already been reversed");
        assertSameCoordinate(command.payload, original);
        if (decimalUnits(command.payload.amount, 4) !== -decimalUnits(original.amount, 4)) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Tax-credit reversal must exactly negate the original movement");
      }
      const movement = await this.options.repository.append(command, current);
      await this.options.outbox.append({ tenantId: command.actor.tenantId, topic: "finance", eventType: command.payload.movementType === "reversal" ? "finance.tax_credit.reversed" : "finance.tax_credit.moved", eventKey: movement.id, aggregateType: "ledger.tax_credit_bucket", aggregateId: bucketKey(movement), actorId: command.actor.principalId, correlationId: command.actor.correlationId, payload: { movementId: movement.id, amount: movement.amount, sourceTaxCalculationId: movement.sourceTaxCalculationId } }, current);
      await this.options.audit.record({ eventCode: command.payload.movementType === "reversal" ? "finance.tax_credit.reversed" : "finance.tax_credit.moved", action: command.payload.movementType, outcome: "success", actor: { kind: "user", principalId: command.actor.principalId }, tenantId: command.actor.tenantId, entityType: "ledger.tax_credit_movement", entityId: movement.id, correlationId: command.actor.correlationId, metadata: { bucket: movement.taxBucket, amount: movement.amount } }, current);
      return { resourceId: movement.id, version: 1, output: { movement } };
    }));
  }

  private async validatePostingSource(command: TaxCreditMovementCommand, tx: Transaction) {
    const sourceId = command.payload.sourceTaxCalculationId;
    if (!sourceId) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "A tax-credit posting requires its source tax calculation");
    const calculation = await this.options.sourceCalculations.getCalculation(command.actor, sourceId, tx);
    if (!calculation || calculation.reversesCalculationId || calculation.taxDirection !== "purchase") throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Tax-credit posting requires an original purchase-tax calculation");
    if (calculation.coordinates.companyCodeId !== command.payload.companyCodeId || calculation.coordinates.ledgerBookId !== command.payload.ledgerBookId || calculation.jurisdictionId !== command.payload.jurisdictionId || calculation.taxTypeId !== command.payload.taxTypeId || calculation.coordinates.currencyCode !== command.payload.currencyCode) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Tax-credit source coordinates do not match the bucket");
    const existing = await this.options.repository.listForSource(command.actor, sourceId, tx);
    const posted = existing.reduce((sum, item) => sum + decimalUnits(item.amount, 4), 0n);
    const next = decimalUnits(command.payload.amount, 4);
    if (next <= 0n || posted + next > decimalUnits(calculation.recoverableAmount, 4)) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Tax-credit posting exceeds the source recoverable amount");
  }

  async balance(actor: FinanceActor, coordinate: TaxCreditCoordinate, asOf: string): Promise<TaxCreditBalance> { return this.readBalance(actor, coordinate, asOf,financePermissions.taxRead); }
  async rebuild(actor: FinanceActor, coordinate: TaxCreditCoordinate, asOf: string): Promise<TaxCreditBalance> { return this.readBalance(actor, coordinate, asOf,financePermissions.taxRebuild); }

  private async readBalance(actor: FinanceActor, coordinate: TaxCreditCoordinate, asOf: string,permission:string): Promise<TaxCreditBalance> {
    if (actor.planeKey !== "neon" || !asOf || !await this.options.permissions.isAllowed(actor, permission)) throw new FinanceContractError("FINANCE_PERMISSION_DENIED");
    return this.options.transactions.run(actor, async tx => rebuildTaxCreditBalance(coordinate, asOf, await this.options.repository.list(actor, coordinate, asOf, tx)));
  }
}

export function rebuildTaxCreditBalance(coordinate: TaxCreditCoordinate, asOf: string, movements: readonly TaxCreditMovement[]): TaxCreditBalance {
  const eligible = movements.filter(item => item.createdAt <= asOf).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  for (const item of eligible) assertSameCoordinate(coordinate, item);
  return { ...coordinate, asOf, amount: decimalString(eligible.reduce((sum, item) => sum + decimalUnits(item.amount, 4), 0n), 4), movementCount: eligible.length, ...(eligible.length ? { lastMovementId: eligible.at(-1)!.id } : {}) };
}

function validate(command: TaxCreditMovementCommand) { const p = command.payload; if (command.actor.planeKey !== "neon" || !p.companyCodeId || !p.ledgerBookId || !p.fiscalPeriodId || !p.jurisdictionId || !p.taxTypeId || !p.currencyCode || decimalUnits(p.amount, 4) === 0n) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Tax-credit movement coordinates and a non-zero amount are required"); if ((p.movementType === "reversal") !== Boolean(p.reversesMovementId)) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Only reversal movements may reference a reversed movement"); if (p.reason !== undefined && !p.reason.trim()) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Tax-credit reason cannot be blank"); }
function assertSameCoordinate(left: TaxCreditCoordinate, right: TaxCreditCoordinate) { if (left.companyCodeId !== right.companyCodeId || left.ledgerBookId !== right.ledgerBookId || left.jurisdictionId !== right.jurisdictionId || left.taxTypeId !== right.taxTypeId || left.taxBucket !== right.taxBucket || left.currencyCode !== right.currencyCode) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Tax-credit movement coordinates do not match the bucket"); }
function bucketKey(value: TaxCreditCoordinate) { return [value.companyCodeId, value.ledgerBookId, value.jurisdictionId, value.taxTypeId, value.taxBucket, value.currencyCode].join(":"); }

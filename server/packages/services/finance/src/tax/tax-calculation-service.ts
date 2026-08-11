import { FinanceContractError, financePermissions, type FinanceActor, type FinanceCommandRepository, type FinancePeriodAdmissionGuard, type FinancePermissionChecker, type ResolvedTaxConfiguration, type RoundingEvidence, type TaxBasisSnapshot, type TaxCalculationCommand, type TaxCalculationLine, type TaxCalculationOutput, type TaxCalculationRepository, type TaxConfigurationPort, type TaxRateSnapshot, type TaxSourcePort } from "@athyper/server-contract-finance";
import type { FinanceAuditRecorder, FinanceOutboxWriter } from "../shared/evidence.js";
import { canonicalFinanceHash } from "../shared/canonical.js";
import { createHash } from "node:crypto";
import { decimalString, decimalUnits } from "../shared/decimal.js";
import { roundFinanceDecimal, RoundingResolver } from "../shared/rounding-resolver.js";

interface TransactionRunner<Transaction> { run<T>(actor: FinanceActor, work: (transaction: Transaction) => Promise<T>): Promise<T>; }

export class TaxCalculationService<Transaction> {
  constructor(private readonly options: { readonly transactions: TransactionRunner<Transaction>; readonly commands: FinanceCommandRepository<Transaction>; readonly repository: TaxCalculationRepository<Transaction>; readonly configuration: TaxConfigurationPort; readonly sources: TaxSourcePort; readonly rounding: RoundingResolver; readonly guard: FinancePeriodAdmissionGuard; readonly permissions: FinancePermissionChecker; readonly audit: FinanceAuditRecorder<Transaction>; readonly outbox: FinanceOutboxWriter<Transaction> }) {}

  async calculate(command: TaxCalculationCommand) {
    validateCommand(command);
    const permission=command.payload.reversesCalculationIds?.length?financePermissions.taxReverse:financePermissions.taxCalculate;
    if (!await this.options.permissions.isAllowed(command.actor, permission)) throw new FinanceContractError("FINANCE_PERMISSION_DENIED");
    await this.options.guard.assertPeriodOpen(command.actor, command.payload.coordinates);
    const source = await this.options.sources.loadImmutable(command.actor, command.payload.source);
    if (!source || source.version !== command.payload.source.version || source.hash !== command.payload.source.hash) throw new FinanceContractError("FINANCE_IMMUTABLE_EVIDENCE", "Tax source version/hash evidence changed");
    const [transactionRounding, baseRounding] = await Promise.all([
      this.options.rounding.resolve({ tenantId: command.actor.tenantId, companyCodeId: command.payload.coordinates.companyCodeId, currencyCode: command.payload.coordinates.currencyCode, slot: "LINE_TAX" }),
      this.options.rounding.resolve({ tenantId: command.actor.tenantId, companyCodeId: command.payload.coordinates.companyCodeId, currencyCode: command.payload.baseCurrencyCode, slot: "LINE_TAX" }),
    ]);
    return this.options.transactions.run(command.actor, tx => this.options.commands.execute(command, tx, async current => {
      const lines = command.payload.reversesCalculationIds?.length
        ? await this.reverse(command, current)
        : await this.calculateAndAppend(command, transactionRounding, baseRounding, current);
      const output: TaxCalculationOutput = { lines, totalTaxAmount: sum(lines.map(line => line.taxAmount)), totalBaseCurrencyAmount: sum(lines.map(line => line.baseCurrencyAmount)) };
      await this.options.outbox.append({ tenantId: command.actor.tenantId, topic: "finance", eventType: command.payload.reversesCalculationIds?.length ? "finance.tax.reversed" : "finance.tax.calculated", eventKey: command.commandId, aggregateType: command.payload.source.sourceType, aggregateId: command.payload.source.sourceId, actorId: command.actor.principalId, correlationId: command.actor.correlationId, payload: { calculationIds: lines.map(line => line.id), sourceVersion: source.version, sourceHash: source.hash } }, current);
      await this.options.audit.record({ eventCode: command.payload.reversesCalculationIds?.length ? "finance.tax.reversed" : "finance.tax.calculated", action: command.payload.reversesCalculationIds?.length ? "reverse" : "calculate", outcome: "success", actor: { kind: "user", principalId: command.actor.principalId }, tenantId: command.actor.tenantId, entityType: "ledger.tax_calculation", entityId: command.commandId, correlationId: command.actor.correlationId, metadata: { calculationIds: lines.map(line => line.id), evidenceHashes: lines.map(line => line.evidenceHash) } }, current);
      return { resourceId: command.commandId, version: 1, output };
    }));
  }

  replay(line: TaxCalculationLine): TaxCalculationLine {
    if (taxEvidenceHash(line.ruleSnapshot, line.rateSnapshot, line.basisSnapshot) !== line.evidenceHash) throw new FinanceContractError("FINANCE_IMMUTABLE_EVIDENCE", "Tax calculation evidence hash does not reproduce");
    if (canonicalFinanceHash(line.source) !== canonicalFinanceHash(line.basisSnapshot.source) || line.taxRateScheduleId !== line.rateSnapshot.scheduleId || line.rateValue !== line.rateSnapshot.rateValue || line.calculationBasisCode !== line.basisSnapshot.calculationBasisCode) throw new FinanceContractError("FINANCE_IMMUTABLE_EVIDENCE", "Tax line coordinates do not match its bounded snapshots");
    const reversal = Boolean(line.reversesCalculationId);
    const base = decimal(line.taxableBaseAmount);
    const positiveBase = reversal ? { n: abs(base.n), d: base.d } : base;
    const calculated = calculateComponent(positiveBase, line.rateSnapshot, line.basisSnapshot.quantity);
    const raw = reversal ? { n: -calculated.n, d: calculated.d } : calculated;
    const rounded = roundFinanceDecimal(toDecimal(raw), line.basisSnapshot.rounding);
    if (decimalUnits(rounded, 4) !== decimalUnits(line.taxAmount, 4)) throw new FinanceContractError("FINANCE_IMMUTABLE_EVIDENCE", "Historical tax amount does not replay from its snapshots");
    const fxAmount = roundFinanceDecimal(toDecimal(multiply(decimal(line.taxAmount), decimal(line.exchangeRate))), line.basisSnapshot.baseRounding);
    if (decimalUnits(fxAmount, 4) !== decimalUnits(line.baseCurrencyAmount, 4)) throw new FinanceContractError("FINANCE_IMMUTABLE_EVIDENCE", "Historical FX amount does not replay from its snapshots");
    const expectedRecoverable = recoverable(line.rateSnapshot, decimalUnits(line.taxAmount, 4));
    if (decimalUnits(line.recoverableAmount, 4) !== expectedRecoverable || decimalUnits(line.nonrecoverableAmount, 4) !== abs(decimalUnits(line.taxAmount, 4)) - expectedRecoverable) throw new FinanceContractError("FINANCE_IMMUTABLE_EVIDENCE", "Historical recoverability split does not replay from its rate snapshot");
    return line;
  }

  private async calculateAndAppend(command: TaxCalculationCommand, rounding: RoundingEvidence, baseRounding: RoundingEvidence, tx: Transaction): Promise<readonly TaxCalculationLine[]> {
    const config = await this.options.configuration.resolve(command.actor, command.payload.resolution, command.payload.coordinates.companyCodeId);
    if (!config) throw new FinanceContractError("FINANCE_NOT_FOUND", "No effective tax rule was resolved");
    validateConfiguration(config, command);
    const amount = decimal(command.payload.amount);
    if (amount.n <= 0n) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Ordinary tax calculation amount must be positive; use a linked reversal for negative tax");
    const components = [...config.components].sort((a, b) => a.calculationSequence - b.calculationSequence);
    if (!components.length) return [];
    const bases = componentBases(amount, components, config.compound, command.payload.pricingMode, command.payload.quantity);
    const lines: TaxCalculationLine[] = [];
    for (let index = 0; index < components.length; index += 1) {
      const rate = components[index]!;
      const taxableBase = bases[index]!;
      const rawTax = calculateComponent(taxableBase, rate, command.payload.quantity);
      const taxAmount = roundFinanceDecimal(toDecimal(rawTax), rounding);
      if (decimalUnits(taxAmount, 4) === 0n) continue;
      const baseAmount = roundFinanceDecimal(toDecimal(multiply(decimal(taxAmount), decimal(command.payload.exchangeRate))), baseRounding);
      const recoverability = recoverable(rate, decimalUnits(taxAmount, 4));
      const basis: TaxBasisSnapshot = { calculationBasisCode: rate.calculationBasisCode.toLowerCase(), pricingMode: command.payload.pricingMode, compound: config.compound, rounding, baseRounding, source: command.payload.source, baseCurrencyCode: command.payload.baseCurrencyCode, ...(command.payload.quantity !== undefined ? { quantity: command.payload.quantity, uomCode: command.payload.uomCode } : {}) };
      const id = derivedId(command.commandId, index);
      const line: TaxCalculationLine = { id, coordinates: command.payload.coordinates, source: command.payload.source, jurisdictionId: rate.jurisdictionId, taxTypeId: rate.taxTypeId, taxGroupId: config.taxGroupId, taxRateScheduleId: rate.scheduleId, componentCode: rate.componentCode, taxDirection: (rate.taxDirection === "BOTH" ? command.payload.resolution.transactionDirection : rate.taxDirection).toLowerCase() as TaxCalculationLine["taxDirection"], taxTreatment: rate.taxTreatment.toLowerCase() as TaxCalculationLine["taxTreatment"], rateKind: rate.rateKind.toLowerCase() as TaxCalculationLine["rateKind"], rateValue: rate.rateValue, calculationBasisCode: basis.calculationBasisCode, taxableBaseAmount: fixed(taxableBase), taxAmount: fixed(decimal(taxAmount)), roundingAdjustment: "0.0000", recoverability: rate.recoverability.toLowerCase() as TaxCalculationLine["recoverability"], recoverableAmount: decimalString(recoverability, 4), nonrecoverableAmount: decimalString(abs(decimalUnits(taxAmount, 4)) - recoverability, 4), baseCurrencyAmount: fixed(decimal(baseAmount)), exchangeRate: command.payload.exchangeRate, ruleSnapshot: config.rule, rateSnapshot: rate, basisSnapshot: basis, evidenceHash: taxEvidenceHash(config.rule, rate, basis), idempotencyKey: `${command.idempotencyKey}:${rate.componentCode}`, postedAt: command.payload.postedAt };
      lines.push(await this.options.repository.append(command.actor, line, tx));
    }
    return lines;
  }

  private async reverse(command: TaxCalculationCommand, tx: Transaction): Promise<readonly TaxCalculationLine[]> {
    const ids = command.payload.reversesCalculationIds!;
    if (new Set(ids).size !== ids.length) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "A tax calculation cannot be reversed twice in one command");
    const result: TaxCalculationLine[] = [];
    for (let index = 0; index < ids.length; index += 1) {
      const original = await this.options.repository.get(command.actor, ids[index]!, tx);
      if (!original || original.reversesCalculationId) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Reversal must reference an original tax calculation");
      if (await this.options.repository.findReversal(command.actor, original.id, tx)) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Tax calculation has already been reversed");
      if (original.coordinates.companyCodeId !== command.payload.coordinates.companyCodeId || original.coordinates.ledgerBookId !== command.payload.coordinates.ledgerBookId || original.coordinates.currencyCode !== command.payload.coordinates.currencyCode) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Tax reversal coordinates must match the original");
      const basisSnapshot = { ...original.basisSnapshot, source: command.payload.source };
      const line: TaxCalculationLine = { ...original, id: derivedId(command.commandId, index), coordinates: { ...original.coordinates, fiscalPeriodId: command.payload.coordinates.fiscalPeriodId }, source: command.payload.source, taxableBaseAmount: negate(original.taxableBaseAmount), taxAmount: negate(original.taxAmount), roundingAdjustment: negate(original.roundingAdjustment), baseCurrencyAmount: negate(original.baseCurrencyAmount), basisSnapshot, evidenceHash: taxEvidenceHash(original.ruleSnapshot, original.rateSnapshot, basisSnapshot), reversesCalculationId: original.id, idempotencyKey: `${command.idempotencyKey}:${original.componentCode}`, postedAt: command.payload.postedAt };
      result.push(await this.options.repository.append(command.actor, line, tx));
    }
    return result;
  }
}

/** Matches PostgreSQL jsonb::text concatenation enforced by ledger.tax_calculation. */
export function taxEvidenceHash(rule: Readonly<Record<string, unknown>>, rate: Readonly<Record<string, unknown>>, basis: Readonly<Record<string, unknown>>): string { return createHash("sha256").update(`${postgresJsonbText(rule)}|${postgresJsonbText(rate)}|${postgresJsonbText(basis)}`, "utf8").digest("hex"); }
function postgresJsonbText(value: unknown): string { if (value === null) return "null"; if (typeof value === "string") return JSON.stringify(value); if (typeof value === "boolean" || typeof value === "number") return String(value); if (Array.isArray(value)) return `[${value.map(postgresJsonbText).join(", ")}]`; if (typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => Buffer.byteLength(a) - Buffer.byteLength(b) || Buffer.from(a).compare(Buffer.from(b))).map(([key, item]) => `${JSON.stringify(key)}: ${postgresJsonbText(item)}`).join(", ")}}`; throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Tax snapshots contain an unsupported value"); }

function validateCommand(command: TaxCalculationCommand) { const p = command.payload; if (command.actor.planeKey !== "neon" || !/^\d{4}-\d{2}-\d{2}$/.test(p.resolution.taxDate) || !p.source.sourceType.match(/^[a-z][a-z0-9_.-]{1,126}$/) || !p.postedAt || !p.coordinates.companyCodeId || !p.coordinates.ledgerBookId || !p.coordinates.fiscalPeriodId) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Tax command coordinates are incomplete"); decimal(p.amount); const rate = decimal(p.exchangeRate); if (rate.n <= 0n) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Exchange rate must be positive"); if (p.coordinates.currencyCode === p.baseCurrencyCode && !equal(rate, decimal("1"))) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Same-currency tax requires exchange rate 1"); if ((p.quantity === undefined) !== (p.uomCode === undefined)) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Quantity and UOM must be supplied together"); if (p.quantity !== undefined && decimal(p.quantity).n <= 0n) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Tax quantity must be positive"); }
function validateConfiguration(config: ResolvedTaxConfiguration, command: TaxCalculationCommand) { if (!config.rule.sourceHash || !config.rule.revision || config.rule.taxGroupId !== config.taxGroupId) throw new FinanceContractError("FINANCE_IMMUTABLE_EVIDENCE", "Resolved tax rule lacks immutable revision/hash evidence"); for (const rate of config.components) { if (!rate.sourceHash || !rate.revision || rate.rateValue.startsWith("-")) throw new FinanceContractError("FINANCE_IMMUTABLE_EVIDENCE", "Resolved tax rate lacks valid immutable revision/hash evidence"); if (rate.rateKind === "FIXED" && rate.rateCurrency !== command.payload.coordinates.currencyCode) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Fixed tax rate currency does not match the transaction"); if (rate.rateKind === "PER_UNIT" && (rate.rateCurrency !== command.payload.coordinates.currencyCode || rate.rateUomCode !== command.payload.uomCode)) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Per-unit tax rate coordinates do not match the transaction"); } }
function componentBases(amount: Fraction, rates: readonly TaxRateSnapshot[], compound: boolean, mode: "inclusive" | "exclusive", quantity?: string): Fraction[] { let net = amount; if (mode === "inclusive") { let runningA = decimal("1"), runningB = decimal("0"), totalA = decimal("1"), totalB = decimal("0"); for (const rate of rates) { let taxA = decimal("0"), taxB = decimal("0"); if (!zeroTreatment(rate) && rate.rateKind === "PERCENT") { const ratio = divide(decimal(rate.rateValue), decimal("100")); taxA = multiply(compound ? runningA : decimal("1"), ratio); taxB = multiply(compound ? runningB : decimal("0"), ratio); } else if (!zeroTreatment(rate)) taxB = calculateComponent(decimal("0"), rate, quantity); totalA = add(totalA, taxA); totalB = add(totalB, taxB); if (compound) { runningA = add(runningA, taxA); runningB = add(runningB, taxB); } } net = divide(subtract(amount, totalB), totalA); if (net.n <= 0n) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Inclusive fixed taxes cannot equal or exceed the gross amount"); } let running = net; return rates.map(rate => { const base = rate.rateKind === "PER_UNIT" ? decimal(quantity!) : running; if (compound) running = add(running, calculateComponent(base, rate, quantity)); return base; }); }
function calculateComponent(base: Fraction, rate: TaxRateSnapshot, quantity?: string): Fraction { if (zeroTreatment(rate)) return decimal("0"); if (rate.rateKind === "PERCENT") return divide(multiply(base, decimal(rate.rateValue)), decimal("100")); if (rate.rateKind === "FIXED") return decimal(rate.rateValue); if (!quantity) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Per-unit tax requires quantity"); return multiply(decimal(quantity), decimal(rate.rateValue)); }
function zeroTreatment(rate: TaxRateSnapshot) { return rate.taxTreatment === "EXEMPT" || rate.taxTreatment === "ZERO_RATED" || rate.taxTreatment === "NON_TAXABLE"; }
function recoverable(rate: TaxRateSnapshot, amount: bigint): bigint { const magnitude = abs(amount); if (rate.recoverability === "NONE" || rate.recoverability === "CONDITIONAL") return 0n; if (rate.recoverability === "FULL") return magnitude; return magnitude * decimalUnits(rate.recoverabilityPercent ?? "0", 2) / 10000n; }
type Fraction = { n: bigint; d: bigint };
function decimal(value: string): Fraction { if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Invalid decimal"); const negative = value.startsWith("-"); const [whole, fraction = ""] = value.replace("-", "").split("."); return reduce({ n: BigInt(`${whole}${fraction}`) * (negative ? -1n : 1n), d: 10n ** BigInt(fraction.length) }); }
function add(a: Fraction, b: Fraction): Fraction { return reduce({ n: a.n * b.d + b.n * a.d, d: a.d * b.d }); } function subtract(a: Fraction, b: Fraction): Fraction { return add(a, { n: -b.n, d: b.d }); } function multiply(a: Fraction, b: Fraction): Fraction { return reduce({ n: a.n * b.n, d: a.d * b.d }); } function divide(a: Fraction, b: Fraction): Fraction { if (b.n === 0n) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Division by zero"); return reduce({ n: a.n * b.d, d: a.d * b.n }); } function equal(a: Fraction, b: Fraction) { return a.n * b.d === b.n * a.d; }
function reduce(v: Fraction): Fraction { const sign = v.d < 0n ? -1n : 1n; let a = abs(v.n), b = abs(v.d); while (b) [a, b] = [b, a % b]; return { n: v.n / a * sign, d: v.d / a * sign }; }
function toDecimal(value: Fraction, precision = 18): string { const sign = value.n < 0n ? "-" : ""; const n = abs(value.n); const whole = n / value.d; let remainder = n % value.d, fraction = ""; for (let i = 0; i < precision; i += 1) { remainder *= 10n; fraction += String(remainder / value.d); remainder %= value.d; } return `${sign}${whole}.${fraction}`; }
function fixed(value: Fraction): string { return decimalString(roundHalfUp(value, 4), 4); } function roundHalfUp(v: Fraction, scale: number): bigint { const factor = 10n ** BigInt(scale), scaled = abs(v.n) * factor, units = scaled / v.d + (scaled % v.d * 2n >= v.d ? 1n : 0n); return v.n < 0n ? -units : units; }
function sum(values: readonly string[]): string { return decimalString(values.reduce((n, value) => n + decimalUnits(value, 4), 0n), 4); } function negate(value: string): string { return decimalString(-decimalUnits(value, 4), 4); } function abs(value: bigint): bigint { return value < 0n ? -value : value; }
function derivedId(commandId: string, index: number): string { const hex = canonicalFinanceHash({ commandId, index }).slice(0, 32).split(""); hex[12] = "7"; hex[16] = (["8", "9", "a", "b"] as const)[Number.parseInt(hex[16]!, 16) % 4]!; return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`; }

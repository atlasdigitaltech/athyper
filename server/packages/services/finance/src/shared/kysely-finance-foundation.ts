import type { BookPeriodRecord, BookPeriodRepository, BookPeriodTransitionCommand, CurrencyEvidence, CurrencyRoundingDefaults, FinanceActor, FinanceFoundationReader, LedgerBookEvidence, RoundingMethod, RoundingPolicyReader, RoundingResolutionRequest, RoundingRuleCandidate, RoundingSlot, SourceDocumentEvidence } from "@athyper/server-contract-finance";
import { FinanceContractError } from "@athyper/server-contract-finance";
import { sql, type Kysely } from "kysely";

type Database = Record<string, never>;
type Row = Record<string, unknown>;
type Executor = Kysely<Database>;
export interface FinanceTransactionRunner { run<T>(actor: FinanceActor, work: (transaction: Executor) => Promise<T>): Promise<T>; }
export interface FinanceSourceDocumentReader { get(actor: FinanceActor, sourceType: string, sourceId: string, version: number, transaction: Executor): Promise<SourceDocumentEvidence | undefined>; }

/** Reads immutable, hash-chained source snapshots; callers must explicitly allow-list source types. */
export class SnapshotFinanceSourceDocumentReader implements FinanceSourceDocumentReader {
  async get(actor: FinanceActor, sourceType: string, sourceId: string, version: number, transaction: Executor): Promise<SourceDocumentEvidence | undefined> {
    const row=(await sql<Row>`SELECT entity_type,entity_id,source_record_version,payload_hash FROM snapshot.entity_snapshot_identity WHERE tenant_id=${actor.tenantId}::uuid AND entity_type=${sourceType} AND entity_id=${sourceId}::uuid AND source_record_version=${version} ORDER BY chain_seq DESC LIMIT 1`.execute(transaction)).rows[0];
    return row?{sourceType:String(row["entity_type"]),sourceId:String(row["entity_id"]),version:Number(row["source_record_version"]),hash:String(row["payload_hash"])}:undefined;
  }
}

export class KyselyRoundingPolicyReader implements RoundingPolicyReader {
  constructor(private readonly db: Executor, private readonly transactions?: FinanceTransactionRunner) {}

  async listCandidates(request: RoundingResolutionRequest): Promise<readonly RoundingRuleCandidate[]> {
    return this.execute(request, async db => (await sql<Row>`
      SELECT c.id AS context_id,c.company_code_id,c.currency_code,c.slot,
             r.id AS rule_id,r.code AS rule_code,r.method,r.precision_digits,r.rounding_increment,
             concat_ws(':',c.id::text,coalesce(c.updated_at,c.created_at)::text) AS context_revision,
             concat_ws(':',r.id::text,coalesce(r.updated_at,r.status_changed_at,r.created_at)::text) AS rule_revision
        FROM control.rounding_context c
        JOIN control.rounding_rule r ON r.tenant_id=c.tenant_id AND r.id=c.rounding_rule_id
       WHERE c.tenant_id=${request.tenantId}::uuid
         AND r.status='active'
         AND (c.company_code_id IS NULL OR c.company_code_id=${request.companyCodeId ?? null}::uuid)
         AND (c.currency_code IS NULL OR c.currency_code=${request.currencyCode ?? null}::char(3))
         AND (c.slot IS NULL OR c.slot=${request.slot ?? null}::text)
       ORDER BY ((c.company_code_id IS NOT NULL)::int*4+(c.currency_code IS NOT NULL)::int*2+(c.slot IS NOT NULL)::int) DESC,c.id
    `.execute(db)).rows.map(roundingRow));
  }

  async getCurrencyDefaults(request: Pick<RoundingResolutionRequest, "tenantId" | "actor" | "currencyCode">): Promise<CurrencyRoundingDefaults | undefined> {
    if (!request.currencyCode) return undefined;
    return this.execute(request, async db => {
      const row = (await sql<Row>`SELECT code,minor_units,metadata,concat_ws(':',id::text,coalesce(updated_at,status_changed_at,created_at)::text) AS revision FROM shared.currency WHERE code=${request.currencyCode}::char(3) AND status='active'`.execute(db)).rows[0];
      if (!row || row["minor_units"] === null || row["minor_units"] === undefined) return undefined;
      const metadata = object(row["metadata"]);
      return { currencyCode: String(row["code"]).trim(), minorUnits: Number(row["minor_units"]), ...(typeof metadata["rounding_increment"] === "string" ? { roundingIncrement: metadata["rounding_increment"] } : {}), revision: String(row["revision"]) };
    });
  }

  private execute<T>(request: Pick<RoundingResolutionRequest, "tenantId" | "actor">, work: (db: Executor) => Promise<T>): Promise<T> {
    if (!this.transactions) return work(this.db);
    if (!request.actor || request.actor.tenantId !== request.tenantId) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "A matching finance actor is required for tenant-scoped rounding reads");
    return this.transactions.run(request.actor, work);
  }
}

export class KyselyBookPeriodRepository implements BookPeriodRepository<Executor> {
  constructor(private readonly db: Kysely<Database>) {}

  async get(tenantId: string, ledgerBookId: string, fiscalPeriodId: string, transaction: Executor = this.db): Promise<BookPeriodRecord | undefined> {
    const row = (await sql<Row>`
      SELECT gate.id,gate.tenant_id,gate.ledger_book_id,gate.fiscal_period_id,gate.status,gate.version_number AS version,
             period.company_code_id,coalesce(assignment.override_currency_code,book.base_currency_code) AS currency_code
        FROM ledger.book_period_status gate
        JOIN master.fiscal_period period ON period.tenant_id=gate.tenant_id AND period.id=gate.fiscal_period_id
        JOIN master.ledger_book book ON book.tenant_id=gate.tenant_id AND book.id=gate.ledger_book_id
        JOIN master.company_code_book_assignment assignment ON assignment.tenant_id=gate.tenant_id AND assignment.company_code_id=period.company_code_id AND assignment.book_id=gate.ledger_book_id AND assignment.status='active' AND assignment.effective_from<=period.end_date AND (assignment.effective_to IS NULL OR assignment.effective_to>=period.start_date)
       WHERE gate.tenant_id=${tenantId}::uuid AND gate.ledger_book_id=${ledgerBookId}::uuid AND gate.fiscal_period_id=${fiscalPeriodId}::uuid
       ORDER BY assignment.priority DESC,assignment.id LIMIT 1
    `.execute(transaction)).rows[0];
    return row ? periodRow(row) : undefined;
  }

  async transition(command: BookPeriodTransitionCommand, current: BookPeriodRecord, transaction: Executor = this.db): Promise<BookPeriodRecord> {
    const changedAt = new Date().toISOString();
    const result = command.targetStatus === "open"
      ? await sql<Row>`UPDATE ledger.book_period_status SET status='open',version_number=version_number+1,opened_at=coalesce(opened_at,${changedAt}::timestamptz),opened_by=coalesce(opened_by,${command.actor.principalId}::uuid),reopened_at=CASE WHEN status='soft_close' THEN ${changedAt}::timestamptz ELSE reopened_at END,reopened_by=CASE WHEN status='soft_close' THEN ${command.actor.principalId}::uuid ELSE reopened_by END,reopen_reason=CASE WHEN status='soft_close' THEN ${command.reopenReason ?? null} ELSE reopen_reason END,reopen_approval_evidence=CASE WHEN status='soft_close' THEN ${JSON.stringify(command.reopenApprovalEvidence ?? null)}::jsonb ELSE reopen_approval_evidence END,status_changed_at=${changedAt}::timestamptz,status_changed_by=${command.actor.principalId}::uuid,updated_at=${changedAt}::timestamptz,updated_by=${command.actor.principalId}::uuid WHERE tenant_id=${command.actor.tenantId}::uuid AND id=${current.id}::uuid AND version_number=${command.expectedVersion} RETURNING *,version_number AS version`.execute(transaction)
      : command.targetStatus === "soft_close"
        ? await sql<Row>`UPDATE ledger.book_period_status SET status='soft_close',version_number=version_number+1,soft_closed_at=${changedAt}::timestamptz,soft_closed_by=${command.actor.principalId}::uuid,status_changed_at=${changedAt}::timestamptz,status_changed_by=${command.actor.principalId}::uuid,updated_at=${changedAt}::timestamptz,updated_by=${command.actor.principalId}::uuid WHERE tenant_id=${command.actor.tenantId}::uuid AND id=${current.id}::uuid AND version_number=${command.expectedVersion} RETURNING *,version_number AS version`.execute(transaction)
        : await sql<Row>`UPDATE ledger.book_period_status SET status='hard_close',version_number=version_number+1,hard_closed_at=${changedAt}::timestamptz,hard_closed_by=${command.actor.principalId}::uuid,status_changed_at=${changedAt}::timestamptz,status_changed_by=${command.actor.principalId}::uuid,updated_at=${changedAt}::timestamptz,updated_by=${command.actor.principalId}::uuid WHERE tenant_id=${command.actor.tenantId}::uuid AND id=${current.id}::uuid AND version_number=${command.expectedVersion} RETURNING *,version_number AS version`.execute(transaction);
    const row = result.rows[0];
    if (!row) throw new FinanceContractError("FINANCE_EXPECTED_VERSION_CONFLICT", "Book period changed concurrently");
    return { ...current, status: String(row["status"]) as BookPeriodRecord["status"], version: Number(row["version"]) };
  }
}

export class KyselyFinanceFoundationReader implements FinanceFoundationReader {
  constructor(private readonly db: Executor, private readonly transactions: FinanceTransactionRunner, private readonly sources: Readonly<Record<string, FinanceSourceDocumentReader>>) {}
  getLedgerBook(actor: FinanceActor, companyCodeId: string, ledgerBookId: string): Promise<LedgerBookEvidence | undefined> { return this.read(actor, async db => { const row=(await sql<Row>`SELECT book.id,assignment.company_code_id,coalesce(assignment.override_currency_code,book.base_currency_code) AS base_currency_code,concat_ws(':',assignment.id::text,coalesce(assignment.updated_at,assignment.status_changed_at,assignment.created_at)::text) AS assignment_revision FROM master.ledger_book book JOIN master.company_code_book_assignment assignment ON assignment.tenant_id=book.tenant_id AND assignment.book_id=book.id AND assignment.company_code_id=${companyCodeId}::uuid AND assignment.status='active' WHERE book.tenant_id=${actor.tenantId}::uuid AND book.id=${ledgerBookId}::uuid AND book.status='active' LIMIT 1`.execute(db)).rows[0]; return row ? {id:String(row["id"]),companyCodeId:String(row["company_code_id"]),baseCurrencyCode:String(row["base_currency_code"]).trim(),active:true,assignmentRevision:String(row["assignment_revision"])} : undefined; }); }
  getBookPeriod(actor: FinanceActor, ledgerBookId: string, fiscalPeriodId: string): Promise<BookPeriodRecord | undefined> { return this.read(actor, db => new KyselyBookPeriodRepository(db).get(actor.tenantId,ledgerBookId,fiscalPeriodId,db)); }
  getCurrency(actor: FinanceActor, currencyCode: string): Promise<CurrencyEvidence | undefined> { return this.read(actor, async db => { const row=(await sql<Row>`SELECT code,status,minor_units,concat_ws(':',id::text,coalesce(updated_at,status_changed_at,created_at)::text) AS revision FROM shared.currency WHERE code=${currencyCode}::char(3)`.execute(db)).rows[0]; return row ? {currencyCode:String(row["code"]).trim(),active:String(row["status"])==="active",minorUnits:Number(row["minor_units"]),revision:String(row["revision"])} : undefined; }); }
  getSourceDocument(actor: FinanceActor, sourceType: string, sourceId: string, version: number): Promise<SourceDocumentEvidence | undefined> { const source=this.sources[sourceType]; if(!source) throw new FinanceContractError("FINANCE_INVALID_COMMAND",`Unsupported finance source type: ${sourceType}`); return this.read(actor,db=>source.get(actor,sourceType,sourceId,version,db)); }
  private read<T>(actor:FinanceActor,work:(db:Executor)=>Promise<T>):Promise<T>{return this.transactions.run(actor,work);}
}

function roundingRow(row: Row): RoundingRuleCandidate { const contextRevision=String(row["context_revision"]),ruleRevision=String(row["rule_revision"]); return { contextId: String(row["context_id"]), ...(row["company_code_id"] ? { companyCodeId: String(row["company_code_id"]) } : {}), ...(row["currency_code"] ? { currencyCode: String(row["currency_code"]).trim() } : {}), ...(row["slot"] ? { slot: String(row["slot"]) as RoundingSlot } : {}), ruleId: String(row["rule_id"]), ruleCode: String(row["rule_code"]), method: String(row["method"]) as RoundingMethod, ...(row["precision_digits"] !== null && row["precision_digits"] !== undefined ? { precisionDigits: Number(row["precision_digits"]) } : {}), ...(row["rounding_increment"] !== null && row["rounding_increment"] !== undefined ? { roundingIncrement: String(row["rounding_increment"]) } : {}), contextRevision,ruleRevision,revision:`${contextRevision}:${ruleRevision}` }; }
function periodRow(row: Row): BookPeriodRecord { return { id: String(row["id"]), tenantId: String(row["tenant_id"]), companyCodeId: String(row["company_code_id"]), ledgerBookId: String(row["ledger_book_id"]), fiscalPeriodId: String(row["fiscal_period_id"]), currencyCode: String(row["currency_code"]).trim(), status: String(row["status"]) as BookPeriodRecord["status"], version: Number(row["version"]) }; }
function object(value: unknown): Record<string, unknown> { if (typeof value === "string") { try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; } } return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

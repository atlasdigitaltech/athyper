import { sql, type Kysely } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export interface FinanceOutboxEvent {
  id: string;
  tenant_id: string;
  event_type: string | null;
  entity_id: string | null;
  payload: Record<string, unknown>;
  actor_id: string | null;
}

interface SourceJournal {
  id: string; company_code_id: string; book_id: string; fiscal_period_id: string;
  fiscal_year: number; period_number: number; document_date: string; posting_date: string;
  source_doc_type: string; source_doc_id: string | null; transaction_currency: string;
  base_currency: string; description: string | null; posted_by: string;
  status: string; metadata: Record<string, unknown>; derived_from_je_id: string | null; posting_rule_id: string | null;
}

interface SourceLine {
  id: string; line_no: number; gl_account_id: string; account_code: string; account_class: string;
  transaction_currency: string; transaction_debit: string; transaction_credit: string;
  base_currency: string; base_debit: string; base_credit: string; exchange_rate: string | null;
  fx_rate_snapshot: Record<string, unknown> | null; cost_center_id: string | null;
  profit_center_id: string | null; project_id: string | null; site_id: string | null;
  dimension_set_id: string | null; party_type: string | null; party_id: string | null;
  subledger_type: string | null; description: string | null; metadata: Record<string, unknown>;
}

interface PostingRule {
  id: string; rule_code: string; rule_name: string; source_book_id: string; target_book_id: string;
  scope_doc_type: string | null; scope_intent_code: string | null; scope_account_class: string | null;
  scope_subledger_type: string | null; account_strategy: string; account_mapping: Record<string, unknown> | null;
  target_profile_id: string | null; amount_strategy: string; amount_multiplier: string | null;
  amount_formula: Record<string, unknown> | null; recognition_timing: string;
  recognition_lag_periods: number | null; priority: number; version: number; metadata: Record<string, unknown>;
}

interface TargetPeriod {
  id: string; fiscal_year: number; period_number: number; start_date: string; end_date: string;
  fiscal_status: string; book_status: string | null;
}

const SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000000";

function errorParts(error: unknown): { code: string; message: string } {
  const value = error as Error & { code?: string };
  return { code: value.code ?? "CROSS_BOOK_EXECUTION_FAILED", message: value.message || String(error) };
}

function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), { code });
}

function amountMultiplier(rule: PostingRule): number | null {
  if (rule.amount_strategy === "suppress") return null;
  if (rule.amount_strategy === "mirror") return 1;
  if (rule.amount_strategy === "multiply") return Number(rule.amount_multiplier);
  if (rule.amount_strategy === "formula") return Number(rule.amount_formula?.["multiplier"]);
  fail("CROSS_BOOK_AMOUNT_STRATEGY_UNSUPPORTED", `Unsupported amount strategy '${rule.amount_strategy}'.`);
}

function scaled(value: string, multiplier: number): string {
  const result = Math.round((Number(value) * multiplier + Number.EPSILON) * 10_000) / 10_000;
  return result.toFixed(4);
}

function ruleMatches(source: SourceJournal, lines: SourceLine[], rule: PostingRule): boolean {
  if (rule.scope_doc_type && rule.scope_doc_type !== source.source_doc_type) return false;
  if (rule.scope_intent_code && rule.scope_intent_code !== String(source.metadata["intent_code"] ?? "")) return false;
  if (rule.scope_account_class && !lines.some((line) => line.account_class === rule.scope_account_class)) return false;
  if (rule.scope_subledger_type && !lines.some((line) => line.subledger_type === rule.scope_subledger_type)) return false;
  return true;
}

async function loadSource(db: AnyDb, tenantId: string, sourceJournalId: string): Promise<{ source: SourceJournal; lines: SourceLine[] }> {
  const sourceResult = await sql<SourceJournal>`
    SELECT id, company_code_id, book_id, fiscal_period_id, fiscal_year, period_number,
           document_date::text, posting_date::text, source_doc_type, source_doc_id,
           transaction_currency, base_currency, description, posted_by, status, metadata,
           derived_from_je_id, posting_rule_id
      FROM document.journal_entry
     WHERE tenant_id = ${tenantId}::uuid AND id = ${sourceJournalId}::uuid
  `.execute(db);
  const source = sourceResult.rows[0];
  if (!source) fail("CROSS_BOOK_SOURCE_NOT_FOUND", "Source journal was not found.");
  if (source.derived_from_je_id || source.posting_rule_id) fail("CROSS_BOOK_LOOP_PREVENTED", "Derived journals cannot initiate another cross-book derivation.");
  if (source.status !== "posted" || !source.posted_by) fail("CROSS_BOOK_SOURCE_INVALID", "Source journal is not posted.");

  const lineResult = await sql<SourceLine>`
    SELECT jl.id, jl.line_no, jl.gl_account_id, ga.code AS account_code, ga.account_class,
           jl.transaction_currency, jl.transaction_debit::text, jl.transaction_credit::text,
           jl.base_currency, jl.base_debit::text, jl.base_credit::text, jl.exchange_rate::text,
           jl.fx_rate_snapshot, jl.cost_center_id, jl.profit_center_id, jl.project_id, jl.site_id,
           jl.dimension_set_id, jl.party_type, jl.party_id, jl.subledger_type, jl.description, jl.metadata
      FROM document.journal_line jl
      JOIN master.gl_account ga ON ga.tenant_id = jl.tenant_id AND ga.id = jl.gl_account_id
     WHERE jl.tenant_id = ${tenantId}::uuid AND jl.journal_entry_id = ${sourceJournalId}::uuid
     ORDER BY jl.line_no
  `.execute(db);
  if (lineResult.rows.length < 2) fail("CROSS_BOOK_SOURCE_LINES_INVALID", "Source journal has fewer than two lines.");
  return { source, lines: lineResult.rows };
}

async function loadRules(db: AnyDb, tenantId: string, source: SourceJournal, ruleIds?: string[]): Promise<PostingRule[]> {
  const ids = ruleIds ?? [];
  const result = await sql<PostingRule>`
    SELECT id, rule_code, rule_name, source_book_id, target_book_id,
           scope_doc_type, scope_intent_code, scope_account_class, scope_subledger_type,
           account_strategy, account_mapping, target_profile_id, amount_strategy,
           amount_multiplier::text, amount_formula, recognition_timing, recognition_lag_periods,
           priority, version, metadata
      FROM control.book_posting_rule
     WHERE tenant_id = ${tenantId}::uuid AND company_code_id = ${source.company_code_id}::uuid
       AND source_book_id = ${source.book_id}::uuid AND status = 'active'
       AND (${sql.val(ids)}::uuid[] = '{}'::uuid[] OR id = ANY(${sql.val(ids)}::uuid[]))
     ORDER BY priority, rule_code
  `.execute(db);
  return result.rows;
}

async function resolveTargetPeriod(db: AnyDb, tenantId: string, source: SourceJournal, rule: PostingRule): Promise<TargetPeriod> {
  const lag = rule.recognition_timing === "deferred" ? Number(rule.recognition_lag_periods ?? 0) : 0;
  const result = lag > 0
    ? await sql<TargetPeriod>`
        SELECT fp.id, fp.fiscal_year, fp.period_number, fp.start_date::text, fp.end_date::text,
               fp.status AS fiscal_status, bps.status AS book_status
          FROM master.fiscal_period source_fp
          JOIN LATERAL (
            SELECT candidate.* FROM master.fiscal_period candidate
             WHERE candidate.tenant_id = source_fp.tenant_id
               AND candidate.company_code_id = source_fp.company_code_id
               AND candidate.start_date > source_fp.start_date
               AND candidate.period_type = 'regular'
             ORDER BY candidate.start_date
             OFFSET ${lag - 1} LIMIT 1
          ) fp ON true
          LEFT JOIN governance.book_period_status bps
            ON bps.tenant_id = fp.tenant_id AND bps.company_code_id = fp.company_code_id
           AND bps.book_id = ${rule.target_book_id}::uuid
           AND bps.fiscal_year = fp.fiscal_year AND bps.period_number = fp.period_number
         WHERE source_fp.tenant_id = ${tenantId}::uuid AND source_fp.id = ${source.fiscal_period_id}::uuid
      `.execute(db)
    : await sql<TargetPeriod>`
        SELECT fp.id, fp.fiscal_year, fp.period_number, fp.start_date::text, fp.end_date::text,
               fp.status AS fiscal_status, bps.status AS book_status
          FROM master.fiscal_period fp
          LEFT JOIN governance.book_period_status bps
            ON bps.tenant_id = fp.tenant_id AND bps.company_code_id = fp.company_code_id
           AND bps.book_id = ${rule.target_book_id}::uuid
           AND bps.fiscal_year = fp.fiscal_year AND bps.period_number = fp.period_number
         WHERE fp.tenant_id = ${tenantId}::uuid AND fp.id = ${source.fiscal_period_id}::uuid
      `.execute(db);
  const period = result.rows[0];
  if (!period) fail("CROSS_BOOK_TARGET_PERIOD_NOT_FOUND", `Target period for rule '${rule.rule_code}' is not generated.`);
  return period;
}

async function resolveTargetAccount(
  db: AnyDb, tenantId: string, source: SourceJournal, line: SourceLine,
  rule: PostingRule, effectiveDate: string,
): Promise<string> {
  if (rule.account_strategy === "same") return line.gl_account_id;
  if (rule.account_strategy === "map") {
    const root = (rule.account_mapping?.["accounts"] ?? rule.account_mapping) as Record<string, unknown> | null;
    const targetRef = root?.[line.gl_account_id] ?? root?.[line.account_code];
    if (typeof targetRef !== "string" || !targetRef.trim()) {
      fail("CROSS_BOOK_ACCOUNT_MAPPING_MISSING", `Rule '${rule.rule_code}' has no mapping for account '${line.account_code}'.`);
    }
    const result = await sql<{ id: string }>`
      SELECT id FROM master.gl_account
       WHERE tenant_id = ${tenantId}::uuid AND (id::text = ${targetRef} OR code = ${targetRef})
         AND status = 'active' LIMIT 1
    `.execute(db);
    if (!result.rows[0]) fail("CROSS_BOOK_TARGET_ACCOUNT_NOT_FOUND", `Mapped target account '${targetRef}' was not found.`);
    return result.rows[0].id;
  }
  if (rule.account_strategy === "profile") {
    const roleCode = String(line.metadata["posting_role_code"] ?? "");
    if (!roleCode) fail("CROSS_BOOK_POSTING_ROLE_MISSING", `Source line ${line.line_no} has no posting_role_code metadata.`);
    const result = await sql<{ account_id: string | null }>`
      SELECT control.resolve_posting_role_account(
        ${tenantId}::uuid, ${roleCode}, ${source.company_code_id}::uuid,
        (SELECT code FROM master.ledger_book WHERE tenant_id = ${tenantId}::uuid AND id = ${rule.target_book_id}::uuid),
        ${effectiveDate}::date
      ) AS account_id
    `.execute(db);
    if (!result.rows[0]?.account_id) fail("CROSS_BOOK_PROFILE_ACCOUNT_UNRESOLVED", `Posting role '${roleCode}' did not resolve in the target book.`);
    return result.rows[0].account_id;
  }
  fail("CROSS_BOOK_ACCOUNT_STRATEGY_UNSUPPORTED", `Unsupported account strategy '${rule.account_strategy}'.`);
}

async function markPending(db: AnyDb, tenantId: string, source: SourceJournal, rule: PostingRule, actorId: string, period: TargetPeriod, key: string, reason: string): Promise<void> {
  await sql`
    INSERT INTO document.book_posting_derivation
      (tenant_id, company_code_id, source_journal_id, posting_rule_id, posting_rule_version,
       idempotency_key, status, evidence_payload, created_by)
    VALUES (${tenantId}::uuid, ${source.company_code_id}::uuid, ${source.id}::uuid, ${rule.id}::uuid,
            ${rule.version}, ${key}, 'pending', ${JSON.stringify({
              reason, recognitionTiming: rule.recognition_timing, targetBookId: rule.target_book_id,
              targetFiscalYear: period.fiscal_year, targetPeriodNumber: period.period_number,
            })}::jsonb, ${actorId}::uuid)
    ON CONFLICT (tenant_id, source_journal_id, posting_rule_id, posting_rule_version)
    DO UPDATE SET evidence_payload = EXCLUDED.evidence_payload, updated_at = now(), updated_by = ${actorId}::uuid
      WHERE document.book_posting_derivation.status IN ('pending','failed')
  `.execute(db);
}

async function executeRule(db: AnyDb, tenantId: string, source: SourceJournal, lines: SourceLine[], rule: PostingRule, actorId: string, allowOnClose: boolean): Promise<void> {
  const key = `cross-book:${source.id}:${rule.id}:v${rule.version}`;
  const period = await resolveTargetPeriod(db, tenantId, source, rule);
  if (rule.recognition_timing === "on_close" && !allowOnClose) {
    await markPending(db, tenantId, source, rule, actorId, period, key, "awaiting_source_period_close");
    return;
  }
  if (!["open", "soft_close"].includes(period.fiscal_status) || !["open", "soft_close"].includes(period.book_status ?? "")) {
    await markPending(db, tenantId, source, rule, actorId, period, key, "awaiting_target_period_open");
    return;
  }

  const multiplier = amountMultiplier(rule);
  if (multiplier === null) {
    await sql`
      INSERT INTO document.book_posting_derivation
        (tenant_id, company_code_id, source_journal_id, posting_rule_id, posting_rule_version,
         idempotency_key, status, attempt_count, last_attempt_at, completed_at, evidence_payload, created_by)
      VALUES (${tenantId}::uuid, ${source.company_code_id}::uuid, ${source.id}::uuid, ${rule.id}::uuid,
              ${rule.version}, ${key}, 'suppressed', 1, now(), now(),
              ${JSON.stringify({ amountStrategy: "suppress", targetBookId: rule.target_book_id })}::jsonb, ${actorId}::uuid)
      ON CONFLICT (tenant_id, source_journal_id, posting_rule_id, posting_rule_version)
      DO UPDATE SET status = 'suppressed', completed_at = now(), error_code = NULL, error_message = NULL,
                    updated_at = now(), updated_by = ${actorId}::uuid
    `.execute(db);
    return;
  }
  if (!Number.isFinite(multiplier) || multiplier <= 0) fail("CROSS_BOOK_MULTIPLIER_INVALID", `Rule '${rule.rule_code}' requires a positive multiplier.`);

  const executeInTransaction = async (trx: AnyDb) => {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`.execute(trx);
    const existing = await sql<{ status: string; target_journal_id: string | null }>`
      SELECT status, target_journal_id FROM document.book_posting_derivation
       WHERE tenant_id = ${tenantId}::uuid AND idempotency_key = ${key}
       FOR UPDATE
    `.execute(trx);
    if (existing.rows[0]?.status === "completed" && existing.rows[0].target_journal_id) return;

    await sql`
      INSERT INTO document.book_posting_derivation
        (tenant_id, company_code_id, source_journal_id, posting_rule_id, posting_rule_version,
         idempotency_key, status, attempt_count, last_attempt_at, evidence_payload, created_by)
      VALUES (${tenantId}::uuid, ${source.company_code_id}::uuid, ${source.id}::uuid, ${rule.id}::uuid,
              ${rule.version}, ${key}, 'processing', 1, now(), '{}'::jsonb, ${actorId}::uuid)
      ON CONFLICT (tenant_id, source_journal_id, posting_rule_id, posting_rule_version)
      DO UPDATE SET status = 'processing', attempt_count = document.book_posting_derivation.attempt_count + 1,
                    last_attempt_at = now(), error_code = NULL, error_message = NULL,
                    updated_at = now(), updated_by = ${actorId}::uuid
    `.execute(trx);

    const targetJournalIdResult = await sql<{ id: string }>`SELECT shared.uuidv7() AS id`.execute(trx);
    const targetJournalId = targetJournalIdResult.rows[0]!.id;
    const postingDate = rule.recognition_timing === "deferred" ? period.start_date : source.posting_date;
    await sql`
      INSERT INTO document.journal_entry
        (id, tenant_id, je_number, company_code_id, book_id, fiscal_period_id, fiscal_year, period_number,
         document_date, posting_date, source_doc_type, source_doc_id, transaction_currency, base_currency,
         description, status, derived_from_je_id, posting_rule_id, book_idempotency_key, metadata, created_by)
      VALUES (${targetJournalId}::uuid, ${tenantId}::uuid, '', ${source.company_code_id}::uuid,
              ${rule.target_book_id}::uuid, ${period.id}::uuid, ${period.fiscal_year}, ${period.period_number},
              ${source.document_date}::date, ${postingDate}::date, 'cross_book', ${source.id}::uuid,
              ${source.transaction_currency}, ${source.base_currency},
              ${`Cross-book ${rule.rule_code}: ${source.description ?? source.id}`}, 'draft',
              ${source.id}::uuid, ${rule.id}::uuid, ${key},
              ${JSON.stringify({ lineageRootJournalId: source.id, lineageDepth: 1, postingRuleCode: rule.rule_code, postingRuleVersion: rule.version })}::jsonb,
              ${actorId}::uuid)
    `.execute(trx);

    for (const line of lines) {
      const accountId = await resolveTargetAccount(trx, tenantId, source, line, rule, postingDate);
      await sql`
        INSERT INTO document.journal_line
          (tenant_id, journal_entry_id, line_no, gl_account_id,
           transaction_currency, transaction_debit, transaction_credit,
           base_currency, base_debit, base_credit, exchange_rate, fx_rate_snapshot,
           cost_center_id, profit_center_id, project_id, site_id, dimension_set_id,
           party_type, party_id, subledger_type, description, source_doc_line_id, metadata, created_by)
        VALUES (${tenantId}::uuid, ${targetJournalId}::uuid, ${line.line_no}, ${accountId}::uuid,
                ${line.transaction_currency}, ${scaled(line.transaction_debit, multiplier)}, ${scaled(line.transaction_credit, multiplier)},
                ${line.base_currency}, ${scaled(line.base_debit, multiplier)}, ${scaled(line.base_credit, multiplier)},
                ${line.exchange_rate}::numeric, ${JSON.stringify(line.fx_rate_snapshot)}::jsonb,
                ${line.cost_center_id}::uuid, ${line.profit_center_id}::uuid, ${line.project_id}::uuid, ${line.site_id}::uuid,
                ${line.dimension_set_id}::uuid, ${line.party_type}, ${line.party_id}::uuid, ${line.subledger_type},
                ${line.description}, ${line.id}::uuid,
                ${JSON.stringify({ ...line.metadata, sourceJournalLineId: line.id, crossBookMultiplier: multiplier })}::jsonb,
                ${actorId}::uuid)
      `.execute(trx);
    }

    await sql`UPDATE document.journal_entry SET status = 'created', updated_by = ${actorId}::uuid WHERE tenant_id = ${tenantId}::uuid AND id = ${targetJournalId}::uuid`.execute(trx);
    await sql`UPDATE document.journal_entry SET status = 'posted', posted_by = ${actorId}::uuid, updated_by = ${actorId}::uuid WHERE tenant_id = ${tenantId}::uuid AND id = ${targetJournalId}::uuid`.execute(trx);
    await sql`
      UPDATE document.book_posting_derivation
         SET status = 'completed', target_journal_id = ${targetJournalId}::uuid, completed_at = now(),
             evidence_payload = ${JSON.stringify({
               sourceBookId: source.book_id, targetBookId: rule.target_book_id,
               accountStrategy: rule.account_strategy, amountStrategy: rule.amount_strategy,
               multiplier, lineCount: lines.length, targetFiscalYear: period.fiscal_year,
               targetPeriodNumber: period.period_number, lineageDepth: 1,
             })}::jsonb, updated_at = now(), updated_by = ${actorId}::uuid
       WHERE tenant_id = ${tenantId}::uuid AND idempotency_key = ${key}
    `.execute(trx);
  };
  if (db.isTransaction) await executeInTransaction(db);
  else await db.transaction().execute(executeInTransaction);
}

export async function executeCrossBookPosting(db: AnyDb, input: {
  tenantId: string; sourceJournalId: string; actorId?: string | null;
  allowOnClose?: boolean; ruleIds?: string[];
}): Promise<{ matchedRules: number; failures: number }> {
  const actorId = input.actorId || SYSTEM_ACTOR_ID;
  const { source, lines } = await loadSource(db, input.tenantId, input.sourceJournalId);
  const rules = (await loadRules(db, input.tenantId, source, input.ruleIds)).filter((rule) => ruleMatches(source, lines, rule));
  const failures: Error[] = [];
  for (const rule of rules) {
    try {
      await executeRule(db, input.tenantId, source, lines, rule, actorId, Boolean(input.allowOnClose));
    } catch (error) {
      const failure = errorParts(error);
      const key = `cross-book:${source.id}:${rule.id}:v${rule.version}`;
      await sql`
        INSERT INTO document.book_posting_derivation
          (tenant_id, company_code_id, source_journal_id, posting_rule_id, posting_rule_version,
           idempotency_key, status, attempt_count, last_attempt_at, error_code, error_message, created_by)
        VALUES (${input.tenantId}::uuid, ${source.company_code_id}::uuid, ${source.id}::uuid, ${rule.id}::uuid,
                ${rule.version}, ${key}, 'failed', 1, now(), ${failure.code}, ${failure.message.slice(0, 2000)}, ${actorId}::uuid)
        ON CONFLICT (tenant_id, source_journal_id, posting_rule_id, posting_rule_version)
        DO UPDATE SET status = 'failed', attempt_count = document.book_posting_derivation.attempt_count + 1,
                      last_attempt_at = now(), error_code = ${failure.code}, error_message = ${failure.message.slice(0, 2000)},
                      updated_at = now(), updated_by = ${actorId}::uuid
      `.execute(db);
      failures.push(Object.assign(new Error(failure.message), { code: failure.code }));
    }
  }
  if (failures.length > 0) throw Object.assign(new Error(`${failures.length} cross-book rule(s) failed.`), { code: "CROSS_BOOK_PARTIAL_FAILURE", causes: failures });
  return { matchedRules: rules.length, failures: 0 };
}

async function handlePeriodEvent(db: AnyDb, event: FinanceOutboxEvent): Promise<void> {
  const companyCodeId = String(event.payload["companyCodeId"] ?? "");
  const fiscalYear = Number(event.payload["fiscalYear"]);
  const periodNumber = Number(event.payload["periodNumber"]);
  const targetStatus = String(event.payload["targetStatus"] ?? "");
  const selectedBookIds = Array.isArray(event.payload["bookIds"])
    ? event.payload["bookIds"].map(String).filter(Boolean)
    : [];
  if (!companyCodeId || !fiscalYear || Number.isNaN(periodNumber)) fail("CROSS_BOOK_PERIOD_EVENT_INVALID", "Period event scope is incomplete.");

  if (targetStatus === "open") {
    const pending = await sql<{ source_journal_id: string; posting_rule_id: string }>`
      SELECT d.source_journal_id, d.posting_rule_id
        FROM document.book_posting_derivation d
        JOIN control.book_posting_rule rule ON rule.tenant_id = d.tenant_id AND rule.id = d.posting_rule_id
       WHERE d.tenant_id = ${event.tenant_id}::uuid AND d.company_code_id = ${companyCodeId}::uuid AND d.status = 'pending'
         AND (evidence_payload->>'targetFiscalYear')::int = ${fiscalYear}
         AND (evidence_payload->>'targetPeriodNumber')::int = ${periodNumber}
         AND (${sql.val(selectedBookIds)}::uuid[] = '{}'::uuid[] OR rule.target_book_id = ANY(${sql.val(selectedBookIds)}::uuid[]))
    `.execute(db);
    for (const row of pending.rows) await executeCrossBookPosting(db, {
      tenantId: event.tenant_id, sourceJournalId: row.source_journal_id,
      actorId: event.actor_id, ruleIds: [row.posting_rule_id],
    });
  }

  if (["soft_close", "hard_close"].includes(targetStatus)) {
    const sources = await sql<{ id: string }>`
      SELECT id FROM document.journal_entry
       WHERE tenant_id = ${event.tenant_id}::uuid AND company_code_id = ${companyCodeId}::uuid
         AND fiscal_year = ${fiscalYear} AND period_number = ${periodNumber}
         AND status = 'posted' AND derived_from_je_id IS NULL AND posting_rule_id IS NULL
         AND (${sql.val(selectedBookIds)}::uuid[] = '{}'::uuid[] OR book_id = ANY(${sql.val(selectedBookIds)}::uuid[]))
    `.execute(db);
    for (const row of sources.rows) await executeCrossBookPosting(db, {
      tenantId: event.tenant_id, sourceJournalId: row.id, actorId: event.actor_id, allowOnClose: true,
    });
  }
}

export function createFinanceOutboxHandler(db: AnyDb, logger?: { info?(event: string, fields?: Record<string, unknown>): void }): { handle(event: FinanceOutboxEvent): Promise<void> } {
  return {
    async handle(event) {
      if (event.event_type === "finance.journal.cross_book_requested") {
        const sourceJournalId = String(event.payload["sourceJournalId"] ?? event.entity_id ?? "");
        await executeCrossBookPosting(db, { tenantId: event.tenant_id, sourceJournalId, actorId: event.actor_id });
        return;
      }
      if (event.event_type === "finance.period.status_changed") {
        await handlePeriodEvent(db, event);
        return;
      }
      logger?.info?.("finance_outbox_event_ignored", { eventType: event.event_type, eventId: event.id });
    },
  };
}

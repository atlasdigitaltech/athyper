/**
 * Journal Routes.
 *
 * GET   /finance/journals
 * GET   /finance/journals/:jeId/posting-trace
 * POST  /finance/journals/:jeId/submit
 * POST  /finance/journals
 * POST  /finance/journals/:jeId/reverse
 * PATCH /finance/journals/:jeId
 */

import type { RequestHandler, Router } from "express";
import { sql, type Kysely } from "kysely";
import {
  parseScopeParams,
  resolveCompanyIds,
  enforceWriteRateLimit,
  type FinanceRouteDeps,
} from "./finance.route.js";
import {
  verifyBearer,
  resolveTenantId,
  resolvePrincipalIdOrNull,
  isUuid,
  extractOrgHeaders,
  emitOutboxEvent,
  SYSTEM_PRINCIPAL_UUID,
} from "@athyper/svc-shared";
import { positiveFxRateInput, resolveFxRate } from "@athyper/svc-shared";
import { randomUUID } from "node:crypto";
import { ApproverResolverService, createWorkflowEngine } from "@athyper/svc-workflow";
import { PolicyEngine } from "@athyper/svc-policy";

type AnyDb = Kysely<any>;

const DEFAULT_AUTO_JE_TEMPLATE_CODE = "je_auto_post";

type ManualJournalLineInput = {
  gl_account_code?: unknown;
  debit?: unknown;
  credit?: unknown;
  item_text?: unknown;
  description?: unknown;
  cost_center_id?: unknown;
  profit_center_id?: unknown;
  project_id?: unknown;
  site_id?: unknown;
  party_type?: unknown;
  party_id?: unknown;
  subledger_type?: unknown;
  reference?: unknown;
};

type ManualJournalLineReferenceInput = {
  ref_type: string;
  ref_doc_type: string;
  ref_doc_id: string;
  ref_doc_line_id: string | null;
  ref_doc_number: string | null;
  ref_doc_label: string | null;
  ref_doc_line_label: string | null;
};

function asNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeCurrency(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function lineDescription(line: ManualJournalLineInput): string | null {
  const value = line.description ?? line.item_text;
  return value == null ? null : String(value);
}

function parseLineReference(value: unknown): ManualJournalLineReferenceInput | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const refType = String(row["ref_type"] ?? "").trim();
  const refDocType = String(row["ref_doc_type"] ?? "").trim();
  const refDocId = String(row["ref_doc_id"] ?? "").trim();
  const refDocLineId = row["ref_doc_line_id"] == null ? null : String(row["ref_doc_line_id"]).trim();
  if (!refType || !refDocType || !isUuid(refDocId)) return null;
  if (refDocLineId && !isUuid(refDocLineId)) return null;
  return {
    ref_type:           refType,
    ref_doc_type:       refDocType,
    ref_doc_id:         refDocId,
    ref_doc_line_id:    refDocLineId || null,
    ref_doc_number:     row["ref_doc_number"] == null ? null : String(row["ref_doc_number"]).trim() || null,
    ref_doc_label:      row["ref_doc_label"] == null ? null : String(row["ref_doc_label"]).trim() || null,
    ref_doc_line_label: row["ref_doc_line_label"] == null ? null : String(row["ref_doc_line_label"]).trim() || null,
  };
}

async function resolveManualBook(db: AnyDb, tenantId: string, companyCodeId: string): Promise<string | null> {
  const row = await db
    .selectFrom("master.company_code_book_assignment as ba")
    .innerJoin("master.ledger_book as lb", (join) =>
      join.onRef("lb.id", "=", "ba.book_id")
        .onRef("lb.tenant_id", "=", "ba.tenant_id"),
    )
    .select(["ba.book_id as bookId"])
    .where("ba.tenant_id", "=", tenantId)
    .where("ba.company_code_id", "=", companyCodeId)
    .where("ba.status", "=", "active")
    .where("lb.status", "=", "active")
    .where("lb.category", "=", "statutory")
    .where("lb.is_manual_je_allowed", "=", true)
    .orderBy("ba.priority", "asc")
    .executeTakeFirst() as { bookId: string } | undefined;

  return row?.bookId ?? null;
}

async function resolveFiscalPeriod(
  db: AnyDb,
  tenantId: string,
  companyCodeId: string,
  fiscalYear: number,
  periodNumber: number,
): Promise<{ id: string; fiscalYear: number; periodNumber: number } | null> {
  const row = await db
    .selectFrom("master.fiscal_period as fp")
    .select([
      "fp.id",
      "fp.fiscal_year as fiscalYear",
      "fp.period_number as periodNumber",
    ])
    .where("fp.tenant_id", "=", tenantId)
    .where("fp.company_code_id", "=", companyCodeId)
    .where("fp.fiscal_year", "=", fiscalYear)
    .where("fp.period_number", "=", periodNumber)
    .executeTakeFirst() as { id: string; fiscalYear: number; periodNumber: number } | undefined;

  return row ?? null;
}

export async function resolveFiscalPeriodByDate(
  db: AnyDb,
  tenantId: string,
  companyCodeId: string,
  postingDate: string,
): Promise<{ id: string; fiscalYear: number; periodNumber: number } | null> {
  const row = await db
    .selectFrom("master.fiscal_period as fp")
    .select([
      "fp.id",
      "fp.fiscal_year as fiscalYear",
      "fp.period_number as periodNumber",
    ])
    .where("fp.tenant_id", "=", tenantId)
    .where("fp.company_code_id", "=", companyCodeId)
    .where("fp.start_date", "<=", postingDate)
    .where("fp.end_date", ">=", postingDate)
    .orderBy("fp.start_date", "desc")
    .executeTakeFirst() as { id: string; fiscalYear: number; periodNumber: number } | undefined;

  return row ?? null;
}

export async function nextJeNumber(db: AnyDb, tenantId: string, companyCodeId: string, fiscalYear: number): Promise<string> {
  const countRow = await db
    .selectFrom("document.journal_entry as je")
    .select(db.fn.countAll().as("cnt"))
    .where("je.tenant_id", "=", tenantId)
    .where("je.company_code_id", "=", companyCodeId)
    .where("je.fiscal_year", "=", fiscalYear)
    .executeTakeFirst() as { cnt: string | number } | undefined;

  const seq = parseInt(String(countRow?.cnt ?? "0"), 10) + 1;
  return `JE-${fiscalYear}-${String(seq).padStart(5, "0")}`;
}

// Reusable journal-entry reverse logic. Used by both the dedicated route
// (POST /finance/journals/:jeId/reverse) and the generic action dispatcher
// (POST /api/records/journal_entry/:id/action/reverse_document). Centralised
// here so the dispatcher's naive copy/reverse path doesn't violate accounting
// invariants (je_number uniqueness, debit/credit swap, status transitions).
//
// Caller is responsible for auth + tenant/principal resolution. This function
// does NOT verify bearer or extract org headers.
//
// Returns { status, body } so the caller can shape the HTTP response.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LoggerLike = { error?: (m: string, x?: any) => void } | undefined;

export async function handleReverseJournalEntry(
  db: AnyDb,
  tenantId: string,
  jeId: string,
  actorId: string,
  body: Record<string, unknown>,
  logger?: LoggerLike,
): Promise<{ status: number; body: Record<string, unknown> }> {
  try {
    const source = await db
      .selectFrom("document.journal_entry as je")
      .select([
        "je.id",
        "je.je_number as jeNumber",
        "je.status",
        "je.company_code_id as companyCodeId",
        "je.book_id as bookId",
        "je.transaction_currency as transactionCurrency",
        "je.base_currency as baseCurrency",
        "je.reversed_by_id as reversedBy",
      ])
      .where("je.id", "=", jeId)
      .where("je.tenant_id", "=", tenantId)
      .executeTakeFirst() as Record<string, unknown> | undefined;

    if (!source) return { status: 404, body: { error: "JOURNAL_NOT_FOUND" } };
    if (source["status"] !== "posted") {
      return { status: 409, body: { error: "INVALID_JE_STATUS", message: `Only posted journal entries can be reversed (current: '${source["status"]}')` } };
    }
    if (source["reversedBy"]) {
      return { status: 409, body: { error: "ALREADY_REVERSED", reversed_by: source["reversedBy"] } };
    }

    const sourceLines = await db
      .selectFrom("document.journal_line as jl")
      .select([
        "jl.line_no as lineNo",
        "jl.gl_account_id as glAccountId",
        "jl.transaction_currency as transactionCurrency",
        "jl.transaction_debit as transactionDebit",
        "jl.transaction_credit as transactionCredit",
        "jl.base_currency as baseCurrency",
        "jl.base_debit as baseDebit",
        "jl.base_credit as baseCredit",
        "jl.exchange_rate as exchangeRate",
        "jl.cost_center_id as costCenterId",
        "jl.profit_center_id as profitCenterId",
        "jl.project_id as projectId",
        "jl.site_id as siteId",
        "jl.party_type as partyType",
        "jl.party_id as partyId",
        "jl.subledger_type as subledgerType",
        "jl.description",
        "jl.source_doc_line_id as sourceDocLineId",
      ])
      .where("jl.journal_entry_id", "=", jeId)
      .where("jl.tenant_id", "=", tenantId)
      .orderBy("jl.line_no", "asc")
      .execute() as Array<Record<string, unknown>>;

    if (sourceLines.length < 2) {
      return { status: 422, body: { error: "NO_LINES", message: "Source JE has no lines to reverse" } };
    }

    const postingDate = body["posting_date"] ? String(body["posting_date"]) : new Date().toISOString().slice(0, 10);
    const period = await resolveFiscalPeriodByDate(db, tenantId, String(source["companyCodeId"]), postingDate);
    if (!period) {
      return { status: 400, body: { error: "PERIOD_NOT_FOUND", message: `No fiscal period found for reversal date ${postingDate}` } };
    }

    const revJeId = randomUUID();
    const revJeNumber = await nextJeNumber(db, tenantId, String(source["companyCodeId"]), period.fiscalYear);
    const description = body["description"] ? String(body["description"]) : `Reversal of ${String(source["jeNumber"])}`;

    await db.transaction().execute(async (trx) => {
      await trx
        .insertInto("document.journal_entry" as never)
        .values({
          id: revJeId,
          tenant_id: tenantId,
          je_number: revJeNumber,
          company_code_id: source["companyCodeId"],
          book_id: source["bookId"],
          fiscal_period_id: period.id,
          fiscal_year: period.fiscalYear,
          period_number: period.periodNumber,
          document_date: postingDate,
          posting_date: postingDate,
          source_doc_type: "reversal",
          source_doc_id: jeId,
          transaction_currency: source["transactionCurrency"],
          base_currency: source["baseCurrency"],
          description,
          is_reversal: true,
          reversal_of_id: jeId,
          status: "draft",
          total_debit: "0",
          total_credit: "0",
          line_count: 0,
          created_by: actorId,
        } as never)
        .execute();

      for (const line of sourceLines) {
        await trx
          .insertInto("document.journal_line" as never)
          .values({
            id: randomUUID(),
            tenant_id: tenantId,
            journal_entry_id: revJeId,
            line_no: line["lineNo"],
            gl_account_id: line["glAccountId"],
            transaction_currency: line["transactionCurrency"],
            transaction_debit: String(line["transactionCredit"] ?? "0"),
            transaction_credit: String(line["transactionDebit"] ?? "0"),
            base_currency: line["baseCurrency"],
            base_debit: String(line["baseCredit"] ?? "0"),
            base_credit: String(line["baseDebit"] ?? "0"),
            exchange_rate: line["exchangeRate"] ?? null,
            cost_center_id: line["costCenterId"] ?? null,
            profit_center_id: line["profitCenterId"] ?? null,
            project_id: line["projectId"] ?? null,
            site_id: line["siteId"] ?? null,
            party_type: line["partyType"] ?? null,
            party_id: line["partyId"] ?? null,
            subledger_type: line["subledgerType"] ?? null,
            description: line["description"] ? `Reversal - ${String(line["description"])}` : description,
            source_doc_line_id: line["sourceDocLineId"] ?? null,
            created_by: actorId,
          } as never)
          .execute();
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (trx.updateTable("document.journal_entry") as any)
        .set({ status: "created", updated_by: actorId })
        .where("id", "=", revJeId)
        .where("tenant_id", "=", tenantId)
        .execute();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (trx.updateTable("document.journal_entry") as any)
        .set({ status: "posted", posted_by: actorId, updated_by: actorId })
        .where("id", "=", revJeId)
        .where("tenant_id", "=", tenantId)
        .execute();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (trx.updateTable("document.journal_entry") as any)
        .set({ status: "reversed", reversed_by_id: revJeId, updated_by: actorId })
        .where("id", "=", jeId)
        .where("tenant_id", "=", tenantId)
        .execute();

      await emitOutboxEvent(trx, {
        tenantId,
        topic: "search",
        eventType: "journal_entry.created",
        entityType: "journal_entry",
        entityId: revJeId,
        actorId,
        payload: { reversal_of_id: jeId },
      });
      await emitOutboxEvent(trx, {
        tenantId,
        topic: "search",
        eventType: "journal_entry.updated",
        entityType: "journal_entry",
        entityId: jeId,
        actorId,
        payload: { status: "reversed", reversed_by_id: revJeId },
      });
    });

    return {
      status: 201,
      body: {
        reversal_journal_entry_id: revJeId,
        je_number: revJeNumber,
        status: "posted",
        reversal_of: jeId,
      },
    };
  } catch (err) {
    logger?.error?.("finance_journal_reverse_error", { err: String(err) });
    throw err;
  }
}

async function resolveGlAccounts(
  db: AnyDb,
  tenantId: string,
  lines: ManualJournalLineInput[],
): Promise<Map<string, string>> {
  const accountCodes = [...new Set(lines.map((l) => String(l.gl_account_code ?? "").trim()).filter(Boolean))];
  if (lines.some((line) => !String(line.gl_account_code ?? "").trim())) {
    throw Object.assign(new Error("Every journal line must have a GL account code"), { code: "ACCOUNT_REQUIRED" });
  }

  const accounts = await db
    .selectFrom("master.gl_account as ga")
    .select(["ga.id", "ga.code"])
    .where("ga.tenant_id", "=", tenantId)
    .where("ga.code", "in", accountCodes)
    .execute() as Array<{ id: string; code: string }>;

  const accountMap = new Map(accounts.map((a) => [a.code, a.id]));
  for (const code of accountCodes) {
    if (!accountMap.has(code)) {
      throw Object.assign(new Error(`GL account '${code}' not found`), { code: "ACCOUNT_NOT_FOUND" });
    }
  }
  return accountMap;
}

function validateLines(lines: ManualJournalLineInput[]): { totalDebit: number; totalCredit: number } {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw Object.assign(new Error("At least 2 journal lines are required"), { code: "INVALID_LINES" });
  }

  let totalDebit = 0;
  let totalCredit = 0;
  for (const line of lines) {
    const debit = asNumber(line.debit);
    const credit = asNumber(line.credit);
    if (debit < 0 || credit < 0 || (debit > 0 && credit > 0) || (debit === 0 && credit === 0)) {
      throw Object.assign(
        new Error("Each journal line must have exactly one positive debit or credit amount"),
        { code: "INVALID_LINE_POLARITY" },
      );
    }
    totalDebit += debit;
    totalCredit += credit;
  }

  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw Object.assign(
      new Error(`Journal entry is unbalanced: debit ${totalDebit.toFixed(2)} != credit ${totalCredit.toFixed(2)}`),
      { code: "UNBALANCED" },
    );
  }
  if (totalDebit <= 0) {
    throw Object.assign(new Error("Journal entry must have non-zero amounts"), { code: "ZERO_AMOUNT" });
  }

  return { totalDebit, totalCredit };
}

async function insertJournalLineReference(
  trx: AnyDb,
  params: {
    tenantId: string;
    journalLineId: string;
    actorId: string;
    currencyCode: string;
    baseAmount: number;
    reference: ManualJournalLineReferenceInput | null;
    lineDescription: string | null;
  },
): Promise<void> {
  if (!params.reference) return;

  await trx
    .insertInto("document.journal_line_reference" as never)
    .values({
      id:                 randomUUID(),
      tenant_id:          params.tenantId,
      journal_line_id:    params.journalLineId,
      ref_type:           params.reference.ref_type,
      ref_doc_type:       params.reference.ref_doc_type,
      ref_doc_id:         params.reference.ref_doc_id,
      ref_doc_line_id:    params.reference.ref_doc_line_id,
      ref_doc_number:     params.reference.ref_doc_number ?? params.reference.ref_doc_label,
      allocated_amount:   Math.abs(params.baseAmount).toFixed(4),
      currency_code:      params.currencyCode,
      base_amount:        Math.abs(params.baseAmount).toFixed(4),
      description:        params.lineDescription,
      metadata:           {
        ref_doc_label:      params.reference.ref_doc_label,
        ref_doc_line_label: params.reference.ref_doc_line_label,
      },
      created_by:        params.actorId,
    } as never)
    .execute();
}

async function getJournalLineTotals(
  db: AnyDb,
  tenantId: string,
  journalEntryId: string,
): Promise<{ lineCount: number; totalDebit: number; totalCredit: number }> {
  const row = await db
    .selectFrom("document.journal_line as jl")
    .select([
      sql<number>`COUNT(*)::int`.as("lineCount"),
      sql<string>`COALESCE(SUM(jl.base_debit), 0)`.as("totalDebit"),
      sql<string>`COALESCE(SUM(jl.base_credit), 0)`.as("totalCredit"),
    ])
    .where("jl.tenant_id", "=", tenantId)
    .where("jl.journal_entry_id", "=", journalEntryId)
    .executeTakeFirst() as { lineCount?: number | string; totalDebit?: number | string; totalCredit?: number | string } | undefined;

  return {
    lineCount:   Number(row?.lineCount ?? 0),
    totalDebit:  Number(row?.totalDebit ?? 0),
    totalCredit: Number(row?.totalCredit ?? 0),
  };
}

async function resolveExistingJournalExchangeRate(
  db: AnyDb,
  tenantId: string,
  journalEntryId: string,
): Promise<number | null> {
  const result = await sql<{ exchangeRate: string | null }>`
    SELECT jl.exchange_rate::text AS "exchangeRate"
      FROM document.journal_line jl
     WHERE jl.tenant_id = ${tenantId}
       AND jl.journal_entry_id = ${journalEntryId}
       AND jl.exchange_rate IS NOT NULL
     ORDER BY jl.line_no
     LIMIT 1
  `.execute(db);

  const n = Number(result.rows[0]?.exchangeRate);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function resolveJournalExchangeRate(
  db: AnyDb,
  params: {
    tenantId: string;
    transactionCurrency: string;
    baseCurrency: string;
    asOf: string;
    providedRate?: unknown;
  },
): Promise<number | null> {
  const transactionCurrency = normalizeCurrency(params.transactionCurrency);
  const baseCurrency = normalizeCurrency(params.baseCurrency);
  if (transactionCurrency === baseCurrency) return 1;

  const providedRate = positiveFxRateInput(params.providedRate);
  if (providedRate !== null) return providedRate;

  const fxRate = await resolveFxRate(db, {
    tenantId:      params.tenantId,
    fromCurrency:  transactionCurrency,
    toCurrency:    baseCurrency,
    asOf:          params.asOf,
    rateType:      "SPOT",
  });

  return fxRate.rate;
}

function sendValidationError(res: Parameters<RequestHandler>[1], err: unknown): boolean {
  const e = err as Error & { code?: string };
  if (!e.code) return false;
  const status = e.code === "ACCOUNT_NOT_FOUND" || e.code === "ACCOUNT_REQUIRED" ? 400 : 422;
  res.status(status).json({ error: e.code, message: e.message });
  return true;
}

async function autoApproveAndPostJournalEntry(
  db: AnyDb,
  tenantId: string,
  journalEntryId: string,
  actorId: string,
): Promise<Record<string, unknown>> {
  return db.transaction().execute(async (trx) => {
    const approved = await (trx.updateTable("document.journal_entry") as any)
      .set({ status: "approved", updated_by: actorId })
      .where("id", "=", journalEntryId)
      .where("tenant_id", "=", tenantId)
      .where("status", "=", "created")
      .returning(["id", "je_number", "status"] as never)
      .executeTakeFirst() as Record<string, unknown> | undefined;

    if (!approved) {
      throw Object.assign(
        new Error("Journal entry could not be auto-approved from its current status."),
        { code: "AUTO_APPROVE_FAILED" },
      );
    }

    const posted = await (trx.updateTable("document.journal_entry") as any)
      .set({ status: "posted", posted_by: actorId, updated_by: actorId })
      .where("id", "=", journalEntryId)
      .where("tenant_id", "=", tenantId)
      .where("status", "=", "approved")
      .returningAll()
      .executeTakeFirst() as Record<string, unknown> | undefined;

    if (!posted) {
      throw Object.assign(
        new Error("Journal entry could not be auto-posted after approval."),
        { code: "AUTO_POST_FAILED" },
      );
    }

    await emitOutboxEvent(trx, {
      tenantId,
      topic: "search",
      eventType: "journal_entry.updated",
      entityType: "journal_entry",
      entityId: journalEntryId,
      actorId,
      payload: { status: "posted" },
    });

    return posted;
  });
}

export function createJournalRoutes(router: Router, deps: FinanceRouteDeps): Router {
  const { db, auth, logger, cache } = deps;
  const approverResolver = new ApproverResolverService({
    db,
    logger: logger
      ? {
          warn: (event, fields) => {
            if (logger.info) logger.info(event, fields);
            else logger.error(event, fields);
          },
          error: (event, fields) => logger.error(event, fields),
        }
      : undefined,
  });

  router.get("/finance/journals", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg = (req.headers["x-org"] as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ items: [], total: 0 }); return; }

      const parsed = parseScopeParams(req.query as Record<string, unknown>);
      if ("error" in parsed) { res.status(400).json({ error: parsed.error }); return; }

      const companies = await resolveCompanyIds(db, tenantId, parsed);
      if (companies.length === 0) { res.json({ items: [], total: 0 }); return; }
      const companyIds = companies.map((c) => c.company_code_id);

      const status = (req.query["status"] as string | undefined) ?? null;
      const sourceDocType = (req.query["source_doc_type"] as string | undefined)?.toLowerCase() ?? null;
      const search = (req.query["search"] as string | undefined) ?? null;
      const limit = Math.min(parseInt(String(req.query["limit"] ?? "50"), 10), 200);
      const offset = Math.max(parseInt(String(req.query["offset"] ?? "0"), 10), 0);

      let q = db
        .selectFrom("document.journal_entry as je")
        .select([
          "je.id",
          "je.je_number as jeNumber",
          "je.description",
          "je.status",
          "je.source_doc_type as sourceDocType",
          "je.source_doc_id as sourceDocId",
          "je.posting_date as postingDate",
          "je.fiscal_year as fiscalYear",
          "je.period_number as periodNumber",
          "je.transaction_currency as currencyCode",
          "je.total_debit as totalDebit",
          "je.total_credit as totalCredit",
          "je.posted_at as postedAt",
          "je.line_count as lineCount",
        ])
        .where("je.tenant_id", "=", tenantId)
        .where("je.company_code_id", "in", companyIds)
        .where("je.fiscal_year", "=", parsed.fiscalYear);

      if (parsed.period !== null) q = q.where("je.period_number", "=", parsed.period) as typeof q;
      if (parsed.bookId) q = q.where("je.book_id", "=", parsed.bookId) as typeof q;
      if (parsed.transactionCurrency) q = q.where("je.transaction_currency", "=", parsed.transactionCurrency) as typeof q;
      if (status) q = q.where("je.status", "=", status) as typeof q;
      if (sourceDocType) q = q.where("je.source_doc_type", "=", sourceDocType) as typeof q;
      if (search) {
        q = q.where((eb) =>
          eb.or([
            eb("je.je_number", "like", `%${search}%`),
            eb("je.description", "like", `%${search}%`),
          ]),
        ) as typeof q;
      }

      const countRow = await q.clearSelect().select(db.fn.countAll().as("cnt")).executeTakeFirst() as { cnt: string | number } | undefined;
      const rows = await q
        .orderBy("je.posting_date", "desc")
        .orderBy("je.je_number", "desc")
        .limit(limit)
        .offset(offset)
        .execute() as Array<Record<string, unknown>>;

      res.json({
        items: rows.map((r) => ({
          id: r["id"],
          jeNumber: r["jeNumber"],
          description: r["description"] ?? null,
          status: r["status"],
          sourceDocType: r["sourceDocType"] ?? null,
          sourceDocId: r["sourceDocId"] ?? null,
          postingDate: r["postingDate"] ?? null,
          fiscalYear: r["fiscalYear"],
          periodNumber: r["periodNumber"],
          currencyCode: r["currencyCode"],
          totalDebit: parseFloat(String(r["totalDebit"] ?? "0")),
          totalCredit: parseFloat(String(r["totalCredit"] ?? "0")),
          postedAt: r["postedAt"] ?? null,
          lineCount: Number(r["lineCount"] ?? 0),
        })),
        total: parseInt(String(countRow?.cnt ?? "0"), 10),
        limit,
        offset,
      });
    } catch (err) {
      logger?.error("finance_journals_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  router.get("/finance/fx-rate", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "TENANT_NOT_FOUND" }); return; }

      const fromCurrency = normalizeCurrency(req.query["from"]);
      const toCurrency = normalizeCurrency(req.query["to"]);
      const asOf = String(req.query["asOf"] ?? req.query["as_of"] ?? new Date().toISOString().slice(0, 10));
      const rateType = String(req.query["rateType"] ?? req.query["rate_type"] ?? "SPOT");

      if (!fromCurrency || !toCurrency) {
        res.status(400).json({ error: "MISSING_REQUIRED_FIELDS", message: "from and to currencies are required" });
        return;
      }

      const fxRate = await resolveFxRate(db, {
        tenantId,
        fromCurrency,
        toCurrency,
        asOf,
        rateType,
      });

      if (fxRate.rate === null) {
        res.status(404).json({
          error: "FX_RATE_NOT_FOUND",
          message: `No active ${fxRate.rateType} exchange rate found for ${fromCurrency} to ${toCurrency} as of ${fxRate.asOf}`,
          ...fxRate,
        });
        return;
      }

      res.json(fxRate);
    } catch (err) {
      logger?.error("finance_fx_rate_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  router.get("/finance/journals/:jeId/posting-trace", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      const jeId = (req.params["jeId"] as string | undefined)?.trim();
      if (!tenantId || !jeId || !isUuid(jeId)) {
        res.status(404).json({ error: "NOT_FOUND" });
        return;
      }

      const je = await db
        .selectFrom("document.journal_entry as je")
        .select([
          "je.id",
          "je.je_number as jeNumber",
          "je.description",
          "je.status",
          "je.source_doc_type as sourceDocType",
          "je.source_doc_id as sourceDocId",
          "je.posting_date as postingDate",
          "je.fiscal_year as fiscalYear",
          "je.period_number as periodNumber",
          "je.transaction_currency as currencyCode",
          "je.total_debit as totalDebit",
          "je.total_credit as totalCredit",
          "je.posted_at as postedAt",
          "je.reversed_by_id as reversedBy",
          "je.reversal_of_id as reversalOf",
        ])
        .where("je.id", "=", jeId)
        .where("je.tenant_id", "=", tenantId)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!je) { res.status(404).json({ error: "JOURNAL_NOT_FOUND" }); return; }

      const lines = await db
        .selectFrom("document.journal_line as jl")
        .innerJoin("master.gl_account as ga", (join) =>
          join.onRef("ga.id", "=", "jl.gl_account_id")
            .onRef("ga.tenant_id", "=", "jl.tenant_id"),
        )
        .leftJoin("master.cost_center as cc", (join) =>
          join.onRef("cc.id", "=", "jl.cost_center_id")
            .onRef("cc.tenant_id", "=", "jl.tenant_id"),
        )
        .leftJoin("master.profit_center as pc", (join) =>
          join.onRef("pc.id", "=", "jl.profit_center_id")
            .onRef("pc.tenant_id", "=", "jl.tenant_id"),
        )
        .leftJoin("master.project as pj", (join) =>
          join.onRef("pj.id", "=", "jl.project_id")
            .onRef("pj.tenant_id", "=", "jl.tenant_id"),
        )
        .select([
          "jl.id",
          "jl.line_no as lineNumber",
          "ga.code as accountCode",
          "ga.name as accountName",
          "ga.account_class as accountClass",
          "jl.base_debit as debitAmount",
          "jl.base_credit as creditAmount",
          "jl.transaction_debit as txnDebit",
          "jl.transaction_credit as txnCredit",
          "jl.transaction_currency as txnCurrency",
          "cc.code as costCenterCode",
          "cc.name as costCenterName",
          "pc.code as profitCenterCode",
          "pc.name as profitCenterName",
          "pj.code as projectCode",
          "pj.name as projectName",
          "jl.description",
        ])
        .where("jl.journal_entry_id", "=", jeId)
        .where("jl.tenant_id", "=", tenantId)
        .orderBy("jl.line_no", "asc")
        .execute() as Array<Record<string, unknown>>;

      res.json({
        je: {
          id: je["id"],
          jeNumber: je["jeNumber"],
          description: je["description"] ?? null,
          status: je["status"],
          sourceDocType: je["sourceDocType"] ?? null,
          sourceDocId: je["sourceDocId"] ?? null,
          postingDate: je["postingDate"] ?? null,
          fiscalYear: je["fiscalYear"],
          periodNumber: je["periodNumber"],
          currencyCode: je["currencyCode"],
          totalDebit: parseFloat(String(je["totalDebit"] ?? "0")),
          totalCredit: parseFloat(String(je["totalCredit"] ?? "0")),
          postedAt: je["postedAt"] ?? null,
          reversedBy: je["reversedBy"] ?? null,
          reversalOf: je["reversalOf"] ?? null,
        },
        lines: lines.map((l) => ({
          id: l["id"],
          lineNumber: Number(l["lineNumber"]),
          accountCode: l["accountCode"],
          accountName: l["accountName"],
          accountClass: l["accountClass"],
          debitAmount: parseFloat(String(l["debitAmount"] ?? "0")),
          creditAmount: parseFloat(String(l["creditAmount"] ?? "0")),
          txnDebit: parseFloat(String(l["txnDebit"] ?? "0")),
          txnCredit: parseFloat(String(l["txnCredit"] ?? "0")),
          txnCurrency: l["txnCurrency"],
          costCenterCode: l["costCenterCode"] ?? null,
          costCenterName: l["costCenterName"] ?? null,
          profitCenterCode: l["profitCenterCode"] ?? null,
          profitCenterName: l["profitCenterName"] ?? null,
          projectCode: l["projectCode"] ?? null,
          projectName: l["projectName"] ?? null,
          description: l["description"] ?? null,
        })),
      });
    } catch (err) {
      logger?.error("finance_posting_trace_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  router.post("/finance/journals", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "TENANT_NOT_FOUND" }); return; }
      const sub = String(claims["sub"] ?? "unknown");
      if (!await enforceWriteRateLimit(cache, res, `ratelimit:finance:journals:create:${tenantId}:${sub}`, 20, 60)) return;

      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId);
      const actorId = principalId ?? SYSTEM_PRINCIPAL_UUID;
      const body = req.body as Record<string, unknown>;

      const companyCodeIdRef = String(body["company_code_id"] ?? "").trim();
      const companyCodeRef = String(body["company_code"] ?? "").trim();
      const companyRef = companyCodeIdRef || companyCodeRef;
      const fiscalYear = Number(body["fiscal_year"]);
      const periodNumber = Number(body["period_number"]);
      const postingDate = String(body["posting_date"] ?? "").trim();
      const documentDate = String(body["document_date"] ?? postingDate).trim();
      const currencyCode = normalizeCurrency(body["currency_code"]);
      const description = body["description"] != null ? String(body["description"]) : null;
      const typedLines = body["lines"] as ManualJournalLineInput[];

      if (!companyRef || !fiscalYear || !periodNumber || !postingDate || !currencyCode) {
        res.status(400).json({
          error: "MISSING_REQUIRED_FIELDS",
          message: "company_code_id or company_code, fiscal_year, period_number, posting_date, currency_code are required",
        });
        return;
      }

      const { totalDebit, totalCredit } = validateLines(typedLines);

      const company = await db
        .selectFrom("master.company_code as cc")
        .select(["cc.id", "cc.code", "cc.functional_currency as baseCurrency"])
        .where("cc.tenant_id", "=", tenantId)
        .where(isUuid(companyRef) ? "cc.id" : "cc.code", "=", companyRef)
        .executeTakeFirst() as { id: string; code: string; baseCurrency: string } | undefined;

      if (!company) {
        const fieldLabel = isUuid(companyRef) ? "Company code id" : "Company code";
        res.status(400).json({ error: "COMPANY_NOT_FOUND", message: `${fieldLabel} '${companyRef}' not found` });
        return;
      }
      const companyCode = company.code;

      const bookId = await resolveManualBook(db, tenantId, company.id);
      if (!bookId) {
        res.status(422).json({ error: "NO_LEDGER_BOOK", message: "No active statutory manual JE ledger book is assigned to this company" });
        return;
      }

      const period = await resolveFiscalPeriod(db, tenantId, company.id, fiscalYear, periodNumber);
      if (!period) {
        res.status(400).json({ error: "PERIOD_NOT_FOUND", message: `Fiscal period ${fiscalYear}/${periodNumber} not found for company '${companyCode}'` });
        return;
      }

      const exchangeRate = await resolveJournalExchangeRate(db, {
        tenantId,
        transactionCurrency: currencyCode,
        baseCurrency:        company.baseCurrency,
        asOf:                postingDate,
        providedRate:        body["exchange_rate"],
      });
      if (exchangeRate === null) {
        res.status(400).json({
          error: "EXCHANGE_RATE_REQUIRED",
          message: `No active SPOT exchange rate found for ${currencyCode} to ${company.baseCurrency} as of ${postingDate}`,
        });
        return;
      }

      const accountMap = await resolveGlAccounts(db, tenantId, typedLines);
      const jeId = randomUUID();
      const jeNumber = await nextJeNumber(db, tenantId, company.id, fiscalYear);

      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto("document.journal_entry" as never)
          .values({
            id: jeId,
            tenant_id: tenantId,
            je_number: jeNumber,
            company_code_id: company.id,
            book_id: bookId,
            fiscal_period_id: period.id,
            fiscal_year: period.fiscalYear,
            period_number: period.periodNumber,
            document_date: documentDate,
            posting_date: postingDate,
            source_doc_type: "manual",
            transaction_currency: currencyCode,
            base_currency: company.baseCurrency,
            description,
            status: "draft",
            total_debit: "0",
            total_credit: "0",
            line_count: 0,
            created_by: actorId,
          } as never)
          .execute();

        for (let i = 0; i < typedLines.length; i++) {
          const line = typedLines[i]!;
          const debit = asNumber(line.debit);
          const credit = asNumber(line.credit);
          const lineId = randomUUID();
          const descriptionText = lineDescription(line);
          await trx
            .insertInto("document.journal_line" as never)
            .values({
              id: lineId,
              tenant_id: tenantId,
              journal_entry_id: jeId,
              line_no: i + 1,
              gl_account_id: accountMap.get(String(line.gl_account_code ?? "").trim())!,
              transaction_currency: currencyCode,
              transaction_debit: debit.toFixed(4),
              transaction_credit: credit.toFixed(4),
              base_currency: company.baseCurrency,
              base_debit: (debit * exchangeRate).toFixed(4),
              base_credit: (credit * exchangeRate).toFixed(4),
              exchange_rate: currencyCode === company.baseCurrency ? null : exchangeRate.toFixed(10),
              cost_center_id: line.cost_center_id ?? null,
              profit_center_id: line.profit_center_id ?? null,
              project_id: line.project_id ?? null,
              site_id: line.site_id ?? null,
              party_type: line.party_type ?? null,
              party_id: line.party_id ?? null,
              subledger_type: line.subledger_type ?? null,
              description: descriptionText,
              created_by: actorId,
            } as never)
            .execute();

          await insertJournalLineReference(trx, {
            tenantId,
            journalLineId: lineId,
            actorId,
            currencyCode,
            baseAmount: Math.max(debit, credit) * exchangeRate,
            reference: parseLineReference(line.reference),
            lineDescription: descriptionText,
          });
        }

        await (trx.updateTable("document.journal_entry") as any)
          .set({
            status:       "created",
            total_debit:  totalDebit.toFixed(4),
            total_credit: totalCredit.toFixed(4),
            line_count:   typedLines.length,
            updated_by:   actorId,
          })
          .where("id", "=", jeId)
          .where("tenant_id", "=", tenantId)
          .execute();

        await emitOutboxEvent(trx, {
          tenantId,
          topic: "search",
          eventType: "journal_entry.created",
          entityType: "journal_entry",
          entityId: jeId,
          actorId,
        });
      });

      logger?.info?.("finance_journals_created", { jeId, jeNumber, tenantId });
      res.status(201).json({ journal_entry_id: jeId, je_number: jeNumber, status: "created", total_debit: totalDebit });
    } catch (err) {
      if (sendValidationError(res, err)) return;
      logger?.error("finance_journals_create_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  router.patch("/finance/journals/:jeId", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const jeId = (req.params["jeId"] as string | undefined)?.trim();
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId || !jeId || !isUuid(jeId)) {
        res.status(400).json({ error: "INVALID_ID", message: "jeId must be a UUID" });
        return;
      }
      const sub = String(claims["sub"] ?? "unknown");
      if (!await enforceWriteRateLimit(cache, res, `ratelimit:finance:journals:submit:${tenantId}:${sub}`, 20, 60)) return;

      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId);
      const actorId = principalId ?? SYSTEM_PRINCIPAL_UUID;

      const jeRow = await db
        .selectFrom("document.journal_entry as je")
        .select([
          "je.id",
          "je.je_number as jeNumber",
          "je.status",
          "je.company_code_id as companyCodeId",
          "je.transaction_currency as transactionCurrency",
          "je.base_currency as baseCurrency",
          "je.posting_date as postingDate",
        ])
        .where("je.id", "=", jeId)
        .where("je.tenant_id", "=", tenantId)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!jeRow) { res.status(404).json({ error: "JOURNAL_NOT_FOUND" }); return; }
      const editableStatuses = new Set(["draft", "created"]);
      const currentStatus = String(jeRow["status"] ?? "");
      if (!editableStatuses.has(currentStatus)) {
        res.status(409).json({
          error: "INVALID_JE_STATUS",
          message: `Only draft or ready journal entries can be edited (current: '${currentStatus}')`,
          current_status: currentStatus,
        });
        return;
      }

      const body = req.body as Record<string, unknown>;
      const headerUpdates: Record<string, unknown> = { updated_by: actorId };
      if (body["description"] !== undefined) headerUpdates["description"] = body["description"] == null ? null : String(body["description"]);
      if (body["document_date"] !== undefined) headerUpdates["document_date"] = String(body["document_date"]);

      if (body["posting_date"] !== undefined) {
        const postingDate = String(body["posting_date"]);
        const period = await resolveFiscalPeriodByDate(db, tenantId, String(jeRow["companyCodeId"]), postingDate);
        if (!period) {
          res.status(400).json({ error: "PERIOD_NOT_FOUND", message: `No fiscal period found for posting_date ${postingDate}` });
          return;
        }
        headerUpdates["posting_date"] = postingDate;
        headerUpdates["fiscal_period_id"] = period.id;
        headerUpdates["fiscal_year"] = period.fiscalYear;
        headerUpdates["period_number"] = period.periodNumber;
      }

      const newLines = body["lines"];
      let typedLines: ManualJournalLineInput[] = [];
      let accountMap: Map<string, string> | null = null;
      const currentCurrencyCode = normalizeCurrency(jeRow["transactionCurrency"]);
      const requestedCurrencyCode = body["currency_code"] !== undefined
        ? normalizeCurrency(body["currency_code"])
        : body["transaction_currency"] !== undefined
          ? normalizeCurrency(body["transaction_currency"])
          : currentCurrencyCode;
      if (!/^[A-Z]{3}$/.test(requestedCurrencyCode)) {
        res.status(400).json({ error: "INVALID_CURRENCY_CODE", message: "currency_code must be a 3-letter ISO code" });
        return;
      }
      const currencyChanged = requestedCurrencyCode !== currentCurrencyCode;
      if (currencyChanged && !Array.isArray(newLines)) {
        res.status(400).json({
          error: "LINES_REQUIRED_FOR_CURRENCY_CHANGE",
          message: "Changing journal currency requires saving the journal lines in the same request.",
        });
        return;
      }
      if (currencyChanged) headerUpdates["transaction_currency"] = requestedCurrencyCode;

      const currencyCode = requestedCurrencyCode;
      const baseCurrency = normalizeCurrency(jeRow["baseCurrency"]);
      const exchangeRateAsOf = String(body["posting_date"] ?? jeRow["postingDate"] ?? "");
      let exchangeRate = await resolveJournalExchangeRate(db, {
        tenantId,
        transactionCurrency: currencyCode,
        baseCurrency,
        asOf:         exchangeRateAsOf,
        providedRate: body["exchange_rate"],
      });

      if (Array.isArray(newLines)) {
        typedLines = newLines as ManualJournalLineInput[];
        validateLines(typedLines);
        if (exchangeRate === null && body["exchange_rate"] === undefined && body["posting_date"] === undefined && !currencyChanged && currencyCode !== baseCurrency) {
          exchangeRate = await resolveExistingJournalExchangeRate(db, tenantId, jeId);
        }
        if (exchangeRate === null) {
          res.status(400).json({
            error: "EXCHANGE_RATE_REQUIRED",
            message: `No active SPOT exchange rate found for ${currencyCode} to ${baseCurrency} as of ${exchangeRateAsOf || "today"}`,
          });
          return;
        }
        accountMap = await resolveGlAccounts(db, tenantId, typedLines);
      }

      await db.transaction().execute(async (trx) => {
        await (trx.updateTable("document.journal_entry") as any)
          .set(headerUpdates)
          .where("id", "=", jeId)
          .where("tenant_id", "=", tenantId)
          .execute();

        if (accountMap) {
          const resolvedExchangeRate = exchangeRate;
          if (resolvedExchangeRate === null) {
            throw Object.assign(new Error("Exchange rate was not resolved for journal lines"), { code: "EXCHANGE_RATE_REQUIRED" });
          }

          if (currentStatus === "created") {
            await (trx.updateTable("document.journal_entry") as any)
              .set({ status: "draft", updated_by: actorId })
              .where("id", "=", jeId)
              .where("tenant_id", "=", tenantId)
              .execute();
          }

          await sql`
            DELETE FROM document.journal_line_reference
             WHERE tenant_id = ${tenantId}
               AND journal_line_id IN (
                 SELECT id
                   FROM document.journal_line
                  WHERE tenant_id = ${tenantId}
                    AND journal_entry_id = ${jeId}
               )
          `.execute(trx);

          await (trx.deleteFrom("document.journal_line") as any)
            .where("journal_entry_id", "=", jeId)
            .where("tenant_id", "=", tenantId)
            .execute();

          for (let i = 0; i < typedLines.length; i++) {
            const line = typedLines[i]!;
            const debit = asNumber(line.debit);
            const credit = asNumber(line.credit);
            const lineId = randomUUID();
            const descriptionText = lineDescription(line);
            await trx
              .insertInto("document.journal_line" as never)
              .values({
                id: lineId,
                tenant_id: tenantId,
                journal_entry_id: jeId,
                line_no: i + 1,
                gl_account_id: accountMap.get(String(line.gl_account_code ?? "").trim())!,
                transaction_currency: currencyCode,
                transaction_debit: debit.toFixed(4),
                transaction_credit: credit.toFixed(4),
                base_currency: baseCurrency,
                base_debit: (debit * resolvedExchangeRate).toFixed(4),
                base_credit: (credit * resolvedExchangeRate).toFixed(4),
                exchange_rate: currencyCode === baseCurrency ? null : resolvedExchangeRate.toFixed(10),
                cost_center_id: line.cost_center_id ?? null,
                profit_center_id: line.profit_center_id ?? null,
                project_id: line.project_id ?? null,
                site_id: line.site_id ?? null,
                party_type: line.party_type ?? null,
                party_id: line.party_id ?? null,
                subledger_type: line.subledger_type ?? null,
                description: descriptionText,
                created_by: actorId,
              } as never)
              .execute();

            await insertJournalLineReference(trx, {
              tenantId,
              journalLineId: lineId,
              actorId,
              currencyCode,
              baseAmount: Math.max(debit, credit) * resolvedExchangeRate,
              reference: parseLineReference(line.reference),
              lineDescription: descriptionText,
            });
          }

          const lineTotals = await getJournalLineTotals(trx, tenantId, jeId);
          await (trx.updateTable("document.journal_entry") as any)
            .set({
              ...(currentStatus === "created" ? { status: "created" } : {}),
              total_debit:  lineTotals.totalDebit.toFixed(4),
              total_credit: lineTotals.totalCredit.toFixed(4),
              line_count:   lineTotals.lineCount,
              updated_by:   actorId,
            })
            .where("id", "=", jeId)
            .where("tenant_id", "=", tenantId)
            .execute();
        }

        await emitOutboxEvent(trx, {
          tenantId,
          topic: "search",
          eventType: "journal_entry.updated",
          entityType: "journal_entry",
          entityId: jeId,
          actorId,
        });
      });

      res.json({ journal_entry_id: jeId, je_number: String(jeRow["jeNumber"]), status: currentStatus });
    } catch (err) {
      if (sendValidationError(res, err)) return;
      logger?.error("finance_journal_update_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  router.post("/finance/journals/:jeId/submit", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const jeId = (req.params["jeId"] as string | undefined)?.trim();
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId || !jeId || !isUuid(jeId)) {
        res.status(400).json({ error: "INVALID_ID", message: "jeId must be a UUID" });
        return;
      }
      const sub = String(claims["sub"] ?? "unknown");
      if (!await enforceWriteRateLimit(cache, res, `ratelimit:finance:journals:reverse:${tenantId}:${sub}`, 10, 60)) return;

      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId);
      if (!principalId) {
        res.status(403).json({ error: "PRINCIPAL_NOT_FOUND", message: "no principal bound to this session" });
        return;
      }

      const je = await db
        .selectFrom("document.journal_entry as je")
        .select([
          "je.id",
          "je.je_number as jeNumber",
          "je.status",
          "je.company_code_id as companyCodeId",
          "je.book_id as bookId",
          "je.fiscal_year as fiscalYear",
          "je.period_number as periodNumber",
          "je.total_debit as totalDebit",
          "je.total_credit as totalCredit",
          "je.line_count as lineCount",
          "je.transaction_currency as transactionCurrency",
          "je.source_doc_type as sourceDocType",
          "je.posting_date as postingDate",
          "je.description",
          "je.prior_period_flag as priorPeriodFlag",
          "je.is_reversal as isReversal",
        ])
        .where("je.id", "=", jeId)
        .where("je.tenant_id", "=", tenantId)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!je) { res.status(404).json({ error: "JOURNAL_NOT_FOUND" }); return; }
      const currentStatus = String(je["status"] ?? "");
      if (currentStatus !== "created" && currentStatus !== "draft") {
        res.status(409).json({
          error: "INVALID_JE_STATUS",
          message: `Journal entry must be in draft or ready status to submit (current: '${currentStatus}')`,
          current_status: currentStatus,
        });
        return;
      }

      const lineTotals = await getJournalLineTotals(db, tenantId, jeId);
      if (lineTotals.lineCount < 2) {
        res.status(422).json({
          error: "INVALID_LINES",
          message: "At least 2 journal lines are required before submitting.",
        });
        return;
      }
      if (lineTotals.totalDebit <= 0 || Math.abs(lineTotals.totalDebit - lineTotals.totalCredit) > 0.005) {
        res.status(422).json({
          error: "UNBALANCED",
          message: `Journal entry must be balanced before submitting. Debit ${lineTotals.totalDebit.toFixed(2)} != Credit ${lineTotals.totalCredit.toFixed(2)}.`,
        });
        return;
      }

      if (currentStatus === "draft") {
        await (db.updateTable("document.journal_entry" as never) as any)
          .set({
            status:            "created",
            status_changed_at: new Date(),
            status_changed_by: principalId,
            total_debit:       lineTotals.totalDebit.toFixed(4),
            total_credit:      lineTotals.totalCredit.toFixed(4),
            line_count:        lineTotals.lineCount,
            updated_by:        principalId,
          } as never)
          .where("id" as never, "=", jeId)
          .where("tenant_id" as never, "=", tenantId)
          .execute();
        je["status"] = "created";
      } else {
        await (db.updateTable("document.journal_entry" as never) as any)
          .set({
            total_debit:  lineTotals.totalDebit.toFixed(4),
            total_credit: lineTotals.totalCredit.toFixed(4),
            line_count:   lineTotals.lineCount,
            updated_by:   principalId,
          } as never)
          .where("id" as never, "=", jeId)
          .where("tenant_id" as never, "=", tenantId)
          .execute();
      }
      je["totalDebit"] = lineTotals.totalDebit;
      je["totalCredit"] = lineTotals.totalCredit;
      je["lineCount"] = lineTotals.lineCount;

      const ccRow = await db
        .selectFrom("master.company_code as cc")
        .select(["cc.legal_entity_id as legalEntityId"])
        .where("cc.id", "=", je["companyCodeId"] as string)
        .where("cc.tenant_id", "=", tenantId)
        .executeTakeFirst() as { legalEntityId?: string } | undefined;

      const evaluationPayload: Record<string, unknown> = {
        je_id: jeId,
        je_number: je["jeNumber"],
        status: je["status"],
        company_code_id: je["companyCodeId"],
        book_id: je["bookId"],
        fiscal_year: je["fiscalYear"],
        period_number: je["periodNumber"],
        total_debit: parseFloat(String(je["totalDebit"] ?? "0")),
        total_credit: parseFloat(String(je["totalCredit"] ?? "0")),
        transaction_currency: je["transactionCurrency"],
        source_doc_type: je["sourceDocType"],
        posting_date: je["postingDate"],
        description: je["description"] ?? null,
        prior_period_flag: Boolean(je["priorPeriodFlag"]),
        is_reversal: Boolean(je["isReversal"]),
      };

      const wfEngine = createWorkflowEngine({ db, logger, approverResolver });
      const polEngine = new PolicyEngine({ db, logger });
      const policy = await polEngine.evaluate({
        tenantId,
        entityType: "journal_entry",
        entityId: jeId,
        payload: evaluationPayload,
        companyCodeId: je["companyCodeId"] as string | undefined,
        legalEntityId: ccRow?.legalEntityId,
        requestedBy: principalId,
      });

      if (policy.action === "deny") {
        res.status(403).json({
          error: "POLICY_DENIED",
          message: policy.winning?.explanation ?? "Journal entry submission blocked by policy rule.",
          policyAction: policy.action,
          policyScore: policy.winning?.score,
        });
        return;
      }

      const orgPayload = {
        ...evaluationPayload,
        tenant_id: tenantId,
        company_code_id: je["companyCodeId"],
        ...(ccRow?.legalEntityId ? { legal_entity_id: ccRow.legalEntityId } : {}),
      };
      const wfCheck = await wfEngine.shouldRequireWorkflow("journal_entry", tenantId, orgPayload);
      const policyForcesWorkflow = policy.action === "require_workflow";
      const usesDefaultAutoWorkflow = wfCheck.templateCode === DEFAULT_AUTO_JE_TEMPLATE_CODE;
      const shouldAutoApproveAndPost = !policyForcesWorkflow && (!wfCheck.required || usesDefaultAutoWorkflow);

      if (shouldAutoApproveAndPost) {
        const posted = await autoApproveAndPostJournalEntry(db, tenantId, jeId, principalId);

        res.status(200).json({
          workflowRequestId: null,
          canPostDirectly: true,
          autoApproved: true,
          autoPosted: true,
          status: "posted",
          record: posted,
          policyAction: policy.action,
          workflowTemplateCode: wfCheck.templateCode ?? null,
          message: usesDefaultAutoWorkflow
            ? "Journal entry auto-approved and posted by the default workflow."
            : "No approval workflow is configured; journal entry was auto-approved and posted.",
        });
        return;
      }

      const result = await wfEngine.createRequest({
        tenantId,
        entityType: "journal_entry",
        entityId: jeId,
        payload: evaluationPayload,
        companyCodeId: je["companyCodeId"] as string | undefined,
        legalEntityId: ccRow?.legalEntityId,
        requestedBy: principalId,
        overrideApprovers: policyForcesWorkflow && policy.winning?.approvers
          ? policy.winning.approvers as Array<{ type: string; value: string }>
          : undefined,
      });

      await (db.updateTable("document.journal_entry" as never) as any)
        .set({ status: "pending_approval", updated_by: principalId } as never)
        .where("id" as never, "=", jeId)
        .where("tenant_id" as never, "=", tenantId)
        .execute();

      res.status(result.isExisting ? 200 : 202).json({
        workflowRequestId: result.id,
        status: "pending_approval",
        workflowStatus: result.status,
        canPostDirectly: false,
        isExisting: result.isExisting,
        policyAction: policy.action,
        message: result.isExisting
          ? "An approval workflow is already in progress for this journal entry."
          : "Journal entry submitted for approval.",
      });
    } catch (err) {
      logger?.error("finance_je_submit_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  router.post("/finance/journals/:jeId/reverse", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const jeId = (req.params["jeId"] as string | undefined)?.trim();
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId || !jeId || !isUuid(jeId)) {
        res.status(400).json({ error: "INVALID_ID", message: "jeId must be a UUID" });
        return;
      }

      const principalId = await resolvePrincipalIdOrNull(db, (claims["sub"] as string) ?? "", tenantId);
      const actorId = principalId ?? SYSTEM_PRINCIPAL_UUID;
      const body = (req.body ?? {}) as Record<string, unknown>;

      const result = await handleReverseJournalEntry(db, tenantId, jeId, actorId, body, logger);
      res.status(result.status).json(result.body);
    } catch (err) {
      logger?.error("finance_journal_reverse_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  return router;
}

/**
 * Journal Routes — read-model endpoints for JE list and posting trace,
 * plus workflow submission hook.
 *
 * GET   /finance/journals                         — paginated JE list with filters
 * GET   /finance/journals/:jeId/posting-trace     — full debit/credit GL posting trace
 * POST  /finance/journals/:jeId/submit            — submit JE for approval (creates
 *                                                   workflow_request if a definition
 *                                                   matches; otherwise signals direct
 *                                                   posting is allowed)
 * POST  /finance/journals                         — create manual journal entry (balanced lines)
 * POST  /finance/journals/:jeId/reverse           — create mirror reversal of a posted JE
 * PATCH /finance/journals/:jeId                   — update a draft (status=created) JE
 */

import type { RequestHandler, Router } from "express";
import { sql, type Kysely } from "kysely";
import {
  parseScopeParams,
  resolveCompanyIds,
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
import { randomUUID } from "node:crypto";
import { WorkflowEngine } from "../../workflow/engine.js";
import { PolicyEngine } from "../../policy/engine.js";

// ── Route factory ──────────────────────────────────────────────────────────────

export function createJournalRoutes(router: Router, deps: FinanceRouteDeps): Router {
  const { db, auth, logger } = deps;

  // ── GET /finance/journals ───────────────────────────────────────────────────
  // Paginated journal entry list.
  // Query params (in addition to standard scope params):
  //   status        — JE status filter (created|posted|reversed|voided)
  //   source_doc_type — e.g. MANUAL, AP, AR
  //   search        — free-text search on je_number or description
  //   limit         — page size (default 50)
  //   offset        — row offset (default 0)
  router.get("/finance/journals", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ items: [], total: 0 }); return; }

      const parsed = parseScopeParams(req.query as Record<string, unknown>);
      if ("error" in parsed) { res.status(400).json({ error: parsed.error }); return; }

      const companies = await resolveCompanyIds(db, tenantId, parsed);
      if (companies.length === 0) { res.json({ items: [], total: 0 }); return; }
      const companyIds = companies.map((c) => c.company_code_id);

      const status        = (req.query["status"]          as string | undefined) ?? null;
      const sourceDocType = (req.query["source_doc_type"] as string | undefined) ?? null;
      const search        = (req.query["search"]          as string | undefined) ?? null;
      const limit         = Math.min(parseInt(String(req.query["limit"]  ?? "50"),  10), 200);
      const offset        = Math.max(parseInt(String(req.query["offset"] ?? "0"),   10), 0);

      let q = db
        .selectFrom("document.journal_entry as je")
        .select([
          "je.id",
          "je.je_number as jeNumber",
          "je.description",
          "je.status",
          "je.source_doc_type as sourceDocType",
          "je.source_doc_ref  as sourceDocRef",
          "je.posting_date    as postingDate",
          "je.fiscal_year     as fiscalYear",
          "je.period_number   as periodNumber",
          "je.currency_code   as currencyCode",
          "je.total_debit     as totalDebit",
          "je.total_credit    as totalCredit",
          "je.posted_at       as postedAt",
          "je.line_count      as lineCount",
        ])
        .where("je.tenant_id",        "=", tenantId)
        .where("je.company_code_id",  "in", companyIds)
        .where("je.fiscal_year",      "=", parsed.fiscalYear);

      if (parsed.period !== null) {
        q = q.where("je.period_number", "=", parsed.period) as typeof q;
      }
      if (parsed.bookId) {
        q = q.where("je.book_id", "=", parsed.bookId) as typeof q;
      }
      if (status) {
        q = q.where("je.status", "=", status) as typeof q;
      }
      if (sourceDocType) {
        q = q.where("je.source_doc_type", "=", sourceDocType) as typeof q;
      }
      if (search) {
        q = q.where((eb) =>
          eb.or([
            eb("je.je_number",   "like", `%${search}%`),
            eb("je.description", "like", `%${search}%`),
          ])
        ) as typeof q;
      }

      // Total count
      const countQ = (q as typeof q).clearSelect().select(db.fn.countAll().as("cnt"));
      const countRow = await countQ.executeTakeFirst() as { cnt: string | number } | undefined;
      const total = parseInt(String(countRow?.cnt ?? "0"), 10);

      // Paged rows
      const rows = await q
        .orderBy("je.posting_date", "desc")
        .orderBy("je.je_number", "desc")
        .limit(limit)
        .offset(offset)
        .execute() as Array<Record<string, unknown>>;

      const items = rows.map((r) => ({
        id:            r["id"],
        jeNumber:      r["jeNumber"],
        description:   r["description"] ?? null,
        status:        r["status"],
        sourceDocType: r["sourceDocType"] ?? null,
        sourceDocRef:  r["sourceDocRef"]  ?? null,
        postingDate:   r["postingDate"]   ?? null,
        fiscalYear:    r["fiscalYear"],
        periodNumber:  r["periodNumber"],
        currencyCode:  r["currencyCode"],
        totalDebit:    parseFloat(String(r["totalDebit"]  ?? "0")),
        totalCredit:   parseFloat(String(r["totalCredit"] ?? "0")),
        postedAt:      r["postedAt"]      ?? null,
        lineCount:     Number(r["lineCount"] ?? 0),
      }));

      res.json({ items, total, limit, offset });
    } catch (err) { logger?.error("finance_journals_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── GET /finance/journals/:jeId/posting-trace ───────────────────────────────
  // Full GL posting trace for a single journal entry.
  // Returns the JE header + all debit/credit lines with dimension labels.
  router.get("/finance/journals/:jeId/posting-trace", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const xOrg   = (req.headers["x-org"]   as string) ?? "";
      const xRealm = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const { jeId } = req.params as { jeId: string };
      if (!isUuid(jeId)) { res.status(404).json({ error: `Journal entry ${jeId} not found` }); return; }

      // JE header
      const je = await db
        .selectFrom("document.journal_entry as je")
        .select([
          "je.id",
          "je.je_number     as jeNumber",
          "je.description",
          "je.status",
          "je.source_doc_type as sourceDocType",
          "je.source_doc_ref  as sourceDocRef",
          "je.posting_date    as postingDate",
          "je.fiscal_year     as fiscalYear",
          "je.period_number   as periodNumber",
          "je.currency_code   as currencyCode",
          "je.total_debit     as totalDebit",
          "je.total_credit    as totalCredit",
          "je.posted_at       as postedAt",
          "je.reversed_by     as reversedBy",
          "je.reversal_of     as reversalOf",
          "je.narration",
        ])
        .where("je.id",        "=", jeId)
        .where("je.tenant_id", "=", tenantId)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!je) { res.status(404).json({ error: `Journal entry ${jeId} not found` }); return; }

      // Posting lines with account + dimension labels
      const lines = await db
        .selectFrom("document.journal_line as jl")
        .innerJoin("master.gl_account as ga", "ga.id", "jl.gl_account_id")
        .leftJoin("master.cost_center as cc",    "cc.id",  "jl.cost_center_id")
        .leftJoin("master.profit_center as pc",  "pc.id",  "jl.profit_center_id")
        .leftJoin("master.project as pj",        "pj.id",  "jl.project_id")
        .select([
          "jl.id",
          "jl.line_number    as lineNumber",
          "ga.code           as accountCode",
          "ga.name           as accountName",
          "ga.account_class  as accountClass",
          "jl.base_debit     as debitAmount",
          "jl.base_credit    as creditAmount",
          "jl.txn_debit      as txnDebit",
          "jl.txn_credit     as txnCredit",
          "jl.txn_currency   as txnCurrency",
          "cc.code           as costCenterCode",
          "cc.name           as costCenterName",
          "pc.code           as profitCenterCode",
          "pc.name           as profitCenterName",
          "pj.code           as projectCode",
          "pj.name           as projectName",
          "jl.assignment     as assignment",
          "jl.item_text      as itemText",
        ])
        .where("jl.journal_entry_id", "=", jeId)
        .where("jl.tenant_id",        "=", tenantId)
        .orderBy("jl.line_number",    "asc")
        .execute() as Array<Record<string, unknown>>;

      const traceLines = lines.map((l) => ({
        id:               l["id"],
        lineNumber:       Number(l["lineNumber"]),
        accountCode:      l["accountCode"],
        accountName:      l["accountName"],
        accountClass:     l["accountClass"],
        debitAmount:      parseFloat(String(l["debitAmount"]  ?? "0")),
        creditAmount:     parseFloat(String(l["creditAmount"] ?? "0")),
        txnDebit:         l["txnDebit"]   != null ? parseFloat(String(l["txnDebit"]))  : null,
        txnCredit:        l["txnCredit"]  != null ? parseFloat(String(l["txnCredit"])) : null,
        txnCurrency:      l["txnCurrency"] ?? null,
        costCenterCode:   l["costCenterCode"]   ?? null,
        costCenterName:   l["costCenterName"]   ?? null,
        profitCenterCode: l["profitCenterCode"] ?? null,
        profitCenterName: l["profitCenterName"] ?? null,
        projectCode:      l["projectCode"] ?? null,
        projectName:      l["projectName"] ?? null,
        assignment:       l["assignment"]  ?? null,
        itemText:         l["itemText"]    ?? null,
      }));

      res.json({
        je: {
          id:            je["id"],
          jeNumber:      je["jeNumber"],
          description:   je["description"]  ?? null,
          narration:     je["narration"]     ?? null,
          status:        je["status"],
          sourceDocType: je["sourceDocType"] ?? null,
          sourceDocRef:  je["sourceDocRef"]  ?? null,
          postingDate:   je["postingDate"]   ?? null,
          fiscalYear:    je["fiscalYear"],
          periodNumber:  je["periodNumber"],
          currencyCode:  je["currencyCode"],
          totalDebit:    parseFloat(String(je["totalDebit"]  ?? "0")),
          totalCredit:   parseFloat(String(je["totalCredit"] ?? "0")),
          postedAt:      je["postedAt"]      ?? null,
          reversedBy:    je["reversedBy"]    ?? null,
          reversalOf:    je["reversalOf"]    ?? null,
        },
        lines: traceLines,
      });
    } catch (err) { logger?.error("finance_posting_trace_error", { err: String(err) }); next(err); }
  }) as RequestHandler);

  // ── POST /finance/journals/:jeId/submit ──────────────────────────────────────
  //
  // Phase 2 — workflow gating integration.
  //
  // Evaluates control.workflow_definition rules for entity_type='journal_entry'
  // scoped to the JE's tenant + company_code_id + legal_entity_id.
  //
  // Outcomes:
  //   workflow required  → creates document.workflow_request (idempotent),
  //                        returns 202 { workflowRequestId, status, canPostDirectly: false }
  //   no workflow needed → returns 200 { workflowRequestId: null, canPostDirectly: true }
  //
  // After a 202 response the caller should poll or listen for workflow completion
  // before attempting to POST the JE (via the documents transition endpoint).
  // The DB trigger trg_je_workflow_gate will block posting while the request
  // is still pending or rejected.
  //
  // Idempotent: calling submit on a JE that already has a pending workflow_request
  // returns the existing request_id with status 200.

  router.post("/finance/journals/:jeId/submit", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const jeId = (req.params["jeId"] as string | undefined)?.trim();
      if (!jeId || !isUuid(jeId)) {
        res.status(400).json({ error: "INVALID_ID", message: "jeId must be a UUID" });
        return;
      }

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(404).json({ error: "TENANT_NOT_FOUND" });
        return;
      }

      const sub = claims["sub"] as string ?? "";
      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId);
      if (!principalId) {
        res.status(403).json({ error: "PRINCIPAL_NOT_FOUND", message: "no principal bound to this session" });
        return;
      }

      // Load JE — must exist and belong to this tenant
      const jeRow = await db
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
          "je.transaction_currency as transactionCurrency",
          "je.source_doc_type as sourceDocType",
          "je.posting_date as postingDate",
          "je.description",
          "je.prior_period_flag as priorPeriodFlag",
          "je.is_reversal as isReversal",
        ])
        .where("je.id", "=", jeId)
        .where("je.tenant_id", "=", tenantId)
        .executeTakeFirst();

      if (!jeRow) {
        res.status(404).json({ error: "JOURNAL_NOT_FOUND", message: `JE '${jeId}' not found` });
        return;
      }

      const je = jeRow as Record<string, unknown>;

      // Only JEs in 'created' status are eligible for submission
      if (je.status !== "created") {
        res.status(409).json({
          error: "INVALID_JE_STATUS",
          message: `Journal entry must be in 'created' status to submit for approval (current: '${je.status}')`,
          current_status: je.status,
        });
        return;
      }

      // Resolve legal_entity_id from the company code — needed for sub-tenant
      // scoping in JSONLogic conditions on the workflow definition.
      const ccRow = await db
        .selectFrom("master.company_code as cc")
        .select(["cc.legal_entity_id as legalEntityId"])
        .where("cc.id", "=", je.companyCodeId as string)
        .executeTakeFirst();

      const legalEntityId = (ccRow as Record<string, unknown> | undefined)?.legalEntityId as string | undefined;

      const wfEngine  = new WorkflowEngine({ db, logger });
      const polEngine = new PolicyEngine({ db, logger });

      // Build the evaluation payload — all JE fields that workflow definition
      // rules might reference in their JSONLogic conditions.
      const evaluationPayload: Record<string, unknown> = {
        je_id:              jeId,
        je_number:          je.jeNumber,
        status:             je.status,
        company_code_id:    je.companyCodeId,
        book_id:            je.bookId,
        fiscal_year:        je.fiscalYear,
        period_number:      je.periodNumber,
        total_debit:        parseFloat(String(je.totalDebit  ?? "0")),
        total_credit:       parseFloat(String(je.totalCredit ?? "0")),
        transaction_currency: je.transactionCurrency,
        source_doc_type:    je.sourceDocType,
        posting_date:       je.postingDate,
        description:        je.description ?? null,
        prior_period_flag:  Boolean(je.priorPeriodFlag),
        is_reversal:        Boolean(je.isReversal),
      };

      // ── Phase 5: Policy gate ──────────────────────────────────────────────
      // Evaluate the Policy & Rules Engine before the workflow gate.
      // deny          → block submission immediately (403)
      // require_workflow → force workflow and pass overrideApprovers + slaHours
      // warn          → proceed but surface advisory in response
      // allow / none  → proceed normally
      const polResult = await polEngine.evaluate({
        tenantId,
        entityType:    "journal_entry",
        entityId:      jeId,
        payload:       evaluationPayload,
        companyCodeId: je.companyCodeId as string | undefined,
        legalEntityId,
        requestedBy:   principalId,
      });

      if (polResult.action === "deny") {
        res.status(403).json({
          error:       "POLICY_DENIED",
          message:     polResult.winning?.explanation
            ?? "Journal entry submission blocked by policy rule.",
          policyAction: polResult.action,
          policyScore:  polResult.winning?.score,
        });
        return;
      }

      const policyForcesWorkflow  = polResult.action === "require_workflow";
      const policyOverrideApprovers = policyForcesWorkflow && polResult.winning?.approvers
        ? (polResult.winning.approvers as Array<{ type: string; value: string }>)
        : undefined;
      const policyWarn = polResult.action === "warn" ? polResult.winning : undefined;

      // ── Workflow gate ─────────────────────────────────────────────────────
      const orgPayload = {
        ...evaluationPayload,
        tenant_id: tenantId,
        ...(je.companyCodeId ? { company_code_id: je.companyCodeId } : {}),
        ...(legalEntityId    ? { legal_entity_id: legalEntityId }    : {}),
      };

      const wfCheck = await wfEngine.shouldRequireWorkflow(
        "journal_entry",
        tenantId,
        orgPayload,
      );

      const needsWorkflow = wfCheck.required || policyForcesWorkflow;

      if (!needsWorkflow) {
        // No workflow required — posting can proceed directly
        res.status(200).json({
          workflowRequestId: null,
          canPostDirectly:   true,
          policyAction:      polResult.action,
          ...(policyWarn ? {
            warning:    policyWarn.explanation ?? "Advisory: policy flagged this entry.",
            policyScore: policyWarn.score,
          } : {}),
          message: policyWarn
            ? "No approval workflow configured, but policy advisory applies."
            : "No approval workflow is configured for this journal entry.",
        });
        return;
      }

      // Create (or return existing) workflow request, using policy overrides when available
      const result = await wfEngine.createRequest({
        tenantId,
        entityType:       "journal_entry",
        entityId:         jeId,
        payload:          evaluationPayload,
        companyCodeId:    je.companyCodeId as string | undefined,
        legalEntityId,
        requestedBy:      principalId,
        overrideApprovers: policyOverrideApprovers,
      });

      res.status(result.isExisting ? 200 : 202).json({
        workflowRequestId: result.id,
        status:            result.status,
        canPostDirectly:   false,
        isExisting:        result.isExisting,
        policyAction:      polResult.action,
        ...(policyWarn ? {
          warning:    policyWarn.explanation ?? "Advisory: policy flagged this entry.",
          policyScore: policyWarn.score,
        } : {}),
        message: result.isExisting
          ? "An approval workflow is already in progress for this journal entry."
          : "Journal entry submitted for approval. Posting will be allowed once the workflow is approved.",
      });
    } catch (err) {
      logger?.error("finance_je_submit_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── POST /finance/journals ──────────────────────────────────────────────────
  // Create a manual journal entry with balanced debit/credit lines.
  //
  // Body:
  //   company_code   — master.company_code.code (e.g. "AUKA")
  //   fiscal_year    — integer (e.g. 2026)
  //   period_number  — integer 1-16
  //   posting_date   — ISO date string
  //   currency_code  — e.g. "USD"
  //   description?   — optional header description
  //   lines[]        — minimum 2:
  //     gl_account_code  — master.gl_account.code
  //     debit?           — debit amount (0 if absent)
  //     credit?          — credit amount (0 if absent)
  //     item_text?       — line-level text
  //
  // Validates: debits === credits (within 0.001 tolerance).
  // Auto-generates je_number as "JE-{YYYY}-{sequence}".
  // Returns 201 { journal_entry_id, je_number, status }.

  router.post("/finance/journals", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "TENANT_NOT_FOUND" });
        return;
      }

      const sub = claims["sub"] as string ?? "";
      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId);

      const body = req.body as Record<string, unknown>;

      const companyCode  = String(body["company_code"]  ?? "").trim();
      const fiscalYear   = Number(body["fiscal_year"]);
      const periodNumber = Number(body["period_number"]);
      const postingDate  = String(body["posting_date"]  ?? "").trim();
      const currencyCode = String(body["currency_code"] ?? "").trim();
      const description  = body["description"] != null ? String(body["description"]) : null;
      const lines        = body["lines"];

      if (!companyCode || !fiscalYear || !periodNumber || !postingDate || !currencyCode) {
        res.status(400).json({ error: "MISSING_REQUIRED_FIELDS",
          message: "company_code, fiscal_year, period_number, posting_date, currency_code are required" });
        return;
      }

      if (!Array.isArray(lines) || lines.length < 2) {
        res.status(400).json({ error: "INVALID_LINES", message: "At least 2 journal lines are required" });
        return;
      }

      const typedLines = lines as Array<{
        gl_account_code: unknown;
        debit?: unknown;
        credit?: unknown;
        item_text?: unknown;
      }>;

      // Validate balance
      let totalDebit = 0;
      let totalCredit = 0;
      for (const l of typedLines) {
        totalDebit  += Number(l.debit  ?? 0);
        totalCredit += Number(l.credit ?? 0);
      }
      if (Math.abs(totalDebit - totalCredit) > 0.001) {
        res.status(400).json({
          error: "UNBALANCED",
          message: `Journal entry is unbalanced: debit ${totalDebit.toFixed(2)} ≠ credit ${totalCredit.toFixed(2)}`,
        });
        return;
      }
      if (totalDebit <= 0) {
        res.status(400).json({ error: "ZERO_AMOUNT", message: "Journal entry must have non-zero amounts" });
        return;
      }

      // Resolve company
      const company = await db
        .selectFrom("master.company_code as cc")
        .select(["cc.id"])
        .where("cc.tenant_id", "=", tenantId)
        .where("cc.code",      "=", companyCode)
        .executeTakeFirst() as { id: string } | undefined;

      if (!company) {
        res.status(400).json({ error: "COMPANY_NOT_FOUND", message: `Company code '${companyCode}' not found` });
        return;
      }

      // Validate period exists (no FK needed; just confirm it's a real open period)
      const period = await db
        .selectFrom("master.fiscal_period as fp")
        .select(["fp.id", "fp.status"])
        .where("fp.tenant_id",       "=", tenantId)
        .where("fp.company_code_id", "=", company.id)
        .where("fp.fiscal_year",     "=", fiscalYear)
        .where("fp.period_number",   "=", periodNumber)
        .executeTakeFirst() as { id: string; status: string } | undefined;

      if (!period) {
        res.status(400).json({ error: "PERIOD_NOT_FOUND",
          message: `Fiscal period ${fiscalYear}/${periodNumber} not found for company '${companyCode}'` });
        return;
      }

      // Resolve GL accounts
      const accountCodes = [...new Set(typedLines.map((l) => String(l.gl_account_code ?? "")))];
      const accounts = await db
        .selectFrom("master.gl_account as ga")
        .select(["ga.id", "ga.code"])
        .where("ga.tenant_id",       "=", tenantId)
        .where("ga.code",            "in", accountCodes)
        .execute() as Array<{ id: string; code: string }>;

      const accountMap = new Map(accounts.map((a) => [a.code, a.id]));
      for (const l of typedLines) {
        const code = String(l.gl_account_code ?? "");
        if (!accountMap.has(code)) {
          res.status(400).json({ error: "ACCOUNT_NOT_FOUND", message: `GL account '${code}' not found` });
          return;
        }
      }

      // Auto-generate je_number: JE-{YYYY}-{padded-seq}
      const countRow = await db
        .selectFrom("document.journal_entry as je")
        .select(db.fn.countAll().as("cnt"))
        .where("je.tenant_id",  "=", tenantId)
        .where("je.fiscal_year", "=", fiscalYear)
        .executeTakeFirst() as { cnt: string | number } | undefined;
      const seq = parseInt(String(countRow?.cnt ?? "0"), 10) + 1;
      const jeNumber = `JE-${fiscalYear}-${String(seq).padStart(5, "0")}`;

      const jeId = randomUUID();

      // Insert atomically
      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto("document.journal_entry" as never)
          .values({
            id:                   jeId,
            tenant_id:            tenantId,
            je_number:            jeNumber,
            company_code_id:      company.id,
            fiscal_year:          fiscalYear,
            period_number:        periodNumber,
            posting_date:         postingDate,
            currency_code:        currencyCode,
            transaction_currency: currencyCode,
            description:          description,
            status:               "created",
            source_doc_type:      "MANUAL",
            total_debit:          totalDebit.toFixed(4),
            total_credit:         totalCredit.toFixed(4),
            line_count:           typedLines.length,
            prior_period_flag:    false,
            is_reversal:          false,
            created_at:           sql`now()`,
            updated_at:           sql`now()`,
            ...(principalId ? { created_by: principalId } : {}),
          } as never)
          .execute();

        for (let i = 0; i < typedLines.length; i++) {
          const l = typedLines[i]!;
          const glAccountId = accountMap.get(String(l.gl_account_code ?? ""))!;
          const debit  = Number(l.debit  ?? 0);
          const credit = Number(l.credit ?? 0);

          await trx
            .insertInto("document.journal_line" as never)
            .values({
              id:               randomUUID(),
              tenant_id:        tenantId,
              journal_entry_id: jeId,
              line_number:      i + 1,
              gl_account_id:    glAccountId,
              base_debit:       debit.toFixed(4),
              base_credit:      credit.toFixed(4),
              txn_debit:        debit.toFixed(4),
              txn_credit:       credit.toFixed(4),
              txn_currency:     currencyCode,
              item_text:        l.item_text != null ? String(l.item_text) : null,
            } as never)
            .execute();
        }

        // Emit search topic inside the same transaction — atomic with the
        // JE+lines write. The dedicated /finance/journals endpoint bypasses
        // the generic documents.route.ts, so emission has to happen here too.
        await emitOutboxEvent(trx, {
          tenantId,
          topic:      "search",
          eventType:  "journal_entry.created",
          entityType: "journal_entry",
          entityId:   jeId,
          actorId:    principalId ?? SYSTEM_PRINCIPAL_UUID,
        });
      });

      logger?.info?.("finance_journals_created", { jeId, jeNumber, tenantId });
      res.status(201).json({ journal_entry_id: jeId, je_number: jeNumber, status: "created" });
    } catch (err) {
      logger?.error("finance_journals_create_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── POST /finance/journals/:jeId/reverse ────────────────────────────────────
  // Create a mirror reversal of a posted journal entry.
  //
  // The reversal JE is created in "posted" status immediately (reversals are
  // accounting system actions — they do not require separate approval).
  // The original JE is updated to status="reversed", reversed_by=<newJeId>.
  // The reversal JE carries reversal_of=<originalJeId> and is_reversal=true.
  //
  // Body (optional):
  //   posting_date?  — reversal posting date (defaults to today)
  //   description?   — override description (defaults to "Reversal of {jeNumber}")
  //
  // Errors:
  //   404 JOURNAL_NOT_FOUND  — JE not found or wrong tenant
  //   409 ALREADY_REVERSED   — JE is already reversed
  //   409 INVALID_JE_STATUS  — JE is not in 'posted' status
  router.post("/finance/journals/:jeId/reverse", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const jeId = (req.params["jeId"] as string | undefined)?.trim();
      if (!jeId || !isUuid(jeId)) {
        res.status(400).json({ error: "INVALID_ID", message: "jeId must be a UUID" });
        return;
      }

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(404).json({ error: "TENANT_NOT_FOUND" });
        return;
      }

      const sub = claims["sub"] as string ?? "";
      const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId);

      // Load source JE
      const jeRow = await db
        .selectFrom("document.journal_entry as je")
        .select([
          "je.id",
          "je.je_number     as jeNumber",
          "je.status",
          "je.company_code_id as companyCodeId",
          "je.book_id       as bookId",
          "je.fiscal_year   as fiscalYear",
          "je.period_number as periodNumber",
          "je.currency_code as currencyCode",
          "je.description",
          "je.reversed_by   as reversedBy",
        ])
        .where("je.id",        "=", jeId)
        .where("je.tenant_id", "=", tenantId)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!jeRow) {
        res.status(404).json({ error: "JOURNAL_NOT_FOUND", message: `JE '${jeId}' not found` });
        return;
      }

      if (jeRow["status"] !== "posted") {
        res.status(409).json({
          error: "INVALID_JE_STATUS",
          message: `Only posted journal entries can be reversed (current: '${jeRow["status"]}')`,
          current_status: jeRow["status"],
        });
        return;
      }

      if (jeRow["reversedBy"]) {
        res.status(409).json({
          error: "ALREADY_REVERSED",
          message: `Journal entry '${jeRow["jeNumber"]}' has already been reversed`,
          reversed_by: jeRow["reversedBy"],
        });
        return;
      }

      // Load source lines
      const sourceLines = await db
        .selectFrom("document.journal_line as jl")
        .select([
          "jl.gl_account_id    as glAccountId",
          "jl.line_number      as lineNumber",
          "jl.base_debit       as baseDebit",
          "jl.base_credit      as baseCredit",
          "jl.txn_debit        as txnDebit",
          "jl.txn_credit       as txnCredit",
          "jl.txn_currency     as txnCurrency",
          "jl.cost_center_id   as costCenterId",
          "jl.profit_center_id as profitCenterId",
          "jl.project_id       as projectId",
          "jl.assignment       as assignment",
          "jl.item_text        as itemText",
        ])
        .where("jl.journal_entry_id", "=", jeId)
        .where("jl.tenant_id",        "=", tenantId)
        .orderBy("jl.line_number",    "asc")
        .execute() as Array<Record<string, unknown>>;

      if (sourceLines.length === 0) {
        res.status(422).json({ error: "NO_LINES", message: "Source JE has no lines to reverse" });
        return;
      }

      const body        = req.body as Record<string, unknown>;
      const today       = new Date().toISOString().slice(0, 10);
      const postingDate = body["posting_date"] ? String(body["posting_date"]) : today;
      const description = body["description"]
        ? String(body["description"])
        : `Reversal of ${String(jeRow["jeNumber"])}`;

      const revJeNumber = `REV-${String(jeRow["jeNumber"])}`;
      const revJeId     = randomUUID();

      const totalDebit  = sourceLines.reduce((s, l) => s + parseFloat(String(l["baseDebit"]  ?? "0")), 0);
      const totalCredit = sourceLines.reduce((s, l) => s + parseFloat(String(l["baseCredit"] ?? "0")), 0);

      await db.transaction().execute(async (trx) => {
        // Insert reversal JE — posted immediately (system-generated, no workflow)
        await trx
          .insertInto("document.journal_entry" as never)
          .values({
            id:                   revJeId,
            tenant_id:            tenantId,
            je_number:            revJeNumber,
            company_code_id:      jeRow["companyCodeId"],
            book_id:              jeRow["bookId"] ?? null,
            fiscal_year:          jeRow["fiscalYear"],
            period_number:        jeRow["periodNumber"],
            posting_date:         postingDate,
            currency_code:        jeRow["currencyCode"],
            transaction_currency: jeRow["currencyCode"],
            description:          description,
            status:               "posted",
            source_doc_type:      "REVERSAL",
            total_debit:          totalCredit.toFixed(4),   // swapped: original credit → reversal debit
            total_credit:         totalDebit.toFixed(4),    // swapped: original debit → reversal credit
            line_count:           sourceLines.length,
            prior_period_flag:    false,
            is_reversal:          true,
            reversal_of:          jeId,
            posted_at:            sql`now()`,
            created_at:           sql`now()`,
            updated_at:           sql`now()`,
            ...(principalId ? { created_by: principalId, posted_by: principalId } : {}),
          } as never)
          .execute();

        // Insert reversed lines (swap debit ↔ credit)
        for (let i = 0; i < sourceLines.length; i++) {
          const l = sourceLines[i]!;
          await trx
            .insertInto("document.journal_line" as never)
            .values({
              id:               randomUUID(),
              tenant_id:        tenantId,
              journal_entry_id: revJeId,
              line_number:      Number(l["lineNumber"]),
              gl_account_id:    l["glAccountId"],
              base_debit:       parseFloat(String(l["baseCredit"] ?? "0")).toFixed(4),
              base_credit:      parseFloat(String(l["baseDebit"]  ?? "0")).toFixed(4),
              txn_debit:        parseFloat(String(l["txnCredit"]  ?? "0")).toFixed(4),
              txn_credit:       parseFloat(String(l["txnDebit"]   ?? "0")).toFixed(4),
              txn_currency:     l["txnCurrency"] ?? jeRow["currencyCode"],
              cost_center_id:   l["costCenterId"]   ?? null,
              profit_center_id: l["profitCenterId"] ?? null,
              project_id:       l["projectId"]      ?? null,
              assignment:       l["assignment"]      ?? null,
              item_text:        l["itemText"]        ?? null,
            } as never)
            .execute();
        }

        // Mark original as reversed
        await (trx as any)
          .updateTable("document.journal_entry")
          .set({
            status:      "reversed",
            reversed_by: revJeId,
            updated_at:  sql`now()`,
          })
          .where("id",        "=", jeId)
          .where("tenant_id", "=", tenantId)
          .execute();

        // Emit two search events inside the trx — atomic with the writes.
        // The reversal JE is new; the original JE status changed to "reversed".
        await emitOutboxEvent(trx, {
          tenantId,
          topic:      "search",
          eventType:  "journal_entry.created",
          entityType: "journal_entry",
          entityId:   revJeId,
          actorId:    principalId ?? SYSTEM_PRINCIPAL_UUID,
          payload:    { reversal_of: jeId },
        });
        await emitOutboxEvent(trx, {
          tenantId,
          topic:      "search",
          eventType:  "journal_entry.updated",
          entityType: "journal_entry",
          entityId:   jeId,
          actorId:    principalId ?? SYSTEM_PRINCIPAL_UUID,
          payload:    { status: "reversed", reversed_by: revJeId },
        });
      });

      logger?.info?.("finance_journal_reversed", {
        original_je_id:  jeId,
        original_number: jeRow["jeNumber"],
        reversal_je_id:  revJeId,
        reversal_number: revJeNumber,
        tenantId,
      });

      res.status(201).json({
        reversal_journal_entry_id: revJeId,
        je_number:                 revJeNumber,
        status:                    "posted",
        reversal_of:               jeId,
      });
    } catch (err) {
      logger?.error("finance_journal_reverse_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── PATCH /finance/journals/:jeId ───────────────────────────────────────────
  // Update a draft journal entry (status = 'created' only).
  //
  // Body (all optional):
  //   description?  — header description
  //   posting_date? — ISO date string
  //   lines?[]      — full replacement of all lines (minimum 2, must be balanced)
  //     gl_account_code — master.gl_account.code
  //     debit?          — debit amount
  //     credit?         — credit amount
  //     item_text?      — line-level text
  //
  // Returns 200 { journal_entry_id, je_number, status }.
  router.patch("/finance/journals/:jeId", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const jeId = (req.params["jeId"] as string | undefined)?.trim();
      if (!jeId || !isUuid(jeId)) {
        res.status(400).json({ error: "INVALID_ID", message: "jeId must be a UUID" });
        return;
      }

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(404).json({ error: "TENANT_NOT_FOUND" });
        return;
      }

      const sub = typeof claims.sub === "string" ? claims.sub : "";
      const principalId = sub ? await resolvePrincipalIdOrNull(db, sub, tenantId) : null;

      const jeRow = await db
        .selectFrom("document.journal_entry as je")
        .select([
          "je.id",
          "je.je_number     as jeNumber",
          "je.status",
          "je.currency_code as currencyCode",
        ])
        .where("je.id",        "=", jeId)
        .where("je.tenant_id", "=", tenantId)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!jeRow) {
        res.status(404).json({ error: "JOURNAL_NOT_FOUND", message: `JE '${jeId}' not found` });
        return;
      }

      if (jeRow["status"] !== "created") {
        res.status(409).json({
          error: "INVALID_JE_STATUS",
          message: `Only draft journal entries can be edited (current: '${jeRow["status"]}')`,
          current_status: jeRow["status"],
        });
        return;
      }

      const body = req.body as Record<string, unknown>;
      const headerUpdates: Record<string, unknown> = { updated_at: sql`now()` };

      if (body["description"] !== undefined) {
        headerUpdates["description"] = body["description"] != null ? String(body["description"]) : null;
      }
      if (body["posting_date"] !== undefined) {
        headerUpdates["posting_date"] = String(body["posting_date"]);
      }

      const newLines = body["lines"];
      let accountMap: Map<string, string> | null = null;
      let typedLines: Array<{ gl_account_code: unknown; debit?: unknown; credit?: unknown; item_text?: unknown }> = [];

      if (Array.isArray(newLines)) {
        if (newLines.length < 2) {
          res.status(400).json({ error: "INVALID_LINES", message: "At least 2 journal lines are required" });
          return;
        }

        typedLines = newLines as typeof typedLines;
        let totalDebit  = 0;
        let totalCredit = 0;
        for (const l of typedLines) {
          totalDebit  += Number(l.debit  ?? 0);
          totalCredit += Number(l.credit ?? 0);
        }

        if (Math.abs(totalDebit - totalCredit) > 0.001) {
          res.status(400).json({
            error: "UNBALANCED",
            message: `Journal entry is unbalanced: debit ${totalDebit.toFixed(2)} ≠ credit ${totalCredit.toFixed(2)}`,
          });
          return;
        }
        if (totalDebit <= 0) {
          res.status(400).json({ error: "ZERO_AMOUNT", message: "Journal entry must have non-zero amounts" });
          return;
        }

        const accountCodes = [...new Set(typedLines.map((l) => String(l.gl_account_code ?? "")))];
        const accounts = await db
          .selectFrom("master.gl_account as ga")
          .select(["ga.id", "ga.code"])
          .where("ga.tenant_id", "=", tenantId)
          .where("ga.code",      "in", accountCodes)
          .execute() as Array<{ id: string; code: string }>;

        accountMap = new Map(accounts.map((a) => [a.code, a.id]));
        for (const l of typedLines) {
          const code = String(l.gl_account_code ?? "");
          if (!accountMap.has(code)) {
            res.status(400).json({ error: "ACCOUNT_NOT_FOUND", message: `GL account '${code}' not found` });
            return;
          }
        }

        headerUpdates["total_debit"]  = totalDebit.toFixed(4);
        headerUpdates["total_credit"] = totalCredit.toFixed(4);
        headerUpdates["line_count"]   = typedLines.length;
      }

      await db.transaction().execute(async (trx) => {
        await (trx as any)
          .updateTable("document.journal_entry")
          .set(headerUpdates)
          .where("id",        "=", jeId)
          .where("tenant_id", "=", tenantId)
          .execute();

        if (Array.isArray(newLines) && accountMap) {
          await (trx as any)
            .deleteFrom("document.journal_line")
            .where("journal_entry_id", "=", jeId)
            .where("tenant_id",        "=", tenantId)
            .execute();

          for (let i = 0; i < typedLines.length; i++) {
            const l = typedLines[i]!;
            const glAccountId = accountMap.get(String(l.gl_account_code ?? ""))!;
            const debit  = Number(l.debit  ?? 0);
            const credit = Number(l.credit ?? 0);

            await trx
              .insertInto("document.journal_line" as never)
              .values({
                id:               randomUUID(),
                tenant_id:        tenantId,
                journal_entry_id: jeId,
                line_number:      i + 1,
                gl_account_id:    glAccountId,
                base_debit:       debit.toFixed(4),
                base_credit:      credit.toFixed(4),
                txn_debit:        debit.toFixed(4),
                txn_credit:       credit.toFixed(4),
                txn_currency:     String(jeRow["currencyCode"]),
                item_text:        l.item_text != null ? String(l.item_text) : null,
              } as never)
              .execute();
          }
        }

        await emitOutboxEvent(trx, {
          tenantId,
          topic:      "search",
          eventType:  "journal_entry.updated",
          entityType: "journal_entry",
          entityId:   jeId,
          actorId:    principalId ?? SYSTEM_PRINCIPAL_UUID,
        });
      });

      logger?.info?.("finance_journal_updated", { jeId, jeNumber: jeRow["jeNumber"], tenantId });
      res.json({ journal_entry_id: jeId, je_number: String(jeRow["jeNumber"]), status: "created" });
    } catch (err) {
      logger?.error("finance_journal_update_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  return router;
}

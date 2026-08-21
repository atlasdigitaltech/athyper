import { sql, type Kysely } from "kysely";
import { writeFinanceSetupAudit } from "./finance-setup-audit.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export interface PostingRoleBook {
  bookId: string;
  bookCode: string;
  bookName: string;
  isPrimary: boolean;
}

export type PostingRoleCellStatus = "resolved" | "missing" | "invalid" | "not_required";

export interface PostingRoleCoverageCell {
  bookId: string;
  bookCode: string;
  required: boolean;
  requiredBy: string[];
  status: PostingRoleCellStatus;
  reasonCode: string;
  mappingId: string | null;
  glAccountId: string | null;
  glAccountCode: string | null;
  glAccountName: string | null;
  priority: number | null;
  versionNo: number | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

export interface PostingRoleCoverageRow {
  roleCode: string;
  roleName: string;
  description: string | null;
  domain: string;
  normalBalance: string;
  mandatoryForReadiness: boolean;
  cells: PostingRoleCoverageCell[];
}

export interface PostingRoleCoveragePayload {
  companyCode: string;
  asOfDate: string;
  books: PostingRoleBook[];
  rows: PostingRoleCoverageRow[];
  accounts: Array<{
    glAccountId: string;
    accountCode: string;
    accountName: string;
    accountClass: string;
    normalBalance: string;
  }>;
  summary: {
    requiredCells: number;
    resolvedCells: number;
    missingCells: number;
    invalidCells: number;
    coveragePct: number;
    ready: boolean;
  };
}

class PostingRoleServiceError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); }
}

async function resolveCompany(db: AnyDb, tenantId: string, companyCode: string) {
  const { rows } = await sql<{ id: string }>`
    SELECT id FROM master.company_code
     WHERE tenant_id = ${tenantId}::uuid AND code = ${companyCode}
     LIMIT 1
  `.execute(db);
  const id = rows[0]?.id;
  if (!id) throw new PostingRoleServiceError("COMPANY_NOT_FOUND", 404, `No company with code=${companyCode} in tenant.`);
  return id;
}

export async function loadPostingRoleCoverage(
  db: AnyDb,
  tenantId: string,
  companyCode: string,
  asOfDate = new Date().toISOString().slice(0, 10),
): Promise<PostingRoleCoveragePayload> {
  const companyCodeId = await resolveCompany(db, tenantId, companyCode);

  const [bookQ, roleQ, mapQ, requirementQ, accountQ] = await Promise.all([
    sql<{ book_id: string; book_code: string; book_name: string; is_primary: boolean }>`
      SELECT lb.id AS book_id, lb.code AS book_code, lb.name AS book_name, lb.is_primary
        FROM master.company_code_book_assignment ba
        JOIN master.ledger_book lb ON lb.tenant_id = ba.tenant_id AND lb.id = ba.book_id
       WHERE ba.tenant_id = ${tenantId}::uuid
         AND ba.company_code_id = ${companyCodeId}::uuid
         AND ba.status = 'active' AND lb.status = 'active'
         AND ba.effective_from <= ${asOfDate}::date
         AND (ba.effective_to IS NULL OR ba.effective_to >= ${asOfDate}::date)
       ORDER BY lb.is_primary DESC, lb.code
    `.execute(db),
    sql<{
      code: string; name: string; description: string | null; category: string | null;
      normal_balance: string | null; mandatory: boolean;
    }>`
      SELECT DISTINCT ON (lv.code)
             lv.code, lv.name, lv.description, lv.category,
             lv.metadata->>'normal_balance' AS normal_balance,
             COALESCE((lv.metadata->>'mandatory_for_readiness')::boolean, false) AS mandatory
        FROM control.lookup_value lv
       WHERE lv.domain_code = 'finance.posting_role'
         AND lv.status = 'active'
         AND (lv.tenant_id = ${tenantId}::uuid OR lv.tenant_id IS NULL)
       ORDER BY lv.code, (lv.tenant_id IS NOT NULL) DESC
    `.execute(db),
    sql<{
      id: string; ledger_book_id: string; posting_role_code: string; gl_account_id: string;
      account_code: string | null; account_name: string | null; account_status: string | null;
      node_type: string | null; posting_allowed: boolean; blocked_for_auto: boolean;
      priority: number; version_no: number; effective_from: string; effective_to: string | null;
    }>`
      SELECT DISTINCT ON (m.ledger_book_id, m.posting_role_code)
             m.id, m.ledger_book_id, m.posting_role_code, m.gl_account_id,
             ga.code AS account_code, ga.name AS account_name, ga.status AS account_status,
             ga.node_type, COALESCE(ccga.posting_allowed, true) AS posting_allowed,
             COALESCE(ccga.blocked_for_auto, false) AS blocked_for_auto,
             m.priority, m.version_no, m.effective_from::text, m.effective_to::text
        FROM control.posting_role_account_map m
        LEFT JOIN master.gl_account ga ON ga.tenant_id = m.tenant_id AND ga.id = m.gl_account_id
        LEFT JOIN master.company_code_gl_account ccga
          ON ccga.tenant_id = m.tenant_id AND ccga.company_code_id = m.company_code_id
         AND ccga.gl_account_id = m.gl_account_id
       WHERE m.tenant_id = ${tenantId}::uuid
         AND m.company_code_id = ${companyCodeId}::uuid
         AND m.status = 'active'
         AND m.effective_from <= ${asOfDate}::date
         AND (m.effective_to IS NULL OR m.effective_to >= ${asOfDate}::date)
       ORDER BY m.ledger_book_id, m.posting_role_code, m.priority DESC, m.effective_from DESC, m.id
    `.execute(db),
    sql<{ role_code: string; ledger_book_id: string | null; source: string }>`
      WITH role_requirements AS (
        SELECT lower(t.account_lookup_key) AS role_code, NULL::uuid AS ledger_book_id,
               'accounting_profile'::text AS source
          FROM control.acct_profile_entry_template t
          JOIN control.acct_profile_event e ON e.tenant_id = t.tenant_id AND e.id = t.profile_event_id
          JOIN control.acct_profile_config c ON c.tenant_id = e.tenant_id AND c.id = e.profile_config_id
         WHERE t.tenant_id = ${tenantId}::uuid
           AND upper(t.account_source) = 'POSTING_ROLE'
           AND t.status = 'active' AND e.status = 'active' AND c.status = 'active'
           AND c.effective_from <= ${asOfDate}::date
           AND (c.effective_to IS NULL OR c.effective_to >= ${asOfDate}::date)
        UNION ALL
        SELECT lower(x.role_code), lb.id, 'payment_policy'
          FROM control.payment_settlement_rule r
          JOIN master.ledger_book lb ON lb.tenant_id = r.tenant_id AND lower(lb.code) = lower(r.book_code)
          CROSS JOIN LATERAL unnest(ARRAY[
            r.clearing_posting_role_code, r.settlement_posting_role_code,
            r.bank_fee_posting_role_code, r.discount_posting_role_code,
            r.fx_gain_posting_role_code, r.fx_loss_posting_role_code,
            r.chargeback_posting_role_code, r.suspense_posting_role_code
          ]) x(role_code)
         WHERE r.tenant_id = ${tenantId}::uuid AND r.company_code_id = ${companyCodeId}::uuid
           AND r.status = 'active' AND x.role_code IS NOT NULL
           AND r.effective_from <= ${asOfDate}::date
           AND (r.effective_until IS NULL OR r.effective_until >= ${asOfDate}::date)
        UNION ALL
        SELECT lower(x.role_code), lb.id, 'asset_policy'
          FROM control.asset_class_book_policy p
          JOIN master.ledger_book lb ON lb.tenant_id = p.tenant_id AND lower(lb.code) = lower(p.book_code)
          CROSS JOIN LATERAL unnest(ARRAY[
            p.acquisition_posting_role_code, p.accum_depr_posting_role_code,
            p.depr_expense_posting_role_code, p.gain_loss_posting_role_code,
            p.impairment_expense_posting_role_code, p.impairment_reserve_posting_role_code,
            p.revaluation_surplus_posting_role_code, p.revaluation_loss_posting_role_code,
            p.cwip_posting_role_code
          ]) x(role_code)
         WHERE p.tenant_id = ${tenantId}::uuid AND p.company_code_id = ${companyCodeId}::uuid
           AND p.status = 'active' AND x.role_code IS NOT NULL
           AND p.effective_from <= ${asOfDate}::date
           AND (p.effective_to IS NULL OR p.effective_to >= ${asOfDate}::date)
      )
      SELECT DISTINCT role_code, ledger_book_id, source FROM role_requirements
       WHERE role_code IS NOT NULL AND btrim(role_code) <> ''
    `.execute(db),
    sql<{
      gl_account_id: string; account_code: string; account_name: string;
      account_class: string; normal_balance: string;
    }>`
      SELECT DISTINCT ga.id AS gl_account_id, ga.code AS account_code, ga.name AS account_name,
             ga.account_class, ga.normal_balance
        FROM master.gl_account ga
        JOIN master.company_code_chart_assignment ca
          ON ca.tenant_id = ga.tenant_id AND ca.chart_of_account_id = ga.chart_of_account_id
         AND ca.company_code_id = ${companyCodeId}::uuid AND ca.status = 'active'
        LEFT JOIN master.company_code_gl_account ccga
          ON ccga.tenant_id = ga.tenant_id AND ccga.company_code_id = ca.company_code_id
         AND ccga.gl_account_id = ga.id
       WHERE ga.tenant_id = ${tenantId}::uuid AND ga.status = 'active' AND ga.node_type = 'posting'
         AND (ccga.id IS NULL OR (ccga.status = 'active' AND ccga.posting_allowed AND NOT ccga.blocked_for_auto))
       ORDER BY ga.code
    `.execute(db),
  ]);

  const books: PostingRoleBook[] = bookQ.rows.map((b) => ({
    bookId: b.book_id, bookCode: b.book_code, bookName: b.book_name, isPrimary: b.is_primary,
  }));
  const requirements = new Map<string, Set<string>>();
  for (const req of requirementQ.rows) {
    for (const book of books) {
      if (req.ledger_book_id && req.ledger_book_id !== book.bookId) continue;
      const key = `${req.role_code}\u0000${book.bookId}`;
      const sources = requirements.get(key) ?? new Set<string>();
      sources.add(req.source);
      requirements.set(key, sources);
    }
  }
  const maps = new Map(mapQ.rows.map((m) => [`${m.posting_role_code}\u0000${m.ledger_book_id}`, m]));

  const rows: PostingRoleCoverageRow[] = roleQ.rows.map((role) => ({
    roleCode: role.code,
    roleName: role.name,
    description: role.description,
    domain: role.category ?? "other",
    normalBalance: role.normal_balance ?? "either",
    mandatoryForReadiness: role.mandatory,
    cells: books.map((book) => {
      const key = `${role.code}\u0000${book.bookId}`;
      const requiredBy = [...(requirements.get(key) ?? [])];
      if (role.mandatory) requiredBy.unshift("catalog_mandatory");
      const required = requiredBy.length > 0;
      const map = maps.get(key);
      const valid = !!map && map.account_status === "active" && map.node_type === "posting"
        && map.posting_allowed && !map.blocked_for_auto;
      const status: PostingRoleCellStatus = map ? (valid ? "resolved" : "invalid") : (required ? "missing" : "not_required");
      return {
        bookId: book.bookId, bookCode: book.bookCode, required, requiredBy, status,
        reasonCode: status === "resolved" ? "posting_role_resolved"
          : status === "invalid" ? "posting_role_account_not_postable"
          : status === "missing" ? "posting_role_mapping_missing" : "posting_role_not_required",
        mappingId: map?.id ?? null,
        glAccountId: map?.gl_account_id ?? null,
        glAccountCode: map?.account_code ?? null,
        glAccountName: map?.account_name ?? null,
        priority: map?.priority ?? null,
        versionNo: map?.version_no ?? null,
        effectiveFrom: map?.effective_from ?? null,
        effectiveTo: map?.effective_to ?? null,
      };
    }),
  }));

  const requiredCells = rows.flatMap((r) => r.cells).filter((c) => c.required);
  const resolvedCells = requiredCells.filter((c) => c.status === "resolved").length;
  const invalidCells = requiredCells.filter((c) => c.status === "invalid").length;
  const missingCells = requiredCells.filter((c) => c.status === "missing").length;
  return {
    companyCode, asOfDate, books, rows,
    accounts: accountQ.rows.map((a) => ({
      glAccountId: a.gl_account_id, accountCode: a.account_code, accountName: a.account_name,
      accountClass: a.account_class, normalBalance: a.normal_balance,
    })),
    summary: {
      requiredCells: requiredCells.length, resolvedCells, missingCells, invalidCells,
      coveragePct: requiredCells.length === 0 ? 100 : Math.round((resolvedCells / requiredCells.length) * 100),
      ready: missingCells === 0 && invalidCells === 0,
    },
  };
}

export async function tracePostingRoleResolution(
  db: AnyDb,
  input: { tenantId: string; companyCode: string; roleCode: string; bookCode: string; asOfDate: string },
): Promise<Record<string, unknown>> {
  const companyCodeId = await resolveCompany(db, input.tenantId, input.companyCode);
  const { rows } = await sql<{ trace: Record<string, unknown> }>`
    SELECT control.resolve_posting_role_account_trace(
      ${input.tenantId}::uuid, ${input.roleCode}, ${companyCodeId}::uuid,
      ${input.bookCode}, ${input.asOfDate}::date
    ) AS trace
  `.execute(db);
  return rows[0]?.trace ?? { status: "missing_trace" };
}

export interface SavePostingRoleMapInput {
  tenantId: string;
  actorId: string;
  companyCode: string;
  roleCode: string;
  ledgerBookId: string;
  glAccountId: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  priority?: number;
  mappingId?: string;
}

export async function savePostingRoleAccountMap(db: AnyDb, input: SavePostingRoleMapInput) {
  const companyCodeId = await resolveCompany(db, input.tenantId, input.companyCode);
  const result = await db.transaction().execute(async (trx) => {
    let versionNo = 1;
    let supersedesId: string | null = null;
    if (input.mappingId) {
      const previous = await sql<{ id: string; version_no: number }>`
        SELECT id, version_no FROM control.posting_role_account_map
         WHERE tenant_id = ${input.tenantId}::uuid AND company_code_id = ${companyCodeId}::uuid
           AND id = ${input.mappingId}::uuid AND status = 'active'
         FOR UPDATE
      `.execute(trx);
      if (!previous.rows[0]) throw new PostingRoleServiceError("POSTING_ROLE_MAP_NOT_FOUND", 404, "Active posting-role mapping was not found.");
      versionNo = previous.rows[0].version_no + 1;
      supersedesId = previous.rows[0].id;
      await sql`
        UPDATE control.posting_role_account_map
           SET status = 'superseded', status_changed_by = ${input.actorId}::uuid,
               effective_to = CASE WHEN effective_from < ${input.effectiveFrom}::date
                                   THEN ${input.effectiveFrom}::date - 1 ELSE effective_to END,
               updated_by = ${input.actorId}::uuid
         WHERE tenant_id = ${input.tenantId}::uuid AND id = ${input.mappingId}::uuid
      `.execute(trx);
    }
    const inserted = await sql<{ id: string }>`
      INSERT INTO control.posting_role_account_map (
        tenant_id, company_code_id, ledger_book_id, posting_role_code, gl_account_id,
        effective_from, effective_to, priority, version_no, supersedes_id,
        status, created_by
      ) VALUES (
        ${input.tenantId}::uuid, ${companyCodeId}::uuid, ${input.ledgerBookId}::uuid,
        ${input.roleCode}, ${input.glAccountId}::uuid, ${input.effectiveFrom}::date,
        ${input.effectiveTo ?? null}::date, ${input.priority ?? 100}, ${versionNo},
        ${supersedesId}::uuid, 'active', ${input.actorId}::uuid
      ) RETURNING id
    `.execute(trx);
    return { id: inserted.rows[0]!.id, versionNo, supersedesId };
  });
  await writeFinanceSetupAudit(db, {
    tenantId: input.tenantId, actorId: input.actorId, companyCodeId,
    activityType: input.mappingId ? "finance_setup.posting_role_map_updated" : "finance_setup.posting_role_map_assigned",
    entityType: "posting_role_account_map", entityId: result.id,
    detail: { roleCode: input.roleCode, ledgerBookId: input.ledgerBookId, glAccountId: input.glAccountId,
      effectiveFrom: input.effectiveFrom, priority: input.priority ?? 100, supersedesId: result.supersedesId },
  });
  return result;
}

export async function retirePostingRoleAccountMap(
  db: AnyDb, input: { tenantId: string; actorId: string; companyCode: string; mappingId: string },
) {
  const companyCodeId = await resolveCompany(db, input.tenantId, input.companyCode);
  const { rows } = await sql<{ id: string; posting_role_code: string; ledger_book_id: string }>`
    UPDATE control.posting_role_account_map
       SET status = 'inactive', status_changed_by = ${input.actorId}::uuid, updated_by = ${input.actorId}::uuid
     WHERE tenant_id = ${input.tenantId}::uuid AND company_code_id = ${companyCodeId}::uuid
       AND id = ${input.mappingId}::uuid AND status = 'active'
    RETURNING id, posting_role_code, ledger_book_id
  `.execute(db);
  const row = rows[0];
  if (!row) throw new PostingRoleServiceError("POSTING_ROLE_MAP_NOT_FOUND", 404, "Active posting-role mapping was not found.");
  await writeFinanceSetupAudit(db, {
    tenantId: input.tenantId, actorId: input.actorId, companyCodeId,
    activityType: "finance_setup.posting_role_map_retired", entityType: "posting_role_account_map",
    entityId: row.id, detail: { roleCode: row.posting_role_code, ledgerBookId: row.ledger_book_id },
  });
  return { id: row.id, status: "inactive" };
}


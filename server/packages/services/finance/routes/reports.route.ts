/**
 * Finance Reports Export Routes
 *
 * POST /api/finance/reports/export    — validate scope + reportCode, return download URL
 * GET  /api/finance/reports/download  — decode token, generate CSV, stream as attachment
 *
 * The download token is a base64url-encoded JSON payload carrying the report params.
 * Valid for REPORT_TOKEN_TTL_MS after issuance. No server-side state: the full
 * scope is encoded in the token so any runtime replica can serve the download.
 *
 * Supported report codes:
 *   trial-balance  — GL trial balance (opening / movement / closing per account)
 *   profit-loss    — P&L summary by account class
 *   balance-sheet  — Balance sheet (assets / liabilities / equity)
 *   ap-aging       — AP aging buckets by supplier
 *   ar-aging       — AR aging buckets by customer
 */

import type { RequestHandler, Router } from "express";
import { sql } from "kysely";
import { verifyBearer, resolveTenantId } from "@athyper/svc-shared";
import {
  type FinanceRouteDeps,
  parseScopeParams,
  resolveCompanyIds,
  type ScopeParams,
} from "./finance.route.js";

// ── Token ─────────────────────────────────────────────────────────────────────

const REPORT_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

interface ReportToken {
  reportCode: string;
  scope: ScopeParams;
  format: "csv";
  issuedAt: number;
  tenantId: string;
}

function encodeToken(payload: ReportToken): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeToken(token: string): ReportToken | null {
  try {
    const payload = JSON.parse(Buffer.from(token, "base64url").toString()) as ReportToken;
    if (Date.now() - payload.issuedAt > REPORT_TOKEN_TTL_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

// ── Supported report codes ────────────────────────────────────────────────────

const VALID_REPORT_CODES = new Set([
  "trial-balance",
  "profit-loss",
  "balance-sheet",
  "ap-aging",
  "ar-aging",
]);

// ── CSV builders ──────────────────────────────────────────────────────────────

function escapeCsv(v: unknown): string {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(cols: unknown[]): string {
  return cols.map(escapeCsv).join(",");
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function createReportsRoutes(router: Router, deps: FinanceRouteDeps): Router {
  const { db, auth, logger } = deps;

  // ── POST /api/finance/reports/export ─────────────────────────────────────────
  router.post("/finance/reports/export", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return; }

      const body = req.body as {
        reportCode?: string;
        scope?:      unknown;
        format?:     string;
      };

      const reportCode = body.reportCode?.trim() ?? "";
      if (!VALID_REPORT_CODES.has(reportCode)) {
        res.status(400).json({
          error:   "INVALID_REPORT_CODE",
          message: `reportCode must be one of: ${[...VALID_REPORT_CODES].join(", ")}`,
        });
        return;
      }

      const format = (body.format ?? "csv") as "csv";
      if (format !== "csv") {
        res.status(400).json({ error: "UNSUPPORTED_FORMAT", message: "Only csv is supported" });
        return;
      }

      // Scope comes in the request body as a flat object matching ScopeParams
      const scopeRaw = (body.scope ?? {}) as Record<string, unknown>;
      const parsed = parseScopeParams(scopeRaw);
      if ("error" in parsed) {
        res.status(400).json({ error: "INVALID_SCOPE", message: parsed.error }); return;
      }

      const token: ReportToken = {
        reportCode,
        scope: parsed,
        format,
        tenantId,
        issuedAt: Date.now(),
      };

      const t = encodeToken(token);
      // The download URL goes via the BFF relay — same prefix as other finance routes
      const downloadUrl = `/api/relay/finance/reports/download?t=${t}`;

      res.json({ downloadUrl, expiresIn: REPORT_TOKEN_TTL_MS / 1000 });
    } catch (err) {
      logger?.error("finance_reports_export_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ── GET /api/finance/reports/download ────────────────────────────────────────
  router.get("/finance/reports/download", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const rawToken = (req.query["t"] as string | undefined)?.trim();
      if (!rawToken) {
        res.status(400).json({ error: "MISSING_TOKEN" }); return;
      }

      const token = decodeToken(rawToken);
      if (!token) {
        res.status(400).json({ error: "INVALID_OR_EXPIRED_TOKEN" }); return;
      }

      const xOrg    = (req.headers["x-org"]   as string) ?? "";
      const xRealm  = (req.headers["x-realm"] as string) ?? "athyper";
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId || tenantId !== token.tenantId) {
        res.status(403).json({ error: "FORBIDDEN" }); return;
      }

      const companies = await resolveCompanyIds(db, tenantId, token.scope);
      if (companies.length === 0) {
        res.status(404).json({ error: "NO_DATA" }); return;
      }
      const companyIds    = companies.map((c) => c.company_code_id);
      const companyIdList = sql.join(companyIds.map((id) => sql`${id}::uuid`), sql`, `);

      // Effective period
      let effectivePeriod = token.scope.period;
      if (effectivePeriod === null) {
        const maxRow = await db
          .selectFrom("ledger.gl_balance as glb")
          .select(db.fn.max("glb.period_number").as("maxPeriod"))
          .where("glb.tenant_id", "=", tenantId)
          .where("glb.company_code_id", "in", companyIds)
          .where("glb.fiscal_year", "=", token.scope.fiscalYear)
          .executeTakeFirst() as { maxPeriod: number | null } | undefined;
        effectivePeriod = maxRow?.maxPeriod ?? 12;
      }

      let csvLines: string[] = [];
      const filename = `${token.reportCode}-fy${token.scope.fiscalYear}-p${effectivePeriod}.csv`;

      switch (token.reportCode) {
        // ── Trial Balance ─────────────────────────────────────────────────────
        case "trial-balance": {
          const { rows } = await sql<{
            account_code: string; account_name: string; account_class: string;
            opening_debit: string; opening_credit: string;
            movement_debit: string; movement_credit: string;
            closing_debit: string; closing_credit: string;
          }>`
            SELECT
              ga.code  AS account_code,
              ga.name  AS account_name,
              ga.account_class,
              SUM(glb.opening_debit)  AS opening_debit,
              SUM(glb.opening_credit) AS opening_credit,
              SUM(glb.period_debit)   AS movement_debit,
              SUM(glb.period_credit)  AS movement_credit,
              SUM(glb.closing_debit)  AS closing_debit,
              SUM(glb.closing_credit) AS closing_credit
            FROM   ledger.gl_balance glb
            JOIN   master.gl_account ga ON ga.id = glb.gl_account_id
            WHERE  glb.tenant_id       = ${tenantId}::uuid
              AND  glb.company_code_id = ANY(ARRAY[${companyIdList}])
              AND  glb.fiscal_year     = ${token.scope.fiscalYear}
              AND  glb.period_number   = ${effectivePeriod}
            GROUP  BY ga.code, ga.name, ga.account_class
            ORDER  BY ga.code
          `.execute(db);

          const pf = parseFloat;
          csvLines = [
            csvRow(["Account Code", "Account Name", "Class", "Opening Dr", "Opening Cr",
                    "Movement Dr", "Movement Cr", "Closing Dr", "Closing Cr", "Net Balance"]),
            ...rows.map((r) => {
              const cd = pf(r.closing_debit ?? "0"), cc = pf(r.closing_credit ?? "0");
              return csvRow([
                r.account_code, r.account_name, r.account_class,
                pf(r.opening_debit).toFixed(2),  pf(r.opening_credit).toFixed(2),
                pf(r.movement_debit).toFixed(2), pf(r.movement_credit).toFixed(2),
                cd.toFixed(2), cc.toFixed(2), (cd - cc).toFixed(2),
              ]);
            }),
          ];
          break;
        }

        // ── Profit & Loss ─────────────────────────────────────────────────────
        case "profit-loss": {
          const { rows } = await sql<{
            account_code: string; account_name: string; account_class: string;
            period_debit: string; period_credit: string;
          }>`
            SELECT
              ga.code           AS account_code,
              ga.name           AS account_name,
              ga.account_class,
              SUM(glb.period_debit)  AS period_debit,
              SUM(glb.period_credit) AS period_credit
            FROM   ledger.gl_balance glb
            JOIN   master.gl_account ga ON ga.id = glb.gl_account_id
            WHERE  glb.tenant_id       = ${tenantId}::uuid
              AND  glb.company_code_id = ANY(ARRAY[${companyIdList}])
              AND  glb.fiscal_year     = ${token.scope.fiscalYear}
              AND  glb.period_number   = ${effectivePeriod}
              AND  ga.account_class    IN ('revenue', 'expense')
            GROUP  BY ga.code, ga.name, ga.account_class
            ORDER  BY ga.account_class, ga.code
          `.execute(db);

          const pf = parseFloat;
          csvLines = [
            csvRow(["Account Code", "Account Name", "Class", "Debit", "Credit", "Net"]),
            ...rows.map((r) => {
              const d = pf(r.period_debit ?? "0"), c = pf(r.period_credit ?? "0");
              return csvRow([r.account_code, r.account_name, r.account_class,
                             d.toFixed(2), c.toFixed(2), (c - d).toFixed(2)]);
            }),
          ];
          break;
        }

        // ── Balance Sheet ─────────────────────────────────────────────────────
        case "balance-sheet": {
          const { rows } = await sql<{
            account_code: string; account_name: string; account_class: string;
            closing_debit: string; closing_credit: string;
          }>`
            SELECT
              ga.code           AS account_code,
              ga.name           AS account_name,
              ga.account_class,
              SUM(glb.closing_debit)  AS closing_debit,
              SUM(glb.closing_credit) AS closing_credit
            FROM   ledger.gl_balance glb
            JOIN   master.gl_account ga ON ga.id = glb.gl_account_id
            WHERE  glb.tenant_id       = ${tenantId}::uuid
              AND  glb.company_code_id = ANY(ARRAY[${companyIdList}])
              AND  glb.fiscal_year     = ${token.scope.fiscalYear}
              AND  glb.period_number   = ${effectivePeriod}
              AND  ga.account_class    IN ('asset', 'liability', 'equity')
            GROUP  BY ga.code, ga.name, ga.account_class
            ORDER  BY ga.account_class, ga.code
          `.execute(db);

          const pf = parseFloat;
          csvLines = [
            csvRow(["Account Code", "Account Name", "Class", "Closing Dr", "Closing Cr", "Net"]),
            ...rows.map((r) => {
              const d = pf(r.closing_debit ?? "0"), c = pf(r.closing_credit ?? "0");
              return csvRow([r.account_code, r.account_name, r.account_class,
                             d.toFixed(2), c.toFixed(2), (d - c).toFixed(2)]);
            }),
          ];
          break;
        }

        // ── AP Aging ──────────────────────────────────────────────────────────
        case "ap-aging": {
          const { rows } = await sql<{
            supplier_name: string | null;
            current_amount: string; days_1_30: string; days_31_60: string;
            days_61_90: string; over_90: string; total_outstanding: string;
          }>`
            SELECT
              COALESCE(s.name, 'Unknown')   AS supplier_name,
              COALESCE(SUM(pi.outstanding_amount) FILTER (
                WHERE pi.due_date IS NULL OR pi.due_date >= CURRENT_DATE), 0) AS current_amount,
              COALESCE(SUM(pi.outstanding_amount) FILTER (
                WHERE pi.due_date < CURRENT_DATE
                  AND pi.due_date >= CURRENT_DATE - INTERVAL '30 days'), 0)  AS days_1_30,
              COALESCE(SUM(pi.outstanding_amount) FILTER (
                WHERE pi.due_date < CURRENT_DATE - INTERVAL '30 days'
                  AND pi.due_date >= CURRENT_DATE - INTERVAL '60 days'), 0)  AS days_31_60,
              COALESCE(SUM(pi.outstanding_amount) FILTER (
                WHERE pi.due_date < CURRENT_DATE - INTERVAL '60 days'
                  AND pi.due_date >= CURRENT_DATE - INTERVAL '90 days'), 0)  AS days_61_90,
              COALESCE(SUM(pi.outstanding_amount) FILTER (
                WHERE pi.due_date < CURRENT_DATE - INTERVAL '90 days'), 0)   AS over_90,
              SUM(pi.outstanding_amount)                                      AS total_outstanding
            FROM   document.purchase_invoice pi
            LEFT   JOIN master.supplier s
                   ON s.id = pi.supplier_id AND s.tenant_id = pi.tenant_id
            WHERE  pi.tenant_id       = ${tenantId}::uuid
              AND  pi.company_code_id = ANY(ARRAY[${companyIdList}])
              AND  pi.outstanding_amount > 0
              AND  pi.status NOT IN ('cancelled', 'reversed', 'rejected', 'draft')
            GROUP  BY s.name
            ORDER  BY total_outstanding DESC
          `.execute(db);

          const pf = parseFloat;
          csvLines = [
            csvRow(["Supplier", "Current", "1-30 Days", "31-60 Days", "61-90 Days", "Over 90", "Total"]),
            ...rows.map((r) => csvRow([
              r.supplier_name,
              pf(r.current_amount).toFixed(2), pf(r.days_1_30).toFixed(2),
              pf(r.days_31_60).toFixed(2),     pf(r.days_61_90).toFixed(2),
              pf(r.over_90).toFixed(2),         pf(r.total_outstanding).toFixed(2),
            ])),
          ];
          break;
        }

        // ── AR Aging ──────────────────────────────────────────────────────────
        case "ar-aging": {
          // Gracefully returns empty if document.sales_invoice not yet deployed
          try {
            const { rows } = await sql<{
              customer_name: string | null;
              current_amount: string; days_1_30: string; days_31_60: string;
              days_61_90: string; over_90: string; total_outstanding: string;
            }>`
              SELECT
                COALESCE(c.name, 'Unknown')   AS customer_name,
                COALESCE(SUM(si.outstanding_amount) FILTER (
                  WHERE si.due_date IS NULL OR si.due_date >= CURRENT_DATE), 0) AS current_amount,
                COALESCE(SUM(si.outstanding_amount) FILTER (
                  WHERE si.due_date < CURRENT_DATE
                    AND si.due_date >= CURRENT_DATE - INTERVAL '30 days'), 0)  AS days_1_30,
                COALESCE(SUM(si.outstanding_amount) FILTER (
                  WHERE si.due_date < CURRENT_DATE - INTERVAL '30 days'
                    AND si.due_date >= CURRENT_DATE - INTERVAL '60 days'), 0)  AS days_31_60,
                COALESCE(SUM(si.outstanding_amount) FILTER (
                  WHERE si.due_date < CURRENT_DATE - INTERVAL '60 days'
                    AND si.due_date >= CURRENT_DATE - INTERVAL '90 days'), 0)  AS days_61_90,
                COALESCE(SUM(si.outstanding_amount) FILTER (
                  WHERE si.due_date < CURRENT_DATE - INTERVAL '90 days'), 0)   AS over_90,
                SUM(si.outstanding_amount)                                      AS total_outstanding
              FROM   document.sales_invoice si
              LEFT   JOIN master.customer c
                     ON c.id = si.customer_id AND c.tenant_id = si.tenant_id
              WHERE  si.tenant_id       = ${tenantId}::uuid
                AND  si.company_code_id = ANY(ARRAY[${companyIdList}])
                AND  si.outstanding_amount > 0
                AND  si.status NOT IN ('cancelled', 'reversed', 'rejected', 'draft')
              GROUP  BY c.name
              ORDER  BY total_outstanding DESC
            `.execute(db);

            const pf = parseFloat;
            csvLines = [
              csvRow(["Customer", "Current", "1-30 Days", "31-60 Days", "61-90 Days", "Over 90", "Total"]),
              ...rows.map((r) => csvRow([
                r.customer_name,
                pf(r.current_amount).toFixed(2), pf(r.days_1_30).toFixed(2),
                pf(r.days_31_60).toFixed(2),     pf(r.days_61_90).toFixed(2),
                pf(r.over_90).toFixed(2),         pf(r.total_outstanding).toFixed(2),
              ])),
            ];
          } catch {
            csvLines = [
              csvRow(["Customer", "Current", "1-30 Days", "31-60 Days", "61-90 Days", "Over 90", "Total"]),
            ];
          }
          break;
        }

        default:
          res.status(400).json({ error: "UNSUPPORTED_REPORT_CODE" }); return;
      }

      const body = csvLines.join("\r\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", Buffer.byteLength(body, "utf-8"));
      res.end(body);
    } catch (err) {
      logger?.error("finance_reports_download_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  return router;
}

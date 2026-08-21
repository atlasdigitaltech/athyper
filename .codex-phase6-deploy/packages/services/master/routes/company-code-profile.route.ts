/**
 * GET /api/master/company-code/:id/profile
 *
 * Returns the temporal profile for a company code (timezone, locale, date
 * format, week start). Consumed by useTemporalContext() — the "business
 * clock" that the DatePicker uses for documents owned by this company code.
 *
 * Returns 404 when the company code does not exist in the caller's tenant.
 * Returns sparse fields (any may be null) when a value is not configured —
 * the client resolves through tenant_profile and user prefs as fallback.
 */

import type { Router } from "express";
import { type Kysely } from "kysely";
import { verifyBearer, isUuid, resolveTenantId } from "@athyper/svc-shared";

export interface MasterCompanyCodeProfileRouteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: { error(event: string, fields?: Record<string, unknown>): void };
}

export interface CompanyCodeProfileResponse {
  companyCodeId: string;
  code: string;
  timezoneCode: string | null;
  localeCode: string | null;
  dateFormat: string | null;
  weekStart: 0 | 1 | 6 | null;
  countryCode: string | null;
  /**
   * Fiscal year start month (1-12). Needed by the DatePicker to map a
   * `YYYY-MM-DD` to its (fiscalYear, period) before consulting the
   * period-status calendar for the posting-date-disabled gate.
   */
  fiscalYearStartMonth: number | null;
}

export function registerMasterCompanyCodeProfileRoutes(
  router: Router,
  deps: MasterCompanyCodeProfileRouteDeps,
): void {
  const { db, auth, logger } = deps;

  router.get("/master/company-code/:id/profile", async (req, res) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const xOrg = req.headers["x-org"] as string | undefined;
      const xRealm = req.headers["x-realm"] as string | undefined;
      const tenantId = await resolveTenantId(db, xOrg ?? "", xRealm ?? "athyper");
      if (!tenantId) {
        return res.status(400).json({ error: "TENANT_REQUIRED", message: "Tenant resolution failed" });
      }

      const id = req.params["id"] ?? "";
      if (!id || !isUuid(id)) {
        return res.status(400).json({ error: "INVALID_PARAM", message: "id must be a UUID" });
      }

      const row = await db
        .selectFrom("master.company_code as cc")
        .leftJoin("master.legal_entity as le", (j) =>
          j.onRef("le.id", "=", "cc.legal_entity_id").on("le.tenant_id", "=", tenantId),
        )
        .select([
          "cc.id as company_code_id",
          "cc.code",
          "cc.timezone_code",
          "cc.locale_code",
          "cc.date_format",
          "cc.week_start",
          "cc.country_code as cc_country",
          "le.country_code as le_country",
          "cc.fiscal_year_start_month",
        ])
        .where("cc.tenant_id", "=", tenantId)
        .where("cc.id", "=", id)
        .executeTakeFirst();

      if (!row) {
        return res.status(404).json({ error: "NOT_FOUND", message: "Company code not found" });
      }

      const payload: CompanyCodeProfileResponse = {
        companyCodeId: row.company_code_id,
        code: row.code,
        timezoneCode: row.timezone_code ?? null,
        localeCode: row.locale_code ?? null,
        dateFormat: row.date_format ?? null,
        weekStart: normaliseWeekStart(row.week_start),
        countryCode: row.cc_country ?? row.le_country ?? null,
        fiscalYearStartMonth: normaliseFyStartMonth(row.fiscal_year_start_month),
      };

      res.setHeader("Cache-Control", "private, max-age=60");
      return res.json(payload);
    } catch (err) {
      logger?.error("master.company_code.profile", { error: String(err) });
      return res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  });
}

function normaliseWeekStart(value: number | null | undefined): 0 | 1 | 6 | null {
  if (value === 0 || value === 1 || value === 6) return value;
  return null;
}

function normaliseFyStartMonth(value: number | null | undefined): number | null {
  if (typeof value !== "number") return null;
  if (value < 1 || value > 12) return null;
  return value;
}

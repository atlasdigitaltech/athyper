import { sql, type Kysely } from "kysely";
import type {
  OnboardingCaseView,
  OnboardingPrincipalContext,
} from "../contracts/onboarding-case.contract.js";

interface CaseRow {
  id: string;
  tenant_id: string;
  case_code: string;
  target_product_code: string;
  status: string;
  decision_status: string;
  source_onboarding_mode: string;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface OnboardingCaseRepository {
  findForGuest(tenantId: string, caseId: string, accessToken: string): Promise<OnboardingCaseView | null>;
  findForPrincipal(context: OnboardingPrincipalContext, caseId: string): Promise<OnboardingCaseView | null>;
  advanceStatus(
    context: OnboardingPrincipalContext,
    caseId: string,
    nextStatus: string,
    reason?: string,
  ): Promise<OnboardingCaseView | null>;
}

function mapCase(row: CaseRow | undefined): OnboardingCaseView | null {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    caseCode: row.case_code,
    targetProductCode: row.target_product_code,
    status: row.status,
    decisionStatus: row.decision_status,
    sourceOnboardingMode: row.source_onboarding_mode,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function selectCase(db: Kysely<any>, caseId: string): Promise<OnboardingCaseView | null> {
  const result = await sql<CaseRow>`
    SELECT id, tenant_id, case_code, target_product_code, status,
           decision_status, source_onboarding_mode, created_at, updated_at
      FROM onboarding.onboarding_case
     WHERE id = ${caseId}::uuid
  `.execute(db);
  return mapCase(result.rows[0]);
}

export class PostgresOnboardingCaseRepository implements OnboardingCaseRepository {
  constructor(private readonly db: Kysely<any>) {}

  async findForGuest(
    tenantId: string,
    caseId: string,
    accessToken: string,
  ): Promise<OnboardingCaseView | null> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        await sql`SELECT onboarding.fn_bind_onboarding_guest_context(
          ${tenantId}::uuid, ${caseId}::uuid, ${accessToken}
        )`.execute(trx);
        return selectCase(trx, caseId);
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "42501" || code === "P0001") return null;
      throw error;
    }
  }

  async findForPrincipal(
    context: OnboardingPrincipalContext,
    caseId: string,
  ): Promise<OnboardingCaseView | null> {
    return this.db.transaction().execute(async (trx) => {
      await sql`SELECT
        set_config('app.database_plane', 'athyper', true),
        set_config('app.current_tenant_id', ${context.tenantId}, true),
        set_config('app.current_principal_id', ${context.principalId}, true)
      `.execute(trx);
      return selectCase(trx, caseId);
    });
  }

  async advanceStatus(
    context: OnboardingPrincipalContext,
    caseId: string,
    nextStatus: string,
    reason?: string,
  ): Promise<OnboardingCaseView | null> {
    return this.db.transaction().execute(async (trx) => {
      await sql`SELECT
        set_config('app.database_plane', 'athyper', true),
        set_config('app.current_tenant_id', ${context.tenantId}, true),
        set_config('app.current_principal_id', ${context.principalId}, true)
      `.execute(trx);
      await sql`SELECT onboarding.fn_advance_case_status(
        ${caseId}::uuid, ${nextStatus}::onboarding.case_status_d, ${reason ?? null}, ${context.principalId}::uuid
      )`.execute(trx);
      return selectCase(trx, caseId);
    });
  }
}

import { sql, type Kysely } from "kysely";
import { loadPostingRoleCoverage } from "./posting-role.service.js";
import { loadCompanyFxExposure } from "./finance-fx-exposure.service.js";
import { loadCompanyFxRateHealth } from "./finance-fx-rate-health.service.js";
import { policyFromRow, resolveFxPolicy } from "./finance-fx-policy.service.js";
import type { FxPermissions } from "./finance-fx-contracts.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb=Kysely<any>;

export type CompanyFxPageState =
  | "no_exposure"
  | "tenant_missing"
  | "effective_policy_missing"
  | "posting_accounts_missing"
  | "ready";

export type CompanyFxPrimaryAction =
  | "none"
  | "configure_tenant_defaults"
  | "review_effective_policy"
  | "assign_posting_accounts";

export function deriveCompanyFxPageState(input:{
  hasForeignCurrencyExposure:boolean;
  hasTenantDefault:boolean;
  hasEffectivePolicy:boolean;
  postingAccountsReady:boolean;
}):{
  state:CompanyFxPageState;
  complete:boolean;
  reasonCode:string;
  primaryAction:CompanyFxPrimaryAction;
} {
  if(!input.hasForeignCurrencyExposure)
    return {state:"no_exposure",complete:true,reasonCode:"FX_SETUP_NOT_REQUIRED",primaryAction:"none"};
  if(!input.hasTenantDefault)
    return {state:"tenant_missing",complete:false,reasonCode:"FX_TENANT_DEFAULT_MISSING",primaryAction:"configure_tenant_defaults"};
  if(!input.hasEffectivePolicy)
    return {state:"effective_policy_missing",complete:false,reasonCode:"FX_EFFECTIVE_POLICY_MISSING",primaryAction:"review_effective_policy"};
  if(!input.postingAccountsReady)
    return {state:"posting_accounts_missing",complete:false,reasonCode:"FX_POSTING_ACCOUNTS_INCOMPLETE",primaryAction:"assign_posting_accounts"};
  return {state:"ready",complete:true,reasonCode:"FX_SETUP_COMPLETE",primaryAction:"none"};
}

export const FX_POLICY_RUNTIME_FIELDS={
  defaultRateType:{enabled:true,enforcedBy:"purpose_rate_type_resolution"},
  revaluationRateType:{enabled:true,enforcedBy:"period_end_rate_health"},
  preferredSources:{enabled:true,enforcedBy:"source_eligibility_and_ranking"},
  maximumRateAgeDays:{enabled:true,enforcedBy:"purpose_required_date"},
  allowInverse:{enabled:true,enforcedBy:"rate_resolution"},
  allowTriangulation:{enabled:true,enforcedBy:"explicit_pivot_resolution"},
  pivotCurrencyCode:{enabled:true,enforcedBy:"explicit_pivot_resolution"},
  missingRateBehavior:{enabled:true,enforcedBy:"stable_runtime_outcome"},
  manualOverrideAllowed:{enabled:true,enforcedBy:"manual_override_runtime_outcome"},
  manualOverrideApprovalRequired:{enabled:true,enforcedBy:"manual_override_runtime_outcome"},
  autoReverseRevaluation:{enabled:false,enforcedBy:null,reasonCode:"FX_REVALUATION_EXECUTOR_NOT_REGISTERED"},
} as const;

export async function loadCompanyFxSummary(db:AnyDb,input:{
  tenantId:string;companyCode:string;asOfDate:string;legalEntityId?:string|null;permissions:FxPermissions;
}) {
  const computedAt=new Date().toISOString();
  const exposure=await loadCompanyFxExposure(db,input);
  const [policyResolution,posting,rateHealth,{rows:bookOverrideRows}]=await Promise.all([
    resolveFxPolicy(db,{tenantId:input.tenantId,companyCodeId:exposure.company.id,asOfDate:input.asOfDate}),
    loadPostingRoleCoverage(db,input.tenantId,input.companyCode,input.asOfDate),
    loadCompanyFxRateHealth(db,{tenantId:input.tenantId,exposure,asOfDate:input.asOfDate,observedAt:computedAt}),
    sql<Record<string,unknown>>`
      SELECT * FROM control.fx_policy
       WHERE tenant_id=${input.tenantId}::uuid AND company_code_id=${exposure.company.id}::uuid
         AND ledger_book_id IS NOT NULL AND status='active'
         AND effective_from<=${input.asOfDate}::date
         AND (effective_to IS NULL OR effective_to>=${input.asOfDate}::date)
       ORDER BY ledger_book_id,priority DESC,effective_from DESC,version_no DESC
    `.execute(db),
  ]);
  const tenantDefault=policyResolution.candidates.find(candidate=>candidate.specificity===1)?.policy??null;
  const companyOverride=policyResolution.candidates.find(candidate=>candidate.specificity===2)?.policy??null;
  const fxRows=posting.rows.filter(row=>["fx_gain","fx_loss"].includes(row.roleCode));
  const relevantBookIds=new Set(exposure.sources.filter(source=>source.bookId).map(source=>source.bookId));
  const hasUnscopedExposure=exposure.sources.some(source=>!source.bookId);
  const isRelevantBook=(bookId:string)=>hasUnscopedExposure||relevantBookIds.size===0||relevantBookIds.has(bookId);
  const postingRows=fxRows.map(row=>({
    ...row,
    cells:row.cells
      .filter(cell=>exposure.hasForeignCurrencyExposure&&isRelevantBook(cell.bookId))
      .map(cell=>cell.status==="not_required"
        ? {
            ...cell,
            required:true,
            requiredBy:[...new Set([...cell.requiredBy,"fx_exposure"])],
            status:"missing" as const,
            reasonCode:"fx_posting_role_mapping_missing",
          }
        : {
            ...cell,
            required:true,
            requiredBy:[...new Set([...cell.requiredBy,"fx_exposure"])],
          }),
  }));
  const postingCells=postingRows.flatMap(row=>row.cells);
  const postingAccountsReady=!exposure.hasForeignCurrencyExposure
    || (postingRows.length>=2&&postingRows.every(row=>row.cells.length>0&&row.cells.every(cell=>cell.status==="resolved")));
  const pageState=deriveCompanyFxPageState({
    hasForeignCurrencyExposure:exposure.hasForeignCurrencyExposure,
    hasTenantDefault:Boolean(tenantDefault),
    hasEffectivePolicy:Boolean(policyResolution.selected),
    postingAccountsReady,
  });
  const effectiveScope=policyResolution.selected
    ? policyResolution.selected.ledgerBookId?"book":policyResolution.selected.companyCodeId?"company":"tenant"
    : null;

  return {
    company:exposure.company,
    asOfDate:input.asOfDate,
    exposure,
    policy:{
      tenantDefault,
      companyOverride,
      effective:policyResolution.selected,
      effectiveScope,
      inheritanceState:!tenantDefault
        ? "tenant_missing"
        : effectiveScope==="book"
          ? "book_override"
          : companyOverride
            ? "company_override"
            : "inherited",
      bookOverrides:input.permissions.advancedConfigure.allowed?bookOverrideRows.map(policyFromRow):[],
      availableBooks:input.permissions.advancedConfigure.allowed?posting.books:[],
      bookOverridesHidden:!input.permissions.advancedConfigure.allowed,
      resolutionCandidates:input.permissions.advancedConfigure.allowed?policyResolution.candidates:[],
      runtimeFieldStatus:FX_POLICY_RUNTIME_FIELDS,
    },
    postingAccounts:{
      requiredRoleCodes:["fx_gain","fx_loss"],
      books:posting.books.filter(book=>exposure.hasForeignCurrencyExposure&&isRelevantBook(book.bookId)),
      rows:postingRows,
      accounts:posting.accounts,
      summary:{
        requiredCells:postingCells.length,
        resolvedCells:postingCells.filter(cell=>cell.status==="resolved").length,
        missingCells:postingCells.filter(cell=>cell.status==="missing").length,
        invalidCells:postingCells.filter(cell=>cell.status==="invalid").length,
      },
      ready:postingAccountsReady,
    },
    rateRequirements:rateHealth.requirements,
    setupStatus:{
      state:pageState.state==="no_exposure"?"not_required":pageState.state==="ready"?"complete":"incomplete",
      complete:pageState.complete,
      reasonCode:pageState.reasonCode,
    },
    pageState,
    operationalHealth:{
      state:rateHealth.summary.state,
      attentionCount:rateHealth.summary.attentionCount,
      healthyCount:rateHealth.summary.healthyCount,
      totalCount:rateHealth.summary.totalCount,
      affectsSetupCompletion:false,
    },
    permissions:input.permissions,
    computedAt,
  };
}

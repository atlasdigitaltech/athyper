import { sql, type Transaction } from "kysely";
import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import { MasterDataError } from "../../errors.js";
import { createHash } from "node:crypto";

type Tx = Transaction<Record<string, never>>;
export const partnerDecisionViewPermissions = Object.freeze({
  qualifications: "neon.relationship.business_partner_qualification.read",
  restrictions: "neon.relationship.business_partner_restriction.read",
});
type Kind = keyof typeof partnerDecisionViewPermissions;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Only the versioned presentation envelope is public. Executable condition
 * payloads, evidence references and private notes are never projected. */
export function conditionSummaries(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0,100).map(condition => {
    const p = condition && typeof condition === "object" ? condition.presentation : null;
    return p?.schema === "partner-condition-summary.v1" &&
      typeof p.summary === "string" && p.summary.trim().length > 0 && p.summary.length <= 1000
      ? { summary: p.summary, state: "recorded_not_evaluated" }
      : { summary: null, state: "summary_unavailable" };
  });
}

/** Partner-owned read models. Neither commercial setup nor workflow is a prerequisite. */
export function createPartnerDecisionViews(options: {
  authorizer: Authorizer;
  resolveReference?(context: VerifiedRequestContext, entityCode: string, recordId: string): Promise<string | null>;
  admitPartner(
    context: VerifiedRequestContext,
    recordId: string,
  ): Promise<void>;
  transactions: {
    run<T>(
      plane: "neon",
      actor: VerifiedRequestContext,
      work: (tx: Tx) => Promise<T>,
    ): Promise<T>;
  };
}) {
  return {
    async read(input: {
      context: VerifiedRequestContext;
      recordId: string;
      kind: Kind;
      limit: number;
      cursor?: string;
    }) {
      if (
        input.context.planeKey !== "neon" ||
        !uuid.test(input.recordId) ||
        !Object.hasOwn(partnerDecisionViewPermissions, input.kind)
      )
        throw new MasterDataError(
          400,
          "PARTNER_DECISION_VIEW_INVALID",
          "Invalid record view",
        );
      if (input.cursor && !uuid.test(input.cursor))
        throw new MasterDataError(
          400,
          "PARTNER_DECISION_CURSOR_INVALID",
          "Invalid page cursor",
        );
      await options.admitPartner(input.context, input.recordId);
      // The initial reader requires partner/tenant-wide read authority. Narrow
      // company grants cannot implicitly disclose all coverage groups or reasons.
      const access = await options.authorizer.authorize({
        context: input.context,
        permissionCode: partnerDecisionViewPermissions[input.kind],
        resource: {
          tenantId: input.context.tenantId,
          businessPartnerId: input.recordId,
        },
      });
      if (!access.allowed)
        throw new MasterDataError(
          403,
          "PARTNER_DECISION_VIEW_DENIED",
          "Record or section unavailable",
        );
      const limit = Math.min(100, Math.max(1, Math.floor(input.limit) || 25));
      return options.transactions.run("neon", input.context, async (tx) => {
        const tenant = input.context.tenantId;
        const partner = (
          await sql<{
            record_version: string;
          }>`SELECT record_version::text FROM master.business_partner
          WHERE tenant_id=${tenant}::uuid AND id=${input.recordId}::uuid`.execute(
            tx,
          )
        ).rows[0];
        if (!partner)
          throw new MasterDataError(
            404,
            "PARTNER_DECISION_VIEW_UNAVAILABLE",
            "Record or section unavailable",
          );
        // Table/column identifiers are selected exclusively by this code-owned enum.
        const qualification = input.kind === "qualifications";
        const table = qualification
          ? "control.business_partner_qualification"
          : "control.business_partner_block";
        const ownerColumn = qualification ? "qualification_id" : "block_id";
        const columns = qualification
          ? sql`d.qualification_type_code,d.decision,d.conditions,jsonb_array_length(d.conditions) AS recorded_condition_count,d.effective_from::text,d.effective_until::text,d.next_review_at::text`
          : sql`d.restriction_mode,d.operation_codes,d.reason_code,d.status,d.target_entity_type,d.target_entity_id::text,d.target_line_id::text,d.effective_from::text,d.effective_until::text,d.lifted_at::text`;
        // This is an interval display, not a business eligibility evaluation.
        // Date-only intervals have an explicit UTC reference-date basis.
        const now = qualification
          ? sql`(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date`
          : sql`CURRENT_TIMESTAMP`;
        const result = (
          await sql<
            Record<string, unknown>
          >`SELECT d.id::text,d.context_kind,d.context_id::text,${columns},
          CASE WHEN d.effective_from IS NULL THEN 'unspecified'
            WHEN d.effective_from>${now} THEN 'scheduled'
            WHEN d.effective_until IS NOT NULL AND d.effective_until<=${now} THEN 'ended'
            ELSE 'within_window' END AS date_window,
          to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS assessed_at,
          COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'scope_group',s.scope_group,'scope_mode',s.scope_mode,'scope_kind',s.scope_kind,
            'selection_mode',s.selection_mode,'commercial_capacity_code',s.commercial_capacity_code,
            'operating_organization_id',s.operating_organization_id,'company_code_id',s.company_code_id,
            'commodity_category_id',s.commodity_category_id,'country_code',s.country_code,
            'country_purpose',s.country_purpose,
            'commodity_classification_id',s.commodity_classification_id,
            'tax_jurisdiction_id',s.tax_jurisdiction_id,
            'organization_unit_id',s.organization_unit_id,'hierarchy_version',s.hierarchy_version
          ) ORDER BY s.scope_group,s.scope_kind,s.id)
          FROM control.business_partner_decision_scope s WHERE s.tenant_id=d.tenant_id
          AND ${sql.ref(`s.${ownerColumn}`)}=d.id),'[]'::jsonb) coverage
          FROM ${sql.table(table)} d WHERE d.tenant_id=${tenant}::uuid AND d.business_partner_id=${input.recordId}::uuid
          AND (${input.cursor ?? null}::uuid IS NULL OR d.id>${input.cursor ?? null}::uuid)
          ORDER BY d.id LIMIT ${limit + 1}`.execute(tx)
        ).rows;
        const items = result.slice(0, limit);
        const names = new Map<string, string | null>();
        const reference = async (entity: unknown, id: unknown) => {
          if (id == null) return [];
          const code = typeof entity === "string" && /^[a-z][a-z0-9_]{0,62}$/.test(entity) ? entity : "";
          const key = `${code}:${id}`;
          if (!names.has(key)) names.set(key, code && typeof id === "string" && uuid.test(id) && options.resolveReference
            ? await options.resolveReference(input.context,code,id) : null);
          const name = names.get(key);
          return [{name, state:name ? "available" : "unavailable"}];
        };
        for (const item of items) {
          if (qualification) {item.condition_summaries=conditionSummaries(item.conditions);delete item.conditions;}
          item.context_reference=await reference(item.context_kind,item.context_id);
          item.target_reference=await reference(item.target_entity_type,item.target_entity_id);
          // A line must have its own admitted reader; a parent grant is not enough.
          item.target_line_reference=item.target_line_id ? [{state:"unavailable"}] : [];
          delete item.context_id;delete item.target_entity_id;delete item.target_line_id;
        }
        return {
          revision: createHash("sha256")
            .update(JSON.stringify([partner.record_version, items]))
            .digest("hex"),
          data: {
            state: items.length ? "ready" : "empty",
            items,
            ...(result.length > limit
              ? { nextCursor: String(items.at(-1)!.id) }
              : {}),
          },
        };
      });
    },
  };
}

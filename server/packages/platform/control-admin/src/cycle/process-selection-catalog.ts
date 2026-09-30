import { createHash } from "node:crypto";
import { sql, type Transaction } from "kysely";
import type {
  ProcessRevision,
  ProcessScope,
  ProcessMinimumControl,
  ProcessSelectionCompilerPorts,
} from "@athyper/server-contract-control-admin";
import { createJsonRuleEvaluator } from "@athyper/server-platform-policy";
import { processManifestHash } from "./process-selection-compiler.js";

type Tx = Transaction<Record<string, never>>;
type Kind = Parameters<ProcessSelectionCompilerPorts["isPublished"]>[0];
const canonical = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(canonical).join(",")}]`
    : v && typeof v === "object"
      ? `{${Object.entries(v)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`)
          .join(",")}}`
      : JSON.stringify(v);
export const processCatalogContentHash = (definition: unknown) =>
  createHash("sha256").update(canonical(definition)).digest("hex");

/** The registry owns process-only artifacts. Existing policy/cycle/template/workflow owners remain authoritative. */
export function createProcessSelectionCatalog(options: {
  planeKey: ProcessScope["planeKey"];
  workflow: (
    revision: ProcessRevision,
    scope: ProcessScope,
    tx: Tx,
  ) => Promise<boolean>;
}) {
  const read = async (
    kind: Kind,
    revision: ProcessRevision,
    scope: ProcessScope,
    tx: Tx,
  ) => {
    const row = (
      await sql<{
        definition: Record<string, unknown>;
      }>`SELECT definition FROM control.process_selection_catalog_revision
   WHERE tenant_id=${scope.tenantId}::uuid AND plane_key=${scope.planeKey} AND process_family=${scope.processFamily}
    AND operating_organization_id=${scope.operatingOrganizationId}::uuid AND company_code_id IS NOT DISTINCT FROM ${scope.companyCodeId}::uuid
    AND kind=${kind} AND id=${revision.id}::uuid AND version=${revision.version} AND content_hash=${revision.hash}`.execute(
        tx,
      )
    ).rows[0];
    if (!row) return undefined;
    const named = revision as ProcessRevision & {
      code?: string;
      owner?: string;
    };
    if (named.code !== undefined && row.definition.code !== named.code)
      return undefined;
    if (named.owner !== undefined && row.definition.owner !== named.owner)
      return undefined;
    const hash =
      kind === "manifest"
        ? processManifestHash(row.definition as never)
        : processCatalogContentHash(row.definition);
    return hash === revision.hash ? row.definition : undefined;
  };
  return {
    async minimumControls(
      scope: ProcessScope,
      asOf: string,
      tx: Tx,
    ): Promise<readonly ProcessMinimumControl[]> {
      if (scope.planeKey !== options.planeKey) return [];
      const rows = (
        await sql<{
          id: string;
          version: number;
          content_hash: string;
          definition: Record<string, unknown>;
        }>`SELECT id,version,content_hash,definition FROM control.process_selection_catalog_revision
    WHERE tenant_id=${scope.tenantId}::uuid AND plane_key=${scope.planeKey} AND process_family=${scope.processFamily}
     AND operating_organization_id=${scope.operatingOrganizationId}::uuid AND company_code_id IS NOT DISTINCT FROM ${scope.companyCodeId}::uuid
     AND kind='minimum_control' AND effective_from<=${asOf}::timestamptz AND (effective_until IS NULL OR effective_until>${asOf}::timestamptz)
    ORDER BY id`.execute(tx)
      ).rows;
      return rows.map((r) => {
        const d = r.definition;
        if (
          processCatalogContentHash(d) !== r.content_hash ||
          typeof d.owner !== "string" ||
          !["simple", "standard", "enhanced"].includes(
            String(d.minimumProfile),
          ) ||
          !Array.isArray(d.mandatoryGateCodes) ||
          !d.mandatoryGateCodes.every((g) => typeof g === "string")
        )
          throw Error("PROCESS_CATALOG_AUTHORITY_INVALID");
        return {
          scope,
          authority: {
            id: r.id,
            version: r.version,
            hash: r.content_hash,
            owner: d.owner,
          },
          minimumProfile:
            d.minimumProfile as ProcessMinimumControl["minimumProfile"],
          mandatoryGateCodes: d.mandatoryGateCodes as string[],
        };
      });
    },
    compiler(tx: Tx): ProcessSelectionCompilerPorts {
      return {
        evaluator: createJsonRuleEvaluator(),
        isPublished: async (kind, r, s) => {
          if (s.planeKey !== options.planeKey) return false;
          if (kind === "workflow") return options.workflow(r, s, tx);
          if (kind === "policy" || kind === "edit_policy")
            return (
              (
                await sql`SELECT id FROM control.policy_definition WHERE tenant_id=${s.tenantId}::uuid AND entity_type=${kind === "edit_policy" ? "workflow.task_edit" : s.processFamily} AND id=${r.id}::uuid AND version_no=${r.version} AND definition_hash=${r.hash} AND status IN ('active','published')`.execute(
                  tx,
                )
              ).rows.length === 1
            );
          if (kind === "cycle") {
            const cycleTypeId = (
              r as ProcessRevision & { cycleTypeId?: string }
            ).cycleTypeId;
            if (!cycleTypeId) return false;
            return (
              (
                await sql`SELECT id FROM control.cycle_template_revision WHERE tenant_id=${s.tenantId}::uuid AND id=${r.id}::uuid AND revision_number=${r.version} AND template_hash=${r.hash} AND cycle_type_id=${cycleTypeId}::uuid`.execute(
                  tx,
                )
              ).rows.length === 1
            );
          }
          if (kind === "template") {
            const pin = r as ProcessRevision & {
              templateId?: string;
              bindingId?: string;
              locale?: string;
              variant?: string;
            };
            if (
              !pin.templateId ||
              !pin.bindingId ||
              !pin.locale ||
              !pin.variant
            )
              return false;
            return (
              (
                await sql`SELECT v.id FROM snapshot.template_version v JOIN master.template t ON t.tenant_id=v.tenant_id AND t.id=v.template_id
       JOIN master.template_binding b ON b.tenant_id=t.tenant_id AND b.template_id=t.id
       WHERE v.tenant_id=${s.tenantId}::uuid AND v.id=${r.id}::uuid AND v.version=${r.version} AND v.checksum=${r.hash}
        AND t.id=${pin.templateId}::uuid AND t.status='published' AND b.id=${pin.bindingId}::uuid AND b.status='active'
        AND b.locale_code=${pin.locale} AND v.locale_code=${pin.locale} AND b.variant_code=${pin.variant}`.execute(
                  tx,
                )
              ).rows.length === 1
            );
          }
          return !!(await read(kind, r, s, tx));
        },
      };
    },
  };
}

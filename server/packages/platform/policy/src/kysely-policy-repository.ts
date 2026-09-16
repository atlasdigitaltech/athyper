import type {
  JsonValue,
  PolicyAction,
  PolicyDefinition,
  PolicyEvaluationMode,
  PolicyRepository,
  PolicyRule,
} from "@athyper/server-contract-policy";
import { sql, type Transaction } from "kysely";

export type PolicyTransaction = Transaction<Record<string, never>>;

interface PolicyRow {
  definition_id: string;
  tenant_id: string | null;
  entity_type: string;
  policy_name: string;
  definition_priority: number;
  evaluation_mode: string;
  effective_from: Date | string;
  effective_until: Date | string | null;
  version_no: number;
  definition_hash: string | null;
  rule_id: string | null;
  rule_priority: number | null;
  condition_expr: unknown;
  action_code: string | null;
  action_config: unknown;
  score: string | number | null;
  confidence: string | number | null;
  explanation: string | null;
  approver_rules: unknown;
  sla_hours: number | null;
  rule_metadata: unknown;
}

export function createKyselyPolicyRepository(): PolicyRepository<PolicyTransaction> {
  return {
    async findExact(query, transaction) {
      const result = await sql<PolicyRow>`
        SELECT definition.id AS definition_id, definition.tenant_id, definition.entity_type,
               definition.name AS policy_name, definition.priority AS definition_priority,
               definition.evaluation_mode, definition.effective_from::text AS effective_from, definition.effective_until::text AS effective_until,
               definition.version_no, definition.definition_hash, rule.id AS rule_id, rule.priority AS rule_priority,
               rule.condition_expr, rule.action_code, rule.action_config, rule.score, rule.confidence,
               rule.explanation, rule.approver_rules, rule.sla_hours, rule.metadata AS rule_metadata
          FROM control.policy_definition AS definition
          LEFT JOIN control.policy_rule AS rule ON rule.policy_definition_id = definition.id
         WHERE definition.tenant_id = ${query.tenantId}::uuid
           AND definition.entity_type = ${query.entityType}
           AND definition.status IN ('published','active')
           AND definition.effective_from <= ${query.effectiveOn}::date
           AND (definition.effective_until IS NULL OR definition.effective_until >= ${query.effectiveOn}::date)
           AND definition.id = ${query.revision.id}::uuid
           AND definition.version_no = ${query.revision.version}
           AND definition.definition_hash = ${query.revision.hash}
         ORDER BY (definition.tenant_id IS NOT NULL) DESC, definition.priority ASC,
                  definition.version_no DESC, rule.priority ASC
      `.execute(transaction);
      return groupRows(result.rows)[0];
    },
    async findActive(query, transaction) {
      if (query.policyDefinitionIds?.length === 0) return [];
      const result = await sql<PolicyRow>`
        SELECT definition.id AS definition_id, definition.tenant_id, definition.entity_type,
               definition.name AS policy_name, definition.priority AS definition_priority,
               definition.evaluation_mode, definition.effective_from::text AS effective_from, definition.effective_until::text AS effective_until,
               definition.version_no, definition.definition_hash, rule.id AS rule_id, rule.priority AS rule_priority,
               rule.condition_expr, rule.action_code, rule.action_config, rule.score, rule.confidence,
               rule.explanation, rule.approver_rules, rule.sla_hours, rule.metadata AS rule_metadata
          FROM control.policy_definition AS definition
          LEFT JOIN control.policy_rule AS rule ON rule.policy_definition_id = definition.id
         WHERE (definition.tenant_id IS NULL OR definition.tenant_id = ${query.tenantId}::uuid)
           AND definition.entity_type = ${query.entityType}
           AND definition.status = 'active'
           AND definition.effective_from <= ${query.effectiveOn}::date
           AND (definition.effective_until IS NULL OR definition.effective_until >= ${query.effectiveOn}::date)
           ${query.policyDefinitionIds?.length ? sql`AND definition.id IN (${sql.join(query.policyDefinitionIds)})` : sql``}
         ORDER BY (definition.tenant_id IS NOT NULL) DESC, definition.priority ASC,
                  definition.version_no DESC, rule.priority ASC
      `.execute(transaction);
      return groupRows(result.rows);
    },
  };
}

function groupRows(rows: readonly PolicyRow[]): readonly PolicyDefinition[] {
  const definitions = new Map<
    string,
    { definition: Omit<PolicyDefinition, "rules">; rules: PolicyRule[] }
  >();
  for (const row of rows) {
    let entry = definitions.get(row.definition_id);
    if (!entry) {
      const evaluationMode = row.evaluation_mode as PolicyEvaluationMode;
      if (!["first_match", "accumulate", "all"].includes(evaluationMode))
        throw new Error(
          `Unsupported policy evaluation mode: ${row.evaluation_mode}`,
        );
      entry = {
        definition: {
          id: row.definition_id,
          ...(row.tenant_id ? { tenantId: row.tenant_id } : {}),
          entityType: row.entity_type,
          name: row.policy_name,
          priority: Number(row.definition_priority),
          evaluationMode,
          effectiveFrom: date(row.effective_from),
          ...(row.effective_until
            ? { effectiveUntil: date(row.effective_until) }
            : {}),
          versionNo: Number(row.version_no),
          ...(row.definition_hash
            ? { definitionHash: row.definition_hash }
            : {}),
        },
        rules: [],
      };
      definitions.set(row.definition_id, entry);
    }
    if (row.rule_id) entry.rules.push(mapRule(row));
  }
  return [...definitions.values()].map(({ definition, rules }) => ({
    ...definition,
    rules,
  }));
}

function mapRule(row: PolicyRow): PolicyRule {
  const action = row.action_code as PolicyAction;
  if (
    !["allow", "deny", "warn", "require_workflow", "escalate"].includes(action)
  )
    throw new Error(`Unsupported policy action: ${row.action_code}`);
  return {
    id: row.rule_id!,
    priority: Number(row.rule_priority),
    condition: json(row.condition_expr) as JsonValue,
    action,
    actionConfig: object(row.action_config),
    ...(row.score !== null ? { score: Number(row.score) } : {}),
    ...(row.confidence !== null ? { confidence: Number(row.confidence) } : {}),
    ...(row.explanation ? { explanation: row.explanation } : {}),
    ...(row.approver_rules !== null
      ? { approverRules: json(row.approver_rules) as JsonValue }
      : {}),
    ...(row.sla_hours !== null ? { slaHours: Number(row.sla_hours) } : {}),
    metadata: object(row.rule_metadata),
  };
}
function json(value: unknown): unknown {
  return typeof value === "string" ? (JSON.parse(value) as unknown) : value;
}
function object(value: unknown): Readonly<Record<string, unknown>> {
  const parsed = json(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Readonly<Record<string, unknown>>)
    : {};
}
function date(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
}

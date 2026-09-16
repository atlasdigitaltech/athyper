import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import type { PolicyAuthoringRepository, PolicyDefinition, PolicyRule, PolicyTestCase } from "@athyper/server-contract-policy";
import type { PolicyTransaction } from "./kysely-policy-repository.js";
import { calculateDefinitionHash } from "./policy-authoring-service.js";

type Row = Record<string, any>;
/** Scoped authoring writer. Authorization belongs to the caller; every lookup remains tenant-bound. */
export function createKyselyPolicyAuthoringRepository(identity: { tenantId: string; principalId: string }): PolicyAuthoringRepository<PolicyTransaction> {
  const { tenantId, principalId } = identity;
  async function row(id: string, tx: PolicyTransaction, lock = false): Promise<Row> {
    const result = await sql<Row>`SELECT *,effective_from::text start_date,effective_until::text end_date FROM control.policy_definition WHERE tenant_id=${tenantId}::uuid AND id=${id}::uuid ${lock ? sql`FOR UPDATE` : sql``}`.execute(tx);
    if (!result.rows[0]) throw Error("POLICY_DEFINITION_NOT_FOUND");
    return result.rows[0];
  }
  async function draft(id: string, tx: PolicyTransaction) {
    const definition = await row(id, tx, true);
    if (definition.status !== "draft") throw Error("POLICY_DRAFT_REQUIRED");
    return definition;
  }
  const repository: PolicyAuthoringRepository<PolicyTransaction> = {
    async getDefinition(id, tx) {
      let d: Row;
      try { d = await row(id, tx); } catch (error) { if (String(error).includes("POLICY_DEFINITION_NOT_FOUND")) return undefined; throw error; }
      const rules = (await sql<Row>`SELECT * FROM control.policy_rule WHERE policy_definition_id=${id}::uuid ORDER BY priority,id`.execute(tx)).rows;
      return { id, tenantId, entityType: d.entity_type, name: d.name, priority: d.priority, evaluationMode: d.evaluation_mode,
        effectiveFrom: d.start_date, ...(d.end_date ? { effectiveUntil: d.end_date } : {}), versionNo: d.version_no,
        ...(d.definition_hash ? { definitionHash: d.definition_hash } : {}), rules: rules.map(r => ({ id: r.id, priority: r.priority,
          condition: r.condition_expr, action: r.action_code, actionConfig: r.action_config, metadata: r.metadata,
          ...(r.explanation != null ? { explanation: r.explanation } : {}), ...(r.score != null ? { score: Number(r.score) } : {}),
          ...(r.confidence != null ? { confidence: Number(r.confidence) } : {}), ...(r.approver_rules != null ? { approverRules: r.approver_rules } : {}),
          ...(r.sla_hours != null ? { slaHours: r.sla_hours } : {}) } as PolicyRule)) } as PolicyDefinition;
    },
    async createDraft(input, tx) {
      if (input.definition.tenantId !== tenantId) throw Error("POLICY_TENANT_MISMATCH");
      if (input.predecessorId) {
        const previous = await row(input.predecessorId, tx, true);
        if (!["active", "published"].includes(previous.status) || input.definition.versionNo !== previous.version_no + 1 || input.definition.entityType !== previous.entity_type) throw Error("POLICY_PREDECESSOR_INVALID");
      }
      const id = randomUUID(), d = input.definition;
      await sql`INSERT INTO control.policy_definition(id,tenant_id,entity_type,name,priority,evaluation_mode,effective_from,effective_until,version_no,predecessor_id,status,created_by)
        VALUES(${id}::uuid,${tenantId}::uuid,${d.entityType},${d.name},${d.priority},${d.evaluationMode},${d.effectiveFrom}::date,${d.effectiveUntil ?? null}::date,${d.versionNo},${input.predecessorId ?? null}::uuid,'draft',${principalId}::uuid)`.execute(tx);
      for (const rule of input.rules) await sql`INSERT INTO control.policy_rule(id,policy_definition_id,priority,condition_expr,action_code,action_config,metadata,explanation,score,confidence,approver_rules,sla_hours,created_by)
        VALUES(${randomUUID()}::uuid,${id}::uuid,${rule.priority},${JSON.stringify(rule.condition)}::jsonb,${rule.action},${JSON.stringify(rule.actionConfig)}::jsonb,${JSON.stringify(rule.metadata)}::jsonb,${rule.explanation ?? null},${rule.score ?? null},${rule.confidence ?? null},${rule.approverRules ? JSON.stringify(rule.approverRules) : null}::jsonb,${rule.slaHours ?? null},${principalId}::uuid)`.execute(tx);
      for (const test of input.tests ?? []) await repository.saveTestCase({ ...test, definitionId: id }, tx);
      return (await repository.getDefinition(id, tx))!;
    },
    async saveTestCase(test, tx) {
      await draft(test.definitionId, tx);
      const id = test.id ?? randomUUID();
      if (test.id) {
        const existing = (await sql`SELECT id FROM control.policy_test_case WHERE id=${id}::uuid AND policy_definition_id=${test.definitionId}::uuid`.execute(tx)).rows;
        if (!existing.length) throw Error("POLICY_TEST_NOT_FOUND");
      }
      await sql`INSERT INTO control.policy_test_case(id,policy_definition_id,code,name,input_payload,expected_outcome,created_by)
        VALUES(${id}::uuid,${test.definitionId}::uuid,${test.code},${test.name},${JSON.stringify(test.input)}::jsonb,${JSON.stringify(test.expected)}::jsonb,${principalId}::uuid)
        ON CONFLICT(id) DO UPDATE SET code=EXCLUDED.code,name=EXCLUDED.name,input_payload=EXCLUDED.input_payload,expected_outcome=EXCLUDED.expected_outcome,updated_by=${principalId}::uuid`.execute(tx);
      return { ...test, id };
    },
    async deleteTestCase(id, tx) {
      const test = (await sql<Row>`SELECT t.policy_definition_id FROM control.policy_test_case t JOIN control.policy_definition d ON d.id=t.policy_definition_id WHERE d.tenant_id=${tenantId}::uuid AND t.id=${id}::uuid`.execute(tx)).rows[0];
      if (!test) throw Error("POLICY_TEST_NOT_FOUND");
      await draft(test.policy_definition_id, tx);
      await sql`DELETE FROM control.policy_test_case WHERE id=${id}::uuid`.execute(tx);
    },
    async listTestCases(id, tx) {
      await row(id, tx);
      return (await sql<Row>`SELECT id,policy_definition_id,code,name,input_payload,expected_outcome FROM control.policy_test_case WHERE policy_definition_id=${id}::uuid AND status='active' ORDER BY code`.execute(tx)).rows.map(t => ({ id: t.id, definitionId: t.policy_definition_id, code: t.code, name: t.name, input: t.input_payload, expected: t.expected_outcome } as PolicyTestCase));
    },
    async saveTestResults(results, tx) {
      for (const result of results) {
        const test = (await sql<Row>`SELECT t.policy_definition_id FROM control.policy_test_case t JOIN control.policy_definition d ON d.id=t.policy_definition_id WHERE d.tenant_id=${tenantId}::uuid AND t.id=${result.testCaseId}::uuid`.execute(tx)).rows[0];
        if (!test) throw Error("POLICY_TEST_NOT_FOUND");
        await row(test.policy_definition_id, tx, true);
        const current = (await repository.getDefinition(test.policy_definition_id, tx))!;
        if (calculateDefinitionHash(current) !== result.definitionHash) throw Error("POLICY_TEST_HASH_CONFLICT");
        await sql`INSERT INTO control.policy_test_result(policy_test_case_id,policy_definition_id,definition_hash,passed,actual_outcome,executed_at,executed_by)
          VALUES(${result.testCaseId}::uuid,${test.policy_definition_id}::uuid,${result.definitionHash},${result.passed},${JSON.stringify(result.actual)}::jsonb,${result.executedAt}::timestamptz,${principalId}::uuid)`.execute(tx);
      }
    },
    async dependenciesExist(dependencies, tx) {
      const missing: string[] = [];
      for (const id of dependencies) if (!(await sql`SELECT id FROM control.policy_definition WHERE tenant_id=${tenantId}::uuid AND id=${id}::uuid AND status IN ('active','published')`.execute(tx)).rows.length) missing.push(id);
      return missing;
    },
    async requestApproval(id, tx) {
      await draft(id, tx);
      const current = (await repository.getDefinition(id, tx))!;
      await sql`UPDATE control.policy_definition SET status='pending_approval',definition_hash=${calculateDefinitionHash(current)},updated_by=${principalId}::uuid WHERE id=${id}::uuid AND tenant_id=${tenantId}::uuid`.execute(tx);
    },
    async activate(id, expectedHash, tx) {
      const d = await row(id, tx, true);
      if (d.created_by === principalId) throw Error("POLICY_MAKER_CHECKER_REQUIRED");
      if (d.status !== "pending_approval") throw Error("POLICY_APPROVAL_REQUIRED");
      const current = (await repository.getDefinition(id, tx))!;
      if (d.definition_hash !== expectedHash || calculateDefinitionHash(current) !== expectedHash) throw Error("POLICY_HASH_CONFLICT");
      await sql`UPDATE control.policy_definition SET status='active',updated_by=${principalId}::uuid WHERE tenant_id=${tenantId}::uuid AND id=${id}::uuid`.execute(tx);
    },
  };
  return repository;
}

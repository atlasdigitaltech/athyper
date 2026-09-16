import { taskRuleBaselines, proposeTaskRules, publishTaskRules } from "./task-rule-publication.js";
import { createHash, randomUUID } from "node:crypto";
import { sql, type Kysely, type Transaction } from "kysely";
import type { Application, RequestHandler, Response } from "express";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { PolicyDefinition, PolicyTestCase } from "@athyper/server-contract-policy";
import { createKyselyPolicyAuthoringRepository, createPolicyAuthoringService, createJsonRuleEvaluator } from "@athyper/server-platform-policy";
import { defineRouteContract, registerContractRoute, HttpError } from "@athyper/server-runtime-http";
import { processSelectionCanonical } from "@athyper/server-platform-governance";
type DB = Record<string, never>; type Tx = Transaction<DB>; type Row = Record<string, any>;
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const object = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);
function bad(code: string, status = 400): never { throw new HttpError(status, code, code.replaceAll("_", " ")); }
/** Studio authoring of the supplier edit-policy purpose in its owning NEON catalog. */
export function createTaskEditPolicyAuthoring(options: { database: Kysely<DB>; authorizer: Authorizer; resolvePrincipal?: (context: VerifiedRequestContext, tx: Tx) => Promise<string> }) {
  async function run(context: VerifiedRequestContext, action: "read" | "author" | "publish", work: (tx: Tx, context: VerifiedRequestContext) => Promise<unknown>, revisionId?: string) {
    if (context.planeKey !== "studio") bad("TASK_POLICY_STUDIO_REQUIRED", 403);
    const access = await options.authorizer.authorize({ context, permissionCode: `studio.business_partner_definition.${action}`, resource: { tenantId: context.tenantId, purpose: "workflow.task_edit", ...(revisionId ? { revisionId } : {}) } });
    if (!access.allowed) throw new HttpError(403,"TASK_POLICY_FORBIDDEN",access.reason);
    return options.database.transaction().execute(async tx => {
      await sql`SELECT set_config('app.current_tenant_id',${context.tenantId},true),set_config('app.current_principal_id',${context.principalId},true),set_config('app.database_plane','neon',true)`.execute(tx);
      const principalId = options.resolvePrincipal ? await options.resolvePrincipal(context, tx) : context.principalId;
      await sql`SELECT set_config('app.current_principal_id',${principalId},true)`.execute(tx);
      return work(tx, { ...context, principalId });
    });
  }
  function owner(context: VerifiedRequestContext) {
    const repository = createKyselyPolicyAuthoringRepository(context);
    const service = createPolicyAuthoringService({ repository, evaluator: createJsonRuleEvaluator(), signer: {
      sign: async () => { throw Error("TASK_POLICY_BUNDLE_EXPORT_UNSUPPORTED"); }, verify: async () => false,
    } });
    return { repository, service };
  }
  async function get(context: VerifiedRequestContext, id: string, tx: Tx) {
    if (!uuid(id)) bad("TASK_POLICY_ID_INVALID");
    const { repository } = owner(context), definition = await repository.getDefinition(id, tx);
    if (!definition || definition.entityType !== "workflow.task_edit") bad("TASK_POLICY_NOT_FOUND", 404);
    const state = (await sql<Row>`SELECT status,created_by,definition_hash FROM control.policy_definition WHERE tenant_id=${context.tenantId}::uuid AND id=${id}::uuid`.execute(tx)).rows[0]!;
    const tests = await repository.listTestCases(id, tx);
    const results = (await sql<Row>`SELECT r.policy_test_case_id,r.definition_hash,r.passed,r.actual_outcome,r.executed_at FROM control.policy_test_result r WHERE r.policy_definition_id=${id}::uuid ORDER BY executed_at DESC,id`.execute(tx)).rows;
    const proposal = (await sql<Row>`SELECT base_publication_id,expected_release_id,publication FROM control.process_task_rule_proposal WHERE tenant_id=${context.tenantId}::uuid AND policy_definition_id=${id}::uuid`.execute(tx)).rows[0];
    const release = (await sql<Row>`SELECT id,activated_at FROM control.process_task_rule_release WHERE tenant_id=${context.tenantId}::uuid AND policy_definition_id=${id}::uuid`.execute(tx)).rows[0];
    return { definition, tests, results, proposal, release, status: state.status, createdBy: state.created_by, hash: state.definition_hash };
  }
  async function receipt(context: VerifiedRequestContext, action: string, key: string, body: unknown, tx: Tx, work: () => Promise<object>) {
    if (typeof key !== "string" || key.trim() !== key || key.length < 8 || key.length > 160) bad("TASK_POLICY_KEY_REQUIRED");
    const code = `studio.task_edit_policy.${action}`, fingerprint = createHash("sha256").update(processSelectionCanonical({ actor: context.principalId, body })).digest("hex");
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:${code}:${key}`},0))`.execute(tx);
    const prior = (await sql<Row>`SELECT * FROM event.command_execution WHERE tenant_id=${context.tenantId}::uuid AND command_code=${code} AND idempotency_key=${key}`.execute(tx)).rows[0];
    if (prior) { if (prior.request_fingerprint !== fingerprint || prior.actor_principal_id !== context.principalId) bad("TASK_POLICY_REPLAY_CONFLICT", 409); return { ...prior.result_payload, replayed: true }; }
    const result = await work();
    await sql`INSERT INTO event.command_execution(tenant_id,command_code,idempotency_key,request_fingerprint,status,actor_principal_id,source_service,result_payload,started_at,completed_at,created_by)
      VALUES(${context.tenantId}::uuid,${code},${key},${fingerprint},'succeeded',${context.principalId}::uuid,'studio.task-edit-policy',${JSON.stringify(result)}::jsonb,now(),now(),${context.principalId}::uuid)`.execute(tx);
    return { ...result, replayed: false };
  }
  return {
    baselines: (context: VerifiedRequestContext) => run(context, "read", (tx, context) => taskRuleBaselines(context.tenantId, tx)),
    read: (context: VerifiedRequestContext, id: string) => run(context, "read", (tx, context) => get(context, id, tx)),
    author: (context: VerifiedRequestContext, body: unknown, key: string) => run(context, "author", (tx, context) => receipt(context, "author", key, body, tx, async () => {
      if (!object(body) || Object.keys(body).some(k => !["definition", "tests", "predecessorId", "processBinding"].includes(k)) || !object(body.definition) || !Array.isArray(body.tests) || body.tests.length < 4 || body.tests.length > 100) bad("TASK_POLICY_DRAFT_INVALID");
      const raw = body.definition;
      if (Object.keys(raw).some(k => !["name", "priority", "evaluationMode", "effectiveFrom", "effectiveUntil", "versionNo", "rules"].includes(k)) || typeof raw.name !== "string" || raw.name.length > 200 || !Array.isArray(raw.rules) || raw.rules.length > 100 || !Number.isSafeInteger(raw.versionNo) || raw.versionNo < 1 || !Number.isSafeInteger(raw.priority) || raw.priority < 1 || raw.priority > 32767 || typeof raw.effectiveFrom !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.effectiveFrom) || !Number.isFinite(Date.parse(raw.effectiveFrom)) || (raw.effectiveUntil !== undefined && (typeof raw.effectiveUntil !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.effectiveUntil) || Date.parse(raw.effectiveUntil) < Date.parse(raw.effectiveFrom)))) bad("TASK_POLICY_DEFINITION_INVALID");
      const definition = { ...raw, id: randomUUID(), tenantId: context.tenantId, entityType: "workflow.task_edit", rules: raw.rules.map((r: unknown) => {
        if (!object(r) || !object(r.condition) || !object(r.actionConfig) || !["deny", "full_reapproval"].includes(r.actionConfig.effect) || !object(r.metadata) || !Number.isSafeInteger(r.priority) || r.priority < 1 || r.priority > 32767 || Object.keys(r).some(k => !["priority", "condition", "action", "actionConfig", "metadata", "explanation"].includes(k))) bad("TASK_POLICY_RULE_INVALID");
        return { ...r, id: randomUUID() };
      }) } as unknown as PolicyDefinition;
      const { repository, service } = owner(context), errors = service.validate(definition);
      if (errors.length) throw new HttpError(422, "TASK_POLICY_VALIDATION_FAILED", errors.join("; "));
      const tests = body.tests as Omit<PolicyTestCase, "id" | "definitionId">[];
      if (tests.some(t => !object(t) || Object.keys(t).some(k => !["code", "name", "input", "expected"].includes(k)) || typeof t.code !== "string" || !/^[a-z][a-z0-9_.-]{1,126}$/.test(t.code) || typeof t.name !== "string" || !t.name.trim() || !object(t.input) || !object(t.expected) || !Object.keys(t.expected).length) || new Set(tests.map(t => t.code)).size !== tests.length || ["positive", "negative", "overlap", "missing"].some(code => !tests.some(t => t.code === code || t.code.startsWith(code + ".")))) bad("TASK_POLICY_FIXTURES_REQUIRED");
      for (const test of tests) {
        const kind = test.code.split(".")[0];
        if ((kind === "positive" && test.expected.action !== "require_workflow") ||
          (["negative", "overlap"].includes(kind!) && test.expected.action !== "deny") ||
          (kind === "missing" && !["none", "deny"].includes(String(test.expected.action)))) bad("TASK_POLICY_FIXTURE_EXPECTATION_INVALID");
      }
      if (body.predecessorId !== undefined && !uuid(body.predecessorId)) bad("TASK_POLICY_PREDECESSOR_INVALID");
      const saved = await repository.createDraft({ definition, rules: definition.rules, tests, ...(body.predecessorId ? { predecessorId: body.predecessorId } : {}) }, tx);
      const results = await service.runAllTests(saved.id, tx);
      if (results.some(r => !r.passed)) throw new HttpError(422, "TASK_POLICY_TESTS_FAILED", "Publication fixtures failed; correct the draft and try again");
      await repository.requestApproval(saved.id, tx);
      if (body.processBinding !== undefined) {
        const pending = await get(context,saved.id,tx);
        await proposeTaskRules({ tenantId: context.tenantId, principalId: context.principalId, definitionId: saved.id, version: saved.versionNo, hash: pending.hash, effectiveOn: saved.effectiveFrom, binding: body.processBinding },tx);
      }
      return get(context, saved.id, tx);
    })),
    publish: (context: VerifiedRequestContext, id: string, key: string) => run(context, "publish", (tx, context) => receipt(context, "publish", key, { id }, tx, async () => {
      const current = await get(context, id, tx);
      if (current.createdBy === context.principalId) bad("TASK_POLICY_MAKER_CHECKER_REQUIRED", 403);
      await owner(context).service.activate(id, tx);
      await publishTaskRules(context.tenantId,context.principalId,id,tx);
      const result = await get(context, id, tx);
      await sql`INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,actor_id,source,payload,created_by)
        VALUES(${context.tenantId}::uuid,'policy','workflow.task_edit.published',${`task-edit-policy:${id}:published`},'policy_definition',${id}::uuid,${context.principalId}::uuid,'studio.task-edit-policy',${JSON.stringify({ definitionId: id, version: result.definition!.versionNo, hash: result.hash })}::jsonb,${context.principalId}::uuid)`.execute(tx);
      return result;
    }), id),
  };
}
export function mountTaskEditPolicyAuthoring(app: Application, options: { authenticate: RequestHandler; readContext(response: Response): VerifiedRequestContext; service: ReturnType<typeof createTaskEditPolicyAuthoring> }) {
  registerContractRoute(app,defineRouteContract({ method:"get",path:"/api/studio/supplier-task-rule-baselines",operationId:"studio.task_rules.baselines",summary:"Read published supplier task baselines",tags:["Studio"],authenticated:true,responses:{200:{description:"Published baselines",body:{type:"array",items:{type:"object",additionalProperties:true}}}} }),options.authenticate,async(req,res,next)=>{try{res.setHeader("Cache-Control","private, no-store"); if(Object.keys(req.query).length)bad("TASK_POLICY_INPUT_INVALID");res.json(await options.service.baselines(options.readContext(res)));}catch(error){next(error);}});
  for (const action of ["author", "read", "publish"] as const) registerContractRoute(app, defineRouteContract({ method: action === "read" ? "get" : "post", path: `/api/studio/task-edit-policies${action === "author" ? "" : "/:id"}${action === "publish" ? "/publish" : ""}`, operationId: `studio.task_edit_policy.${action}`, summary: `${action} supplier edit-policy revision`, tags: ["Studio"], authenticated: true, responses: { 200: { description: "Policy revision", body: { type: "object", additionalProperties: true } }, 403: { description: "Forbidden" }, 409: { description: "Revision conflict" } } }), options.authenticate, async (req, res, next) => {
    try {
      res.setHeader("Cache-Control", "private, no-store");
      if (Object.keys(req.query).length || (action === "publish" && Object.keys(req.body ?? {}).length)) bad("TASK_POLICY_INPUT_INVALID");
      const context = options.readContext(res), id = String(req.params.id ?? ""), key = req.get("Idempotency-Key") ?? "";
      res.json(action === "author" ? await options.service.author(context, req.body, key) : action === "publish" ? await options.service.publish(context, id, key) : await options.service.read(context, id));
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (["23505", "40001", "55000"].includes(code ?? "")) next(new HttpError(409,"TASK_POLICY_REVISION_CONFLICT","The policy revision or process baseline changed. Reload before retrying."));
      else if (["23514", "22P02", "22007", "22008"].includes(code ?? "")) next(new HttpError(422,"TASK_POLICY_INPUT_INVALID","The policy definition contains an invalid value."));
      else next(error);
    }
  });
}

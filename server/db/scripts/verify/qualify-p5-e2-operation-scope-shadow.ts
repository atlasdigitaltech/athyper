#!/usr/bin/env tsx
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";

import { NoopAuthorizationDecisionAuditSink, ProductionAuthorizationDecisionService } from "../../../packages/services/iam/authorization-runtime/decision.service.js";
import { NormalizedOperationScopeAuthorizationRepository } from "../../../packages/services/iam/authorization-runtime/normalized-operation-scope-repository.js";
import { OperationScopeShadowComparator } from "../../../packages/services/iam/authorization-runtime/operation-scope-shadow.js";
import { SqlOperationScopeShadowSink } from "../../../packages/services/iam/authorization-runtime/sql-operation-scope-shadow-sink.js";

const ACTOR = "00000000-0000-0000-0000-000000000000";
const ADMITTED_TENANT = "11111111-1111-4111-8111-111111111111";
const ADMITTED_PRINCIPAL = "22222222-2222-4222-8222-222222222222";
const MISSING_TENANT = "33333333-3333-4333-8333-333333333333";
const MISSING_PRINCIPAL = "44444444-4444-4444-8444-444444444444";
const RECORD_ID = "55555555-5555-4555-8555-555555555555";

function argument(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
}

interface Corpus {
  contractVersion: string;
  scenarios: Array<{
    code: string;
    authorityFixture: "none" | "admitted_without_grant";
    expectedDecision: "allow" | "deny";
    expectedReason: string;
  }>;
}

interface Binding {
  plane_code: "neon" | "mesh";
  entity_code: string;
  source_entity_id: string;
  source_entity_operation_id: string;
  source_release_hash: string;
  source_compiled_hash: string;
  operation_key: string;
  decision_mode: "entity_resource" | "collection";
  scope_kind: string;
}

async function seedAdmittedWithoutGrant(pool: pg.Pool, expectedDatabase: string, plane: "neon" | "mesh"): Promise<void> {
  const client = await pool.connect();
  try {
    const identity = await client.query<{ database_name: string }>("SELECT current_database() AS database_name");
    if (identity.rows[0]?.database_name !== expectedDatabase) throw new Error("shadow.database_guard");
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.database_plane',$1,true),set_config('app.current_tenant_id',$2,true),set_config('app.current_principal_id',$3,true)", [plane, ADMITTED_TENANT, ACTOR]);
    await client.query(`INSERT INTO master.tenant (id,code,name,display_name,realm_key,status,created_by)
      VALUES ($1::uuid,$2,'P5-E2 Qualification','P5-E2 Qualification',$2,'active',$3::uuid)
      ON CONFLICT (id) DO NOTHING`, [ADMITTED_TENANT, `p5e2_${plane}`, ACTOR]);
    await client.query(`INSERT INTO master.principal (id,tenant_id,code,name,principal_type,status,created_by)
      VALUES ($1::uuid,$2::uuid,$3,'P5-E2 Shadow Principal','user','active',$4::uuid)
      ON CONFLICT (id) DO NOTHING`, [ADMITTED_PRINCIPAL, ADMITTED_TENANT, `p5e2.${plane}.shadow`, ACTOR]);
    await client.query(`INSERT INTO master.principal_identity_binding (
      id,tenant_id,principal_id,provider_code,realm_key,subject_id,status,sync_status,synced_at,created_by
    ) VALUES (md5($1)::uuid,$2::uuid,$3::uuid,'keycloak',$4,$5,'active','synced',now(),$6::uuid)
      ON CONFLICT (id) DO NOTHING`, [`p5e2:${plane}:identity`, ADMITTED_TENANT, ADMITTED_PRINCIPAL,
        `p5e2_${plane}`, `p5e2-${plane}-shadow`, ACTOR]);
    await client.query(`INSERT INTO authz.plane_membership (
      id,tenant_id,principal_id,membership_kind,source_type,source_ref,status,created_by
    ) VALUES (md5($1)::uuid,$2::uuid,$3::uuid,'standard','seed',$4,'active',$5::uuid)
      ON CONFLICT (id) DO NOTHING`, [`p5e2:${plane}:membership`, ADMITTED_TENANT,
        ADMITTED_PRINCIPAL, `p5-e2-golden-corpus:${plane}`, ACTOR]);
    await client.query(`INSERT INTO master.tenant (id,code,name,display_name,realm_key,status,created_by)
      VALUES ($1::uuid,$2,'P5-E2 Missing Identity','P5-E2 Missing Identity',$2,'active',$3::uuid)
      ON CONFLICT (id) DO NOTHING`, [MISSING_TENANT, `p5e2_missing_${plane}`, ACTOR]);
    await client.query(`INSERT INTO master.principal (id,tenant_id,code,name,principal_type,status,created_by)
      VALUES ($1::uuid,$2::uuid,$3,'P5-E2 Identity-less Principal','user','active',$4::uuid)
      ON CONFLICT (id) DO NOTHING`, [MISSING_PRINCIPAL, MISSING_TENANT, `p5e2.${plane}.identityless`, ACTOR]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function qualify(input: { plane: "neon" | "mesh"; url: string; database: string; corpus: Corpus; runId: string }): Promise<{ samples: number; matches: number; mismatches: number; errors: number; persisted: number }> {
  const pool = new pg.Pool({ connectionString: input.url });
  await seedAdmittedWithoutGrant(pool, input.database, input.plane);
  const db = new Kysely<never>({ dialect: new PostgresDialect({ pool }) });
  try {
    const bindingResult = await pool.query<Binding>(`SELECT binding.plane_code,binding.entity_code,
      binding.source_entity_id::text,binding.source_entity_operation_id::text,
      binding.source_release_hash,binding.source_compiled_hash,binding.operation_key,
      binding.decision_mode::text,binding.scope_kind::text
      FROM authz.entity_operation_scope_binding binding
      WHERE binding.plane_code=$1 AND binding.status='published'
      ORDER BY binding.entity_code,binding.operation_key`, [input.plane]);
    if (bindingResult.rows.length === 0) throw new Error(`shadow.bindings_missing:${input.plane}`);
    const repository = new NormalizedOperationScopeAuthorizationRepository(db, {
      plane: input.plane,
      expectedDatabaseName: input.database,
      entitlementResolver: { resolve: async () => ({
        available: true,
        evidenceId: `p5-e2-golden-corpus:${input.plane}`,
        semantics: input.plane === "mesh" ? "mesh_account_entitlement" : "neon_plan_module_feature",
      }) },
    });
    const candidate = new ProductionAuthorizationDecisionService(repository, new NoopAuthorizationDecisionAuditSink());
    const comparator = new OperationScopeShadowComparator(new SqlOperationScopeShadowSink(db));
    let matches = 0;
    let mismatches = 0;
    let errors = 0;
    for (const binding of bindingResult.rows) {
      for (const scenario of input.corpus.scenarios) {
        const admitted = scenario.authorityFixture === "admitted_without_grant";
        const tenantId = admitted ? ADMITTED_TENANT : MISSING_TENANT;
        const principalId = admitted ? ADMITTED_PRINCIPAL : MISSING_PRINCIPAL;
        const requestId = `p5-e2:${input.plane}:${binding.operation_key}:${scenario.code}`;
        const coordinate = {
          plane: input.plane,
          entityCode: binding.entity_code,
          sourceEntityOperationId: binding.source_entity_operation_id,
          sourceReleaseHash: binding.source_release_hash,
          sourceArtifactHash: binding.source_compiled_hash,
        };
        let observed: { decision: string; reason: string } | null = null;
        await comparator.evaluate({
          coordinate,
          context: { tenantId, principalId, requestId, correlationId: input.runId, cohortCode: scenario.code },
          mode: "shadow",
          legacy: async () => ({
            value: scenario.expectedDecision,
            comparable: {
              decision: scenario.expectedDecision,
              reason: scenario.expectedReason,
              fingerprint: createHash("sha256").update(`${input.corpus.contractVersion}:${scenario.code}`).digest("hex"),
            },
          }),
          candidate: async () => {
            if (binding.decision_mode === "collection") {
              const envelope = await candidate.materialize({
                requestId, mode: "collection", evaluatedAt: new Date(),
                subject: { plane: input.plane, tenantOrAccountId: tenantId, principalId },
                assurance: admitted ? { mfaSatisfied: true, sodSatisfied: true, hardPolicySatisfied: true } : undefined,
                entityOperationId: binding.source_entity_operation_id,
              });
              observed = { decision: envelope.decision, reason: envelope.reason };
              return { value: envelope.decision, comparable: {
                decision: envelope.decision, reason: envelope.reason,
                fingerprint: envelope.authorizationFingerprint,
              } };
            }
            const envelope = await candidate.decide({
              requestId,
              mode: "entity_resource",
              evaluatedAt: new Date(),
              subject: { plane: input.plane, tenantOrAccountId: tenantId, principalId },
              assurance: admitted
                ? { mfaSatisfied: true, sodSatisfied: true, hardPolicySatisfied: true }
                : undefined,
              entityOperationId: binding.source_entity_operation_id,
              resource: {
                tenantOrAccountId: tenantId,
                entityId: binding.source_entity_id,
                recordId: RECORD_ID,
                dimensions: binding.scope_kind === "tenant" ? {} : { [binding.scope_kind]: RECORD_ID },
              },
            });
            observed = { decision: envelope.result.decision, reason: envelope.result.reason };
            return { value: envelope.result.decision, comparable: {
              decision: envelope.result.decision,
              reason: envelope.result.reason,
              fingerprint: envelope.authorizationFingerprint,
            } };
          },
        });
        if (!observed) errors += 1;
        else if (observed.decision === scenario.expectedDecision && observed.reason === scenario.expectedReason) matches += 1;
        else mismatches += 1;
      }
    }
    const samples = bindingResult.rows.length * input.corpus.scenarios.length;
    const evidence = await pool.query<{ persisted: number; mismatches: number; errors: number }>(`SELECT
      count(*)::int AS persisted,
      count(*) FILTER (WHERE comparison_status='mismatch')::int AS mismatches,
      count(*) FILTER (WHERE comparison_status='candidate_error')::int AS errors
      FROM ops.authorization_shadow_comparison WHERE correlation_id=$1::uuid`, [input.runId]);
    const row = evidence.rows[0]!;
    if (Number(row.persisted) !== samples || Number(row.mismatches) !== mismatches || Number(row.errors) !== errors) {
      throw new Error(`shadow.persistence_incomplete:${input.plane}`);
    }
    return { samples, matches, mismatches, errors, persisted: Number(row.persisted) };
  } finally {
    await db.destroy();
  }
}

const neonUrl = argument("--neon-url") ?? process.env["NEON_DATABASE_URL"];
const meshUrl = argument("--mesh-url") ?? process.env["MESH_DATABASE_URL"];
const neonDatabase = argument("--neon-database");
const meshDatabase = argument("--mesh-database");
if (!neonUrl || !meshUrl || !neonDatabase || !meshDatabase) throw new Error("Explicit Neon and Mesh URLs/database guards are required.");
const corpus = JSON.parse(await readFile(resolve(import.meta.dirname, "config/p5-e2-operation-scope-golden-corpus.v1.json"), "utf8")) as Corpus;
const runId = randomUUID();
const neon = await qualify({ plane: "neon", url: neonUrl, database: neonDatabase, corpus, runId });
const mesh = await qualify({ plane: "mesh", url: meshUrl, database: meshDatabase, corpus, runId });
const total = { samples: neon.samples + mesh.samples, matches: neon.matches + mesh.matches,
  mismatches: neon.mismatches + mesh.mismatches, errors: neon.errors + mesh.errors,
  persisted: neon.persisted + mesh.persisted };
if (total.mismatches > 0 || total.errors > 0) throw new Error(`P5_E2_SHADOW_FAILED ${JSON.stringify({ neon, mesh, total })}`);
process.stdout.write(JSON.stringify({ status: "passed", runId, corpus: corpus.contractVersion, neon, mesh, total,
  activationQualified: false,
  activationReason: "Initial golden-corpus smoke is below the 1000-sample and 24-hour production activation thresholds; legacy remains authoritative.",
}, null, 2) + "\n");

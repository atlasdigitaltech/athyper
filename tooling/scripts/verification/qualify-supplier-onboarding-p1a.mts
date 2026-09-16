/** Real PostgreSQL qualification in a rolled-back transaction; canonical DDL, no migration. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fixture } from "../../../server/packages/platform/governance/src/process-selection/fixture.test-helper.js";
import {
  createKyselyPolicyRepository,
  createPolicyService,
  createJsonRuleEvaluator,
  calculateDefinitionHash,
} from "../../../server/packages/platform/policy/src/index.js";
import {
  createProcessSelectionCatalog,
  processCatalogContentHash,
  createKyselyProcessSelectionPublicationRepository,
  processManifestHash,
} from "../../../server/packages/platform/control-admin/src/index.js";
import {
  createKyselyProcessSelectionEvidenceRepository,
  createProcessSelectionService,
} from "../../../server/packages/platform/governance/src/index.js";
const require = createRequire(
  new URL("../../../server/db/package.json", import.meta.url),
);
const { Pool } = require("pg"),
  { Kysely, PostgresDialect, sql } = require("kysely");
const host = execFileSync(
  "docker",
  [
    "inspect",
    "--format",
    "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}",
    "athyper-dev-db-1",
  ],
  { encoding: "utf8" },
).trim();
const password = readFileSync(
  `${process.env.HOME}/.athyper/instances/dev/secrets/postgres-password`,
  "utf8",
).trim();
const db = new Kysely({
  dialect: new PostgresDialect({
    pool: new Pool({
      host,
      user: "postgres",
      database: "athyper_neon",
      password,
    }),
  }),
});
const report: any = {
  at: new Date().toISOString(),
  mode: "real PostgreSQL; all qualification writes rolled back",
  checks: [],
};
const rollback = new Error("QUALIFICATION_ROLLBACK");
try {
  await db.transaction().execute(async (tx: any) => {
    for (const [schema, table] of [
      ["control", "process_selection_publication"],
      ["control", "process_selection_catalog_revision"],
      ["governance", "process_selection_evidence"],
    ]) {
      if (
        (
          await sql`SELECT to_regclass(${schema + "." + table}) AS object`.execute(
            tx,
          )
        ).rows[0].object
      )
        continue;
      const source = readFileSync(
        `server/db/ddl/common/${schema}/03_tables.sql`,
        "utf8",
      );
      const start = source.indexOf(`CREATE TABLE ${schema}.${table} (`);
      assert.ok(start >= 0);
      await sql
        .raw(source.slice(start, source.indexOf("\n);", start) + 4))
        .execute(tx);
    }
    for (const [schema, fn, trigger] of [
      [
        "control",
        "trg_reject_process_publication_mutation",
        "process_selection_publication_immutable",
      ],
      [
        "governance",
        "trg_reject_process_selection_mutation",
        "process_selection_evidence_immutable",
      ],
    ]) {
      const f = readFileSync(
        `server/db/ddl/common/${schema}/07_functions.sql`,
        "utf8",
      );
      await sql
        .raw(f.slice(f.indexOf(`CREATE OR REPLACE FUNCTION ${schema}.${fn}`)))
        .execute(tx);
      const t = readFileSync(
        `server/db/ddl/common/${schema}/08_triggers.sql`,
        "utf8",
      );
      if (
        !(
          await sql`SELECT 1 FROM pg_trigger WHERE tgname=${trigger}`.execute(
            tx,
          )
        ).rows.length
      ) {
        const start = t.indexOf(`CREATE TRIGGER ${trigger}`);
        await sql.raw(t.slice(start, t.indexOf(";", start) + 1)).execute(tx);
      }
    }
    const constraints = readFileSync(
      "server/db/ddl/common/governance/05_constraints.sql",
      "utf8",
    );
    if (
      !(
        await sql`SELECT 1 FROM pg_constraint WHERE conname='process_selection_case_fk'`.execute(
          tx,
        )
      ).rows.length
    )
      await sql
        .raw(
          constraints.slice(
            constraints.indexOf(
              "ALTER TABLE governance.process_selection_evidence",
            ),
          ),
        )
        .execute(tx);
    const publicationConstraints = readFileSync(
      "server/db/ddl/common/control/05_constraints.sql",
      "utf8",
    );
    if (
      !(
        await sql`SELECT 1 FROM pg_constraint WHERE conname='process_selection_company_period_excl'`.execute(
          tx,
        )
      ).rows.length
    )
      await sql
        .raw(
          publicationConstraints.slice(
            publicationConstraints.indexOf(
              "ALTER TABLE control.process_selection_publication",
            ),
          ),
        )
        .execute(tx);
    const p: any = fixture();
    p.scope.tenantId = "44444444-4444-4444-8444-444444444444";
    p.definition.tenantId = p.scope.tenantId;
    p.definition.name = "Supplier onboarding qualification (rolled back)";
    p.minimumControls[0].minimumProfile = "simple";
    for (const m of p.manifests) m.revision.hash = processManifestHash(m);
    p.definition.definitionHash = calculateDefinitionHash(p.definition);
    p.policy.hash = p.definition.definitionHash;
    const principal = "cca94907-7519-5871-8e3c-6b11aa545c93";
    async function insertPolicy(d: any) {
      await sql`INSERT INTO control.policy_definition(id,tenant_id,entity_type,name,priority,evaluation_mode,effective_from,version_no,definition_hash,status,created_by)
    VALUES(${d.id}::uuid,${d.tenantId}::uuid,${d.entityType},${d.name},${d.priority},${d.evaluationMode},${d.effectiveFrom}::date,${d.versionNo},${d.definitionHash},'active',${principal}::uuid)`.execute(
        tx,
      );
      for (const r of d.rules)
        await sql`INSERT INTO control.policy_rule(id,policy_definition_id,priority,condition_expr,action_code,action_config,metadata,created_by)
    VALUES(${r.id}::uuid,${d.id}::uuid,${r.priority},${JSON.stringify(r.condition)}::jsonb,${r.action},${JSON.stringify(r.actionConfig)}::jsonb,${JSON.stringify(r.metadata)}::jsonb,${principal}::uuid)`.execute(
          tx,
        );
    }
    await insertPolicy(p.definition);
    const registry = new Set<string>();
    const compiler = {
      evaluator: createJsonRuleEvaluator(),
      isPublished: async (kind: string, r: any, scope: any) =>
        Object.keys(p.scope).every((k) => scope[k] === p.scope[k]) &&
        registry.has(`${kind}:${r.id}:${r.version}:${r.hash}`),
    };
    // Controlled P3/P4 catalog authority, explicitly separate from real SQL policy and evidence owners.
    const collect = (kind: string, r: any) =>
      registry.add(`${kind}:${r.id}:${r.version}:${r.hash}`);
    collect("policy", p.policy);
    collect("fact_schema", p.factSchema);
    for (const c of p.minimumControls) collect("minimum_control", c.authority);
    for (const m of p.manifests) {
      collect("profile", m.profile);
      collect("manifest", m.revision);
      collect("cycle", m.cycle);
      for (const t of m.tasks) {
        if (t.workflow) collect("workflow", t.workflow);
        if (t.reviewerPolicy) collect("reviewer_policy", t.reviewerPolicy);
      }
      for (const d of m.documents) {
        collect("template", d.template);
        collect("projection", d.projection);
        collect("recipient_policy", d.recipientPolicy);
      }
    }
    const publications = createKyselyProcessSelectionPublicationRepository();
    await publications.publish(
      {
        id: randomUUID(),
        publication: p,
        effectiveFrom: "2026-09-14T00:00:00Z",
        actorPrincipalId: principal,
      },
      compiler,
      tx,
    );
    await assert.rejects(
      () =>
        publications.publish(
          {
            id: randomUUID(),
            publication: p,
            effectiveFrom: "2026-09-14T00:00:00Z",
            actorPrincipalId: principal,
          },
          compiler,
          tx,
        ),
      /OVERLAP/,
    );
    report.checks.push("compiled publication and overlapping-scope rejection");
    for (const scope of [
      { ...p.scope, planeKey: "mesh" },
      { ...p.scope, companyCodeId: null },
      { ...p.scope, tenantId: randomUUID() },
      { ...p.scope, operatingOrganizationId: randomUUID() },
    ])
      assert.deepEqual(
        await publications.resolve(scope, "2026-09-14T01:00:00Z", tx),
        [],
      );
    report.checks.push(
      "exact tenant, plane, organization and company scope isolation",
    );
    await sql.raw("SAVEPOINT overlap_constraint").execute(tx);
    await assert.rejects(
      () =>
        sql`INSERT INTO control.process_selection_publication(id,tenant_id,plane_key,process_family,operating_organization_id,company_code_id,policy_definition_id,policy_version,policy_hash,publication,effective_from,effective_until,created_by)
      SELECT ${randomUUID()}::uuid,tenant_id,plane_key,process_family,operating_organization_id,company_code_id,policy_definition_id,policy_version,policy_hash,publication,effective_from,effective_until,created_by FROM control.process_selection_publication`.execute(
          tx,
        ),
      /exclusion constraint/,
    );
    await sql.raw("ROLLBACK TO SAVEPOINT overlap_constraint").execute(tx);
    report.checks.push("database exclusion rejects overlapping direct inserts");
    const context: any = {
      planeKey: "neon",
      tenantId: p.scope.tenantId,
      principalId: principal,
    };
    const facts: any = {
      scope: p.scope,
      caseId: randomUUID(),
      snapshot: { id: randomUUID(), version: 1, hash: "f".repeat(64) },
      requestedRequirement: "basic",
      reason: "P1a synthetic qualification",
      minimumControls: structuredClone(p.minimumControls),
      authorityAsOf: "2026-09-14T01:00:00.000Z",
    };
    const policy = createPolicyService({
      repository: createKyselyPolicyRepository(),
      transactions: {
        run: async () => {
          throw Error("must use caller transaction");
        },
      },
      audit: {
        record: async () => {
          throw Error("generic audit must not run");
        },
      },
    });
    const evidence = createKyselyProcessSelectionEvidenceRepository();
    const service = createProcessSelectionService({
      facts: async () => facts,
      publications: publications.resolve,
      compiler: () => compiler,
      policy,
      evidence,
    });
    for (const [level, code] of [
      ["basic", "simple"],
      ["standard", "standard"],
      ["enhanced", "enhanced"],
    ]) {
      facts.requestedRequirement = level;
      const preview = await service.preview(context, facts.caseId, tx);
      assert.equal(preview.status, "ready", JSON.stringify(preview));
      if (preview.status !== "ready") throw Error("preview unavailable");
      assert.equal(preview.selection.effectiveProfile.code, code);
      const coordinate = {
        scope: p.scope,
        caseId: facts.caseId,
        submissionSnapshot: facts.snapshot,
        manifest: preview.selection.executionManifest.revision,
        selectionId: randomUUID(),
        cycleRunId: randomUUID(),
        attemptId: randomUUID(),
        attemptNumber: report.checks.length,
      };
      const key = randomUUID();
      const accepted = await service.select(
        context,
        facts.caseId,
        coordinate,
        key,
        tx,
      );
      assert.deepEqual(
        await evidence.get(p.scope, coordinate.selectionId, tx),
        accepted,
      );
      assert.deepEqual(
        await evidence.append(
          { ...accepted, acceptedAt: "2026-09-15T00:00:00Z" },
          tx,
        ),
        accepted,
      );
      await assert.rejects(
        () =>
          evidence.append({ ...accepted, reason: "conflicting evidence" }, tx),
        /EVIDENCE_CONFLICT/,
      );
      report.checks.push({
        level,
        profile: code,
        trace: accepted.trace,
        factHash: accepted.factHash,
        evidenceRoundtrip: true,
        replayStable: true,
        conflictRejected: true,
      });
    }
    // A newer policy row is active, but exact evaluation remains on the pinned row/version/hash.
    const successor = {
      ...p.definition,
      id: randomUUID(),
      versionNo: 2,
      rules: p.definition.rules.map((r: any) => ({ ...r, id: randomUUID() })),
    };
    successor.definitionHash = calculateDefinitionHash(successor);
    await insertPolicy(successor);
    const exact = await policy.evaluateExact(
      {
        context,
        entityType: p.definition.entityType,
        revision: p.policy,
        effectiveOn: "2026-09-14",
        facts: { request: { requestedComplianceLevel: "enhanced" } },
      },
      tx,
    );
    assert.equal(exact.definition.versionNo, 1);
    report.checks.push("new active successor does not retarget exact revision");
    await sql.raw("SAVEPOINT policy_immutability").execute(tx);
    await assert.rejects(
      () =>
        sql`UPDATE control.policy_rule SET action_code='allow' WHERE id=${p.definition.rules[0].id}::uuid`.execute(
          tx,
        ),
      /immutable|published/i,
    );
    await sql.raw("ROLLBACK TO SAVEPOINT policy_immutability").execute(tx);
    report.checks.push(
      "existing policy owner prevents published rule mutation",
    );
    await assert.rejects(
      () =>
        policy.evaluateExact(
          {
            context,
            entityType: p.definition.entityType,
            revision: { ...p.policy, hash: "b".repeat(64) },
            effectiveOn: "2026-09-14",
            facts: {},
          },
          tx,
        ),
      /EXACT_REVISION_UNAVAILABLE/,
    );
    report.checks.push("wrong exact hash never falls back to active policy");
    for (const [schema, table] of [
      ["control", "process_selection_publication"],
      ["governance", "process_selection_evidence"],
    ]) {
      await sql.raw("SAVEPOINT immutability").execute(tx);
      await assert.rejects(
        () => sql.raw(`DELETE FROM ${schema}.${table}`).execute(tx),
        /IMMUTABLE/,
      );
      await sql.raw("ROLLBACK TO SAVEPOINT immutability").execute(tx);
    }
    report.checks.push(
      "database rejects mutation of publication and selection evidence",
    );
    const liveCatalog = createProcessSelectionCatalog({
      planeKey: "neon",
      workflow: async () => false,
    });
    const content = {
      owner: "business_partner",
      minimumProfile: "standard",
      mandatoryGateCodes: ["supplier.readiness"],
    };
    const authority = {
      id: randomUUID(),
      version: 1,
      hash: processCatalogContentHash(content),
      owner: content.owner,
    };
    await sql`INSERT INTO control.process_selection_catalog_revision(id,tenant_id,plane_key,process_family,operating_organization_id,company_code_id,kind,version,content_hash,definition,effective_from,published_by)
      VALUES(${authority.id}::uuid,${p.scope.tenantId}::uuid,'neon',${p.scope.processFamily},${p.scope.operatingOrganizationId}::uuid,${p.scope.companyCodeId}::uuid,'minimum_control',1,${authority.hash},${JSON.stringify(content)}::jsonb,'2026-09-14',${principal}::uuid)`.execute(
      tx,
    );
    const controls = await liveCatalog.minimumControls(
      p.scope,
      "2026-09-14T01:00:00Z",
      tx,
    );
    assert.equal(controls.length, 1);
    assert.equal(controls[0].minimumProfile, "standard");
    const lookup = liveCatalog.compiler(tx).isPublished;
    assert.equal(await lookup("minimum_control", authority, p.scope), true);
    for (const pin of [
      { ...authority, hash: "0".repeat(64) },
      { ...authority, owner: "incorrect" },
      { ...authority, version: 2 },
    ])
      assert.equal(await lookup("minimum_control", pin, p.scope), false);
    assert.equal(
      await lookup("minimum_control", authority, {
        ...p.scope,
        planeKey: "mesh",
      }),
      false,
    );
    assert.equal(
      await lookup("minimum_control", authority, {
        ...p.scope,
        companyCodeId: null,
      }),
      false,
    );
    const cycle = (
      await sql`SELECT id,revision_number,template_hash,cycle_type_id FROM control.cycle_template_revision WHERE tenant_id=${p.scope.tenantId}::uuid LIMIT 1`.execute(
        tx,
      )
    ).rows[0];
    assert.ok(cycle);
    const cyclePin = {
      id: cycle.id,
      version: cycle.revision_number,
      hash: cycle.template_hash,
      cycleTypeId: cycle.cycle_type_id,
    };
    assert.equal(await lookup("cycle", cyclePin, p.scope), true);
    assert.equal(
      await lookup(
        "cycle",
        { ...cyclePin, cycleTypeId: randomUUID() },
        p.scope,
      ),
      false,
    );
    report.checks.push(
      "live catalog repository verifies minimum authority, scope, content hash, owner and cycle type/revision identity",
    );
    report.passed = true;
    throw rollback;
  });
} catch (error) {
  if (error !== rollback) throw error;
} finally {
  await db.destroy();
  writeFileSync(
    "docs/architecture/business-partner/internal-supplier-onboarding-p1a-evidence.json",
    JSON.stringify(report, null, 2) + "\n",
  );
}
console.log(JSON.stringify(report));

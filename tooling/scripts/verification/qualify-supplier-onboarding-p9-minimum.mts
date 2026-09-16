/** Real PostgreSQL fault injection and gate checks; every mutation is rolled back. */
import { createSupplierProcessTasks } from "../../../server/apps/platform-host/src/composition/supplier-process-tasks.js";
import { createSupplierProcessSubmission } from "../../../server/apps/platform-host/src/composition/supplier-process-submission.js";
import { createSupplierProcessSelectionService } from "../../../server/apps/platform-host/src/composition/supplier-process-selection.js";
import { createKyselyProcessDocumentIntentPort } from "../../../server/packages/platform/governance/src/index.js";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { KyselyBusinessPartnerCaseRepository } from "../../../server/packages/services/master-data/src/kysely-business-partner-case-repository.js";
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
const db = new Kysely({
  dialect: new PostgresDialect({
    pool: new Pool({
      host,
      user: "postgres",
      database: "athyper_neon",
      password: readFileSync(
        `${process.env.HOME}/.athyper/instances/dev/secrets/postgres-password`,
        "utf8",
      ).trim(),
    }),
  }),
});
import { processCatalogContentHash } from "../../../server/packages/platform/control-admin/src/index.js";
import { createBusinessPartnerRequestValidator } from "../../../server/packages/services/master-data/src/business-partner-request-validator.js";
const tenant = "44444444-4444-4444-8444-444444444444",
  actor = "cca94907-7519-5871-8e3c-6b11aa545c93";
const context: any = {
  tenantId: tenant,
  principalId: actor,
  planeKey: "neon",
  requestId: randomUUID(),
  profileHash: "p9",
};
const repository = new KyselyBusinessPartnerCaseRepository();
const selection = createSupplierProcessSelectionService({
  repository,
  authorizer: { authorize: async () => ({ allowed: true }) },
  audit: {} as never,
  transactions: {} as never,
  authenticate: (() => {}) as never,
  readContext: () => context,
});
const owner = createSupplierProcessSubmission({
  selection,
  documents: createKyselyProcessDocumentIntentPort(),
  submitCase: (command, tx) =>
    repository.submitForProcess(
      {
        tenantId: tenant,
        requestId: command.requestId,
        expectedVersion: command.expectedVersion,
        submittedBy: actor,
        idempotencyKey: command.idempotencyKey,
      },
      tx,
    ),
});
const tasks = createSupplierProcessTasks({
  authorizer: { authorize: async () => ({ allowed: true }) },
});
const fixtures = JSON.parse(
  readFileSync(
    "governance/policy/reports/supplier-onboarding-p9-fixtures.dev.json",
    "utf8",
  ),
).cases;
const report: any = {
  at: new Date().toISOString(),
  passed: false,
  checks: [],
  boundary:
    "Real PostgreSQL catalog, selection, submission, correction and task owners; controlled authorization and document-ready port; all writes roll back. Real render/storage is separately browser-qualified.",
};
const rollback = Error("P9_ROLLBACK");
async function setActor(tx: any, id: string) {
  await sql`SELECT set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${id},true),set_config('app.database_plane','neon',true),set_config('app.current_actor_type','user',true)`.execute(
    tx,
  );
}
try {
  for (const floor of ["standard", "enhanced"]) {
    try {
      await db.transaction().execute(async (tx: any) => {
        await setActor(tx, actor);
        const f = fixtures.find((c: any) => c.level === "basic");
        assert.ok(f);
        const content = {
          owner: "business_partner",
          minimumProfile: floor,
          mandatoryGateCodes: ["supplier.readiness", "supplier.activation"],
        };
        const authority = {
          id: randomUUID(),
          hash: processCatalogContentHash(content),
        };
        await sql`INSERT INTO control.process_selection_catalog_revision(id,tenant_id,plane_key,process_family,operating_organization_id,company_code_id,kind,version,content_hash,definition,effective_from,published_by) VALUES(${authority.id}::uuid,${tenant}::uuid,'neon','supplier_onboarding','a478f9c0-8226-5d22-9599-b8fb27a45180'::uuid,'793b6cb3-3c61-57c0-9562-2cbc288bd4cf'::uuid,'minimum_control',1,${authority.hash},${JSON.stringify(content)}::jsonb,'2026-09-14',${actor}::uuid)`.execute(
          tx,
        );
        const preview = await selection.preview(context, f.id, tx);
        assert.equal(preview.status, "ready", JSON.stringify(preview));
        if (preview.status !== "ready") throw Error("unavailable");
        assert.equal(preview.selection.candidateProfile.code, "simple");
        assert.equal(preview.selection.effectiveProfile.code, floor);
        const command = {
          context,
          requestId: f.id,
          expectedVersion: f.validatedVersion,
          idempotencyKey: randomUUID(),
        };
        await owner.lock(command, tx);
        let current = await repository.get(tenant, f.id, tx);
        assert.ok(current);
        const first = await owner.submit(command, current, tx);
        assert.ok(first.process);
        await sql`UPDATE governance.process_document_job SET status='ready',result=jsonb_build_object('status','ready','scanStatus','clean','sha256',repeat('a',64),'attachmentId',${randomUUID()}::text,'attachmentVersionId',${randomUUID()}::text,'coordinate',intent->'coordinate','template',intent->'binding'->'template','sourceSnapshot',intent->'sourceSnapshot','jobId',id::text) WHERE tenant_id=${tenant}::uuid AND id=${first.process.reviewPackJobId}::uuid`.execute(
          tx,
        );
        await tasks.start(context, f.id, tx);
        const item = (
          await sql`SELECT i.* FROM document.work_item i JOIN document.workflow_stage s ON s.tenant_id=i.tenant_id AND s.id=(i.payload->>'workflowStageId')::uuid WHERE i.tenant_id=${tenant}::uuid AND i.source_entity_id=${f.id}::uuid AND i.status='open' AND s.status='active' ORDER BY i.created_at,i.id LIMIT 1`.execute(
            tx,
          )
        ).rows[0];
        assert.ok(item);
        await setActor(tx, item.assignee_principal_id);
        await tasks.decide(
          { ...context, principalId: item.assignee_principal_id },
          f.id,
          {
            attemptId: first.process.attemptId,
            cycleTaskId: item.cycle_task_id,
            workflowRequestId: item.payload.workflowRequestId,
            workflowStageId: item.payload.workflowStageId,
            workItemId: item.id,
            expectedWorkItemVersion: Number(item.row_version),
            idempotencyKey: randomUUID(),
            action: "return",
            reason: "P9 correction with unchanged effective minimum",
          },
          tx,
        );
        await setActor(tx, actor);
        current = await repository.get(tenant, f.id, tx);
        assert.ok(current);
        const patched = await repository.patch(
          {
            tenantId: tenant,
            requestId: f.id,
            expectedVersion: current.rowVersion,
            updatedBy: actor,
            proposedPayload: {
              requestedComplianceLevel: floor,
              complianceRequirementReason:
                "P9 changed assertion retains trusted effective profile",
            },
          },
          tx,
        );
        assert.ok(patched);
        const validator = createBusinessPartnerRequestValidator({
          duplicates: {
            findExactName: async (input: any, transaction: any) =>
              (
                await sql`SELECT id,code,name FROM master.business_partner WHERE tenant_id=${input.tenantId}::uuid AND lower(name)=lower(${input.name}) LIMIT 10`.execute(
                  transaction,
                )
              ).rows,
          },
        });
        const validation = await validator.validate(
          { context, request: patched },
          tx,
        );
        assert.equal(validation.valid, true, JSON.stringify(validation));
        const valid = await repository.recordValidation(
          {
            tenantId: tenant,
            requestId: f.id,
            expectedVersion: patched.rowVersion,
            evaluatedBy: actor,
            result: validation,
          },
          tx,
        );
        assert.ok(valid);
        const correction = {
          context,
          requestId: f.id,
          expectedVersion: valid.rowVersion,
          idempotencyKey: randomUUID(),
        };
        await owner.lock(correction, tx);
        const second = await owner.submit(correction, valid, tx);
        assert.ok(second.process);
        assert.equal(first.process.cycleRunId, second.process.cycleRunId);
        assert.notEqual(first.process.attemptId, second.process.attemptId);
        assert.notEqual(
          first.process.reviewPackJobId,
          second.process.reviewPackJobId,
        );
        const attempts = (
          await sql`SELECT a.attempt_number,e.evidence->>'requestedRequirement' requirement,e.evidence->'effectiveProfile'->>'code' profile FROM governance.process_attempt a JOIN governance.process_selection_evidence e ON e.tenant_id=a.tenant_id AND e.id=a.selection_id WHERE a.tenant_id=${tenant}::uuid AND a.case_id=${f.id}::uuid ORDER BY a.attempt_number`.execute(
            tx,
          )
        ).rows;
        assert.equal(attempts.length, 2);
        assert.deepEqual(
          attempts.map((a: any) => a.requirement),
          ["basic", floor],
        );
        assert.ok(attempts.every((a: any) => a.profile === floor));
        report.checks.push({
          floor,
          authority,
          caseId: f.id,
          attempts,
          run: first.process.cycleRunId,
          newPack: true,
          changedAssertionSameEffectiveProfile: true,
        });
        throw rollback;
      });
    } catch (e) {
      if (e !== rollback) throw e;
    }
  }
  report.passed = true;
} finally {
  await db.destroy();
  writeFileSync(
    "governance/policy/reports/supplier-onboarding-p9-minimum.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
}

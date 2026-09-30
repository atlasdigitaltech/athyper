/** Production repository/SQL engineering rehearsal. All fixtures and migration
 * changes roll back; synthetic actors never represent human publication review. */
import fs from "node:fs";
import cp from "node:child_process";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { createRequire } from "node:module";

if (!process.argv.includes("--inside")) {
  const container = JSON.parse(
    cp.execFileSync("docker", ["inspect", "athyper-bp-enter-db"], {
      encoding: "utf8",
    }),
  )[0];
  assert.deepEqual(Object.keys(container.NetworkSettings.Networks), [
    "athyper-bp-enter-isolated",
  ]);
  const password = container.Config.Env.find((value: string) =>
    value.startsWith("POSTGRES_PASSWORD="),
  )?.slice("POSTGRES_PASSWORD=".length);
  assert.ok(password);
  const result = cp.spawnSync(
    "docker",
    [
      "exec",
      "-i",
      "-w",
      process.cwd(),
      "athyper-bp-dependency-studio-api",
      "node",
      "--import",
      "tsx",
      import.meta.filename,
      "--inside",
    ],
    {
      input: JSON.stringify({ password }),
      encoding: "utf8",
      maxBuffer: 2_000_000,
    },
  );
  process.stdout.write(result.stdout);
  if (result.status) {
    process.stderr.write(result.stderr);
    process.exitCode = 1;
  }
} else {
  const { password } = JSON.parse(fs.readFileSync(0, "utf8"));
  const require = createRequire(
    new URL(
      "../../../../server/packages/services/master-data/package.json",
      import.meta.url,
    ),
  );
  const { Pool } = require("pg"),
    { Kysely, PostgresDialect, sql } = require("kysely");
  const { KyselyBusinessPartnerCaseRepository } =
    await import("../../../../server/packages/services/master-data/src/kysely-business-partner-case-repository.js");
  const { KyselyGovernedInternalBusinessPartnerCaseRepository } =
    await import("../../../../server/packages/services/master-data/src/kysely-governed-internal-business-partner-repository.js");
  const {
    createBusinessPartnerCompanyPilotService,
    BP_COMPANY_PILOT_CASE_ENTITY,
  } =
    await import("../../../../server/packages/services/master-data/src/business-partner-company-pilot.js");
  const { createBusinessPartnerRequestValidator } =
    await import("../../../../server/packages/services/master-data/src/business-partner-request-validator.js");
  const { initialCaseContractSchema } =
    await import("../../../../server/packages/services/publication/src/business-partner-case-contract-service.js");
  const { companySetupCaseInitialSchema } =
    await import("../../../../server/packages/services/publication/src/business-partner-company-case-contract.js");
  const db = new Kysely({
    dialect: new PostgresDialect({
      pool: new Pool({
        host: "athyper-bp-enter-db",
        user: "postgres",
        password,
        database: "athyper_neon",
        max: 1,
      }),
    }),
  });
  const report: any = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    developmentEvidence: true,
    authenticatedJourney: false,
    releaseQualified: false,
    syntheticActors: true,
    checks: [],
  };
  const rollback = new Error("EXPECTED_PREVIEW_ROLLBACK");
  try {
    await db.transaction().execute(async (tx: any) => {
      await sql
        .raw(
          "SET LOCAL statement_timeout='30s'; SET LOCAL app.database_plane='neon'",
        )
        .execute(tx);
      const tenant = "44444444-4444-4444-8444-444444444444",
        maker = randomUUID(),
        reviewer = randomUUID();
      const stamp = async (principalId: string) =>
        sql`SELECT set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${principalId},true)`.execute(
          tx,
        );
      await stamp(maker);
      const migration = fs.readFileSync(
        "server/db/scripts/operations/upgrades/legacy-baseline-20260914/20260912_company_pilot_lifecycle.sql",
        "utf8",
      );
      report.migrationSha256 = createHash("sha256")
        .update(migration)
        .digest("hex");
      await sql
        .raw(migration.replace(/^BEGIN;\s*/m, "").replace(/COMMIT;\s*$/, ""))
        .execute(tx);
      for (const [id, code] of [
        [maker, "maker"],
        [reviewer, "reviewer"],
      ])
        await sql`INSERT INTO master.principal(id,tenant_id,code,name,principal_type,created_by) VALUES(${id}::uuid,${tenant}::uuid,${"bp.pilot.preview." + code + "." + id},${"Synthetic company preview " + code},'service_account',${id}::uuid)`.execute(
          tx,
        );
      const coordinates = (
        await sql`SELECT a.business_partner_id bp,a.operating_organization_id org,ca.company_code_id company
        FROM master.business_partner_operating_organization_assignment a
        JOIN master.operating_organization_company_assignment ca ON ca.tenant_id=a.tenant_id AND ca.operating_organization_id=a.operating_organization_id
        WHERE a.tenant_id=${tenant}::uuid AND a.status='active' AND ca.status='active' LIMIT 1`.execute(
          tx,
        )
      ).rows[0];
      assert.ok(
        coordinates,
        "Compatible seeded BP/company/organization required",
      );
      report.coordinates = coordinates;
      const { bp, org, company } = coordinates,
        customer = randomUUID(),
        payment = randomUUID(),
        accounting = randomUUID();
      await sql`INSERT INTO master.customer(id,tenant_id,business_partner_id,customer_code,customer_type,status,created_by) VALUES(${customer}::uuid,${tenant}::uuid,${bp}::uuid,${"PREVIEW." + customer.toUpperCase()},'intercompany','prospect',${maker}::uuid)`.execute(
        tx,
      );
      await sql`INSERT INTO master.business_partner_operating_organization_assignment(tenant_id,business_partner_id,operating_organization_id,partner_role,status,created_by) VALUES(${tenant}::uuid,${bp}::uuid,${org}::uuid,'customer','active',${maker}::uuid)`.execute(
        tx,
      );
      await sql`INSERT INTO master.payment_term(id,tenant_id,code,name,due_days,status,created_by) VALUES(${payment}::uuid,${tenant}::uuid,${"PV." + payment},'Synthetic preview payment',30,'draft',${maker}::uuid)`.execute(
        tx,
      );
      await sql`UPDATE master.payment_term SET status='active',status_changed_at=clock_timestamp(),status_changed_by=${maker}::uuid WHERE id=${payment}::uuid`.execute(
        tx,
      );
      await sql`INSERT INTO master.accounting_profile(id,tenant_id,code,name,direction,subledger_type,created_by) VALUES(${accounting}::uuid,${tenant}::uuid,${"PV." + accounting},'Synthetic preview accounting','OUTBOUND','AR',${maker}::uuid)`.execute(
        tx,
      );
      const original = (
        await sql`SELECT * FROM runtime_meta.entity_contract WHERE tenant_id=${tenant}::uuid AND entity_code='master.business_partner' AND status='published' LIMIT 1`.execute(
          tx,
        )
      ).rows[0];
      assert.ok(original);
      const contract = initialCaseContractSchema({
        tenantId: tenant,
        entityId: randomUUID(),
        publicationKey: "preview.company.fixture",
        contract: companySetupCaseInitialSchema,
      });
      const hash = createHash("sha256")
        .update(JSON.stringify(contract))
        .digest("hex");
      const fixture = {
        ...original,
        id: randomUUID(),
        entity_id: randomUUID(),
        release_id: randomUUID(),
        revision_id: randomUUID(),
        entity_code: BP_COMPANY_PILOT_CASE_ENTITY,
        publication_key: "preview.company.fixture",
        entity_contract_hash: hash,
        contract_json: contract,
        signature: "UNSIGNED_LOCAL_SQL_FIXTURE",
        signing_key_id: "local-preview-only",
      };
      await sql`INSERT INTO runtime_meta.entity_contract SELECT (jsonb_populate_record(NULL::runtime_meta.entity_contract,${JSON.stringify(fixture)}::jsonb)).*`.execute(
        tx,
      );
      const priorCase = (
        await sql`SELECT form_template_release_id,form_template_release_no,form_template_hash FROM document.entity_case WHERE tenant_id=${tenant}::uuid LIMIT 1`.execute(
          tx,
        )
      ).rows[0];
      const repository = new KyselyBusinessPartnerCaseRepository(
          BP_COMPANY_PILOT_CASE_ENTITY,
        ),
        ordinary = new KyselyBusinessPartnerCaseRepository();
      let access = true;
      const service = createBusinessPartnerCompanyPilotService({
        repository,
        refreshContext: async (context) => context,
        requirePublishedOperation: async () => {}, // explicit unsigned transaction-private engineering fixture
        resolveScope: async (input) => {
          if (input.target === "existing") {
            const row = (
              await sql`SELECT owner_company_code_id FROM document.entity_case WHERE tenant_id=${tenant}::uuid AND id=${input.recordId}::uuid AND entity_code=${BP_COMPANY_PILOT_CASE_ENTITY}`.execute(
                tx,
              )
            ).rows[0];
            return row ? { companyCodeId: row.owner_company_code_id } : null;
          }
          return input.coordinates.companyCodeId &&
            (input.target === "collection" ||
              input.coordinates.operatingOrganizationId === org)
            ? { companyCodeId: input.coordinates.companyCodeId }
            : null;
        },
        authorizer: {
          authorize: async (request) =>
            access && request.resource?.companyCodeId === company
              ? { allowed: true }
              : { allowed: false, reason: "denied" },
        },
        schemas: {
          resolve: async () => ({
            code: "business_partner.onboarding",
            version: Number(priorCase.form_template_release_no),
            hash: priorCase.form_template_hash,
            releaseId: priorCase.form_template_release_id,
          }),
        },
        validator: createBusinessPartnerRequestValidator({
          duplicates: { findExactLegalName: async () => [] },
        }),
        workflows: {
          resolve: async () => ({
            code: "neon.business_partner.onboarding",
            version: 1,
            hash: "b".repeat(64),
            stageCode: "company_review",
            stageName: "Synthetic company review",
            approverPrincipalIds: [reviewer],
          }),
        },
        transactions: {
          run: async (_plane, actor, work) => {
            await stamp(actor.principalId);
            return work(tx);
          },
        },
        audit: { record: async () => ({}) as never },
        outbox: { append: async () => {} },
      });
      const context = {
        planeKey: "neon",
        realmKey: "local-preview",
        tenantId: tenant,
        principalId: maker,
        authEpoch: 0,
        assurance: "elevated",
        requestId: randomUUID(),
      } as never;
      const command = {
        context,
        idempotencyKey: "company-preview-" + randomUUID(),
        kind: "configure_company" as const,
        source: { kind: "manual" as const },
        requestedRole: "customer" as const,
        targetBusinessPartnerId: bp,
        operatingOrganizationId: org,
        companyCodeId: company,
        proposedPayload: {
          name: "Synthetic company preview",
          ownershipClass: "internal",
          customerType: "intercompany",
          currencyCode: "MYR",
          paymentTermId: payment,
          defaultAccountingProfileId: accounting,
        },
      };
      await assert.rejects(
        service.create({ ...command, companyCodeId: randomUUID() }),
        (error: any) => error.code === "FORBIDDEN",
      );
      report.checks.push("wrong_company_creation_denied");
      const created = (await service.create(command)).request;
      assert.equal(
        (await repository.get(tenant, created.id, tx))?.companyCodeId,
        company,
      );
      assert.equal(await ordinary.get(tenant, created.id, tx), null);
      report.checks.push("native_draft_company_owner_and_repository_isolation");
      await assert.rejects(
        new KyselyGovernedInternalBusinessPartnerCaseRepository().transition(
          {
            context,
            caseId: created.id,
            action: "submit",
            expectedVersion: 1,
            idempotencyKey: "cross-endpoint-preview",
          } as never,
          tx,
        ),
        (error: any) => error.code === "BUSINESS_PARTNER_REQUEST_NOT_FOUND",
      );
      report.checks.push(
        "ordinary_lifecycle_endpoint_cannot_transition_company_case",
      );
      const validated = await service.validate({
        context,
        requestId: created.id,
        expectedVersion: 1,
      });
      assert.equal(
        validated.validation.valid,
        true,
        JSON.stringify(
          validated.validation.findings.filter((f) => f.outcome === "failed"),
        ),
      );
      const submitted = await service.submit({
        context,
        requestId: created.id,
        expectedVersion: validated.request.rowVersion,
        idempotencyKey: "preview-submit-" + randomUUID(),
      });
      const decision = {
        requestId: created.id,
        workflowRequestId: submitted.workflow.requestId,
        workItemId: submitted.workflow.workItemId,
        expectedRequestVersion: submitted.request.rowVersion,
        expectedWorkItemVersion: 1,
        decision: "approve" as const,
        reason: "Synthetic preview independent approval",
        idempotencyKey: "preview-decide-" + randomUUID(),
      };
      await assert.rejects(
        service.decide({ ...decision, context }),
        (error: any) =>
          error.code === "BUSINESS_PARTNER_REQUEST_SELF_APPROVAL_FORBIDDEN",
      );
      const approved = await service.decide({
        ...decision,
        context: { ...(context as object), principalId: reviewer } as never,
      });
      const applied = await service.apply({
        context,
        requestId: created.id,
        expectedVersion: approved.request.rowVersion,
        idempotencyKey: "preview-apply-" + randomUUID(),
      });
      assert.equal(applied.request.status, "applied");
      const stored = (
        await sql`SELECT status,owner_company_code_id FROM document.entity_case WHERE id=${created.id}::uuid`.execute(
          tx,
        )
      ).rows[0];
      assert.equal(stored.status, "materialized");
      assert.equal(stored.owner_company_code_id, company);
      assert.equal(
        (
          await sql`SELECT count(*)::int n FROM master.company_code_customer_profile WHERE tenant_id=${tenant}::uuid AND customer_id=${customer}::uuid AND company_code_id=${company}::uuid`.execute(
            tx,
          )
        ).rows[0].n,
        1,
      );
      report.checks.push(
        "native_validate_submit_independent_approve_materialize",
        "self_approval_denied",
        "finance_company_profile_materialized",
      );
      await service.get({ context, requestId: created.id });
      access = false;
      await assert.rejects(
        service.get({ context, requestId: created.id }),
        (error: any) => error.code === "FORBIDDEN",
      );
      await assert.rejects(
        service.apply({
          context,
          requestId: created.id,
          expectedVersion: applied.request.rowVersion,
          idempotencyKey: "revoked-preview-apply",
        }),
        (error: any) => error.code === "FORBIDDEN",
      );
      report.checks.push("read_then_revoked_read_and_execution_denied");
      throw rollback;
    });
  } catch (error: any) {
    report.rolledBack = true;
    if (error !== rollback) {
      report.failure = { code: error.code, message: error.message };
      process.exitCode = 1;
    } else report.passed = true;
  } finally {
    await db.destroy();
    const path = `governance/policy/reports/business-partner-company-lifecycle-preview-${Date.now()}.dev.json`;
    fs.writeFileSync(path, JSON.stringify(report, null, 2) + "\n", {
      flag: "wx",
    });
    console.log(JSON.stringify({ report: path, ...report }));
  }
}

/** Canonical local DEV authoring. Publishes configuration only; never submits/decides a case. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import {
  authorSupplierProfile,
  supplierCatalogId,
  supplierCatalogEffectiveFrom,
  supplierDocumentDefinition,
  supplierDocumentPurposes,
  supplierGateCodes,
  supplierManifest,
  supplierProfileTasks,
} from "../../../server/apps/platform-host/src/provisioning/supplier-process-catalog.js";
import {
  createProcessSelectionCatalog,
  processCatalogContentHash,
  supplierRequirementPolicy,
  createKyselyProcessSelectionPublicationRepository,
  KyselyCycleTemplateRepository,
  inspectCycleTemplate,
  compileProcessSelection,
} from "../../../server/packages/platform/control-admin/src/index.js";
import { readSupplierProcessWorkflow } from "../../../server/apps/platform-host/src/composition/supplier-process-workflow.js";
import { renderStrictHandlebars } from "../../../server/packages/services/documents/src/strict-template-renderer.js";
import { createKyselyDocumentTemplateRepository } from "../../../server/packages/services/documents/src/kysely-document-repositories.js";
import type {
  ProcessDocumentBinding,
  ProcessSelectionPublication,
} from "../../../server/packages/contracts/control-admin/src/index.js";
const require = createRequire(
  new URL("../../../server/db/package.json", import.meta.url),
);
const { Pool } = require("pg"),
  { Kysely, PostgresDialect, sql } = require("kysely");
// P9 may author only the disposable container it created, through its local Unix socket.
const disposableName=process.argv.find(a=>a.startsWith("--disposable-container="))?.split("=")[1];
let connection: Record<string,unknown>;
if(disposableName){
 assert.match(disposableName,/^athyper-bs360-supplier-p9-[0-9a-f-]+$/);
 const target=JSON.parse(execFileSync("docker",["inspect",disposableName],{encoding:"utf8"}))[0];
 assert.equal(target.Config.Labels["athyper.environment"],"disposable_local");
 assert.equal(target.Config.Labels["athyper.purpose"],"business-partner-360-integration-baseline");
 assert.equal(target.HostConfig.NetworkMode,"none");
 const socket=target.Mounts.find((m:any)=>m.Destination==="/var/run/postgresql")?.Source;
 assert.match(socket,/^\/tmp\/athyper-p9-socket-[a-zA-Z0-9]+$/);
 connection={host:socket,user:"postgres",database:"athyper_neon"};
}else{
 const host=execFileSync("docker",["inspect","--format","{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}","athyper-dev-db-1"],{encoding:"utf8"}).trim();
 connection={host,user:"postgres",database:"athyper_neon",password:readFileSync(`${process.env.HOME}/.athyper/instances/dev/secrets/postgres-password`,"utf8").trim()};
}
const db=new Kysely({dialect:new PostgresDialect({pool:new Pool(connection)})});
const scope = {
  tenantId: "44444444-4444-4444-8444-444444444444",
  planeKey: "neon" as const,
  processFamily: "supplier_onboarding",
  operatingOrganizationId: "a478f9c0-8226-5d22-9599-b8fb27a45180",
  companyCodeId: "793b6cb3-3c61-57c0-9562-2cbc288bd4cf",
};
const principal = "cca94907-7519-5871-8e3c-6b11aa545c93",
  id = (key: string) => supplierCatalogId(scope, key);
// Existing local named role. No membership/permission grants are performed here.
// Tenant-specific specialization can publish new reviewer-policy revisions in P3.
const approverRole = "dev.bp.approvers.operating_organization";
const reviewerRoles = Object.fromEntries(
  Object.values(supplierProfileTasks)
    .flat()
    .map((code) => [code, [approverRole, approverRole] as const]),
);
const catalog = createProcessSelectionCatalog({
  planeKey: "neon",
  workflow: async (revision, s, tx) =>
    !!(await readSupplierProcessWorkflow(revision, s, tx)),
});
const report: any = {
  at: new Date().toISOString(),
  scope,
  mode: "canonical local DEV configuration publication",
  checks: [],
  cycles: [],
};
try {
  const role = (
    await sql`SELECT id FROM authz.role WHERE tenant_id=${scope.tenantId}::uuid AND code=${approverRole} AND status='active'`.execute(
      db,
    )
  ).rows;
  assert.equal(
    role.length,
    1,
    "Configured local approver role must already be active",
  );
  const cycleRepository = new KyselyCycleTemplateRepository(db);
  const authoredProfiles = [];
  for (const profile of ["simple", "standard", "enhanced"] as const) {
    const authored = await authorSupplierProfile({
      scope,
      profile,
      reviewerRoles,
    });
    const c = authored.cycle.cycleType;
    await db.transaction().execute(async (tx: any) => {
      await sql`SELECT set_config('app.current_tenant_id',${scope.tenantId},true),set_config('app.current_principal_id',${principal},true)`.execute(
        tx,
      );
      await sql`INSERT INTO control.cycle_type(id,tenant_id,code,name,domain_code,frequency,approval_policy,status,created_by)
        VALUES(${c.id}::uuid,${scope.tenantId}::uuid,${c.code},${c.name},${c.domainCode},${c.frequency},${JSON.stringify(c.approvalPolicy)}::jsonb,'active',${principal}::uuid) ON CONFLICT(id) DO NOTHING`.execute(
        tx,
      );
      const existing = (
        await sql`SELECT tenant_id,code,approval_policy FROM control.cycle_type WHERE id=${c.id}::uuid`.execute(
          tx,
        )
      ).rows[0];
      assert.equal(existing.tenant_id, scope.tenantId);
      assert.equal(existing.code, c.code);
      assert.deepEqual(existing.approval_policy, c.approvalPolicy);
    });
    // Canonical normalized identities referenced by the runtime's tenant-composite foreign keys.
    await db.transaction().execute(async (tx: any) => {
      await sql`SELECT set_config('app.current_tenant_id',${scope.tenantId},true),set_config('app.current_principal_id',${principal},true)`.execute(
        tx,
      );
      for (const phase of authored.cycle.phases)
        await sql`INSERT INTO control.cycle_phase(id,tenant_id,cycle_type_id,code,name,sort_order,is_gate_enforced,status,created_by)
        VALUES(${phase.id}::uuid,${scope.tenantId}::uuid,${c.id}::uuid,${phase.code},${phase.name},${phase.sortOrder},${phase.isGateEnforced},'active',${principal}::uuid) ON CONFLICT(id) DO NOTHING`.execute(
          tx,
        );
      for (const category of authored.cycle.categories)
        await sql`INSERT INTO control.cycle_task_category(id,tenant_id,cycle_type_id,code,name,sort_order,status,created_by)
        VALUES(${category.id}::uuid,${scope.tenantId}::uuid,${c.id}::uuid,${category.code},${category.name},${category.sortOrder},'active',${principal}::uuid) ON CONFLICT(id) DO NOTHING`.execute(
          tx,
        );
      for (const task of authored.cycle.tasks) {
        await sql`INSERT INTO control.cycle_task_template(id,tenant_id,cycle_type_id,phase_id,category_id,entity_code,code,name,completion_mode,is_mandatory,is_waivable,sort_order,applicability,status,created_by)
          VALUES(${task.id}::uuid,${scope.tenantId}::uuid,${c.id}::uuid,${task.phaseId}::uuid,${task.categoryId}::uuid,${task.entityCode},${task.code},${task.name},${task.completionMode},${task.isMandatory},${task.isWaivable},${task.sortOrder},${JSON.stringify(task.applicability)}::jsonb,'active',${principal}::uuid) ON CONFLICT(id) DO NOTHING`.execute(
          tx,
        );
        const saved = (
          await sql`SELECT tenant_id,cycle_type_id,phase_id,code,completion_mode,is_waivable FROM control.cycle_task_template WHERE id=${task.id}::uuid`.execute(
            tx,
          )
        ).rows[0];
        assert.deepEqual(saved, {
          tenant_id: scope.tenantId,
          cycle_type_id: c.id,
          phase_id: task.phaseId,
          code: task.code,
          completion_mode: task.completionMode,
          is_waivable: task.isWaivable,
        });
      }
    });
    const preview = await inspectCycleTemplate(
      scope.tenantId,
      authored.cycle,
      cycleRepository,
    );
    assert.equal(preview.valid, true, JSON.stringify(preview.issues));
    const result = await cycleRepository.publish({
      tenantId: scope.tenantId,
      principalId: principal,
      idempotencyKey: "supplier-process-catalog-v1",
      expectedLatestVersion: 0,
      preview,
    });
    assert.notEqual(result.kind, "version_conflict");
    if (result.kind === "version_conflict")
      throw Error("Cycle revision conflict");
    authoredProfiles.push({
      authored,
      cycle: {
        id: result.value.id,
        version: result.value.version,
        hash: result.value.templateHash,
        cycleTypeId: c.id,
      },
    });
    report.cycles.push({
      profile,
      result: result.kind,
      revision: result.value.id,
      hash: result.value.templateHash,
      taskCount: preview.template.tasks.length,
    });
  }
  await db.transaction().execute(async (tx: any) => {
    await sql`SELECT set_config('app.current_tenant_id',${scope.tenantId},true),set_config('app.current_principal_id',${principal},true),set_config('app.current_actor_type','user',true)`.execute(
      tx,
    );
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`supplier-catalog:${scope.tenantId}`},0))`.execute(
      tx,
    );
    async function put(
      kind: string,
      key: string,
      definition: object,
      revision = {
        id: id(key),
        version: 1,
        hash: processCatalogContentHash(definition),
      },
    ) {
      await sql`INSERT INTO control.process_selection_catalog_revision(id,tenant_id,plane_key,process_family,operating_organization_id,company_code_id,kind,version,content_hash,definition,effective_from,published_by)
        VALUES(${revision.id}::uuid,${scope.tenantId}::uuid,${scope.planeKey},${scope.processFamily},${scope.operatingOrganizationId}::uuid,${scope.companyCodeId}::uuid,${kind},${revision.version},${revision.hash},${JSON.stringify(definition)}::jsonb,${supplierCatalogEffectiveFrom}::timestamptz,${principal}::uuid) ON CONFLICT(id) DO NOTHING`.execute(
        tx,
      );
      const found = (
        await sql`SELECT * FROM control.process_selection_catalog_revision WHERE id=${revision.id}::uuid`.execute(
          tx,
        )
      ).rows[0];
      assert.equal(found.tenant_id, scope.tenantId);
      assert.equal(found.content_hash, revision.hash);
      assert.equal(found.kind, kind);
      assert.deepEqual(found.definition, definition);
      return revision;
    }
    const documents: ProcessDocumentBinding[] = [];
    for (const [i, purpose] of supplierDocumentPurposes.entries()) {
      const d = supplierDocumentDefinition(purpose),
        templateId = id(`template.${purpose}`),
        versionId = id(`template.${purpose}.v1`),
        bindingId = id(`template.${purpose}.binding`);
      // Fail before publication if the real strict renderer cannot consume this template's scalar schema.
      renderStrictHandlebars(
        d.content.content_html,
        Object.fromEntries(d.fields.map((f) => [f, `qualification ${f}`])),
        d.content.variables_schema,
      );
      await sql`INSERT INTO master.template(id,tenant_id,code,name,kind,engine,created_by) VALUES(${templateId}::uuid,${scope.tenantId}::uuid,${`supplier.${purpose}`},${d.title},'supplier_onboarding','handlebars',${principal}::uuid) ON CONFLICT(id) DO NOTHING`.execute(
        tx,
      );
      await sql`INSERT INTO snapshot.template_version(id,tenant_id,template_id,version,locale_code,content_html,styles_css,variables_schema,assets_manifest,checksum,effective_from,created_by)
        VALUES(${versionId}::uuid,${scope.tenantId}::uuid,${templateId}::uuid,1,'en',${d.content.content_html},${d.content.styles_css},${JSON.stringify(d.content.variables_schema)}::jsonb,${JSON.stringify(d.content.assets_manifest)}::jsonb,${d.checksum},${supplierCatalogEffectiveFrom.slice(0, 10)}::date,${principal}::uuid) ON CONFLICT(id) DO NOTHING`.execute(
        tx,
      );
      const version = (
        await sql`SELECT * FROM snapshot.template_version WHERE id=${versionId}::uuid`.execute(
          tx,
        )
      ).rows[0];
      assert.equal(version.checksum, d.checksum);
      assert.equal(version.content_html, d.content.content_html);
      assert.equal(version.styles_css, d.content.styles_css);
      assert.deepEqual(version.variables_schema, d.content.variables_schema);
      await sql`UPDATE master.template SET current_version_id=${versionId}::uuid,status='published',updated_at=now(),updated_by=${principal}::uuid WHERE id=${templateId}::uuid AND status='draft' AND current_version_id IS NULL`.execute(
        tx,
      );
      await sql`INSERT INTO master.template_binding(id,tenant_id,template_id,entity_code,operation_code,variant_code,locale_code,created_by) VALUES(${bindingId}::uuid,${scope.tenantId}::uuid,${templateId}::uuid,'entity_case',${purpose},'default','en',${principal}::uuid) ON CONFLICT(id) DO NOTHING`.execute(
        tx,
      );
      const resolved =
        await createKyselyDocumentTemplateRepository().resolvePublished(
          {
            tenantId: scope.tenantId,
            entityType: "entity_case",
            operationCode: purpose,
            variant: "default",
            locale: "en",
            effectiveOn: supplierCatalogEffectiveFrom.slice(0, 10),
          },
          tx,
        );
      assert.equal(resolved?.templateVersionId, versionId);
      assert.equal(resolved?.checksum, d.checksum);
      assert.equal(resolved?.bindingId, bindingId);
      const source = (
        ["submitted_snapshot", "decision_snapshot", "result_snapshot"] as const
      )[i]!;
      const projection = {
        ...(await put("projection", `projection.${purpose}`, {
          schema: "athyper.supplier-document-projection/1",
          code: `supplier.${purpose}.snapshot`,
          owner: "business_partner",
          source,
          fields: d.fields,
          requireExactSnapshot: true,
          attachmentAccess: "authorized_version_references",
          bankAccountDisclosure: "masked",
          omitCredentials: true,
          permission: "neon.relationship.entity_case.read",
        })),
        code: `supplier.${purpose}.snapshot`,
      };
      const recipientPolicy = await put(
        "recipient_policy",
        `recipients.${purpose}`,
        {
          schema: "athyper.supplier-document-recipients/1",
          purpose,
          requireAuthenticatedAccess: true,
          scope,
          recipients:
            purpose === "submitted_review_pack"
              ? ["eligible_current_attempt_reviewers"]
              : ["requester", "authorized_business_owner"],
          permission: "neon.relationship.entity_case.read",
          linkPolicy: "pinned_artifact_authenticated",
          staleAttemptAccess: "evidence_only",
          publicLinks: false,
        },
      );
      documents.push({
        purpose,
        source,
        requiredBefore: (
          ["review_execution", "materialization", "cycle_completion"] as const
        )[i]!,
        template: {
          id: versionId,
          version: 1,
          hash: d.checksum,
          templateId,
          bindingId,
          locale: "en",
          variant: "default",
        },
        projection,
        recipientPolicy,
      });
      report.checks.push({
        label: "document owner resolved exact authored template",
        purpose,
        versionId,
        checksum: d.checksum,
      });
    }
    const manifests = [];
    for (const { authored, cycle } of authoredProfiles) {
      for (const artifact of authored.artifacts)
        await put(artifact.kind, "", artifact.definition, artifact.revision);
      const manifest = supplierManifest(scope, authored, cycle, documents);
      await put("manifest", "", manifest, manifest.revision);
      manifests.push(manifest);
    }
    const factSchema = {
      ...(await put("fact_schema", "facts", {
        code: "supplier_onboarding_requirement",
        schema: "athyper.supplier-requirement-facts/1",
        allowedValues: ["basic", "standard", "enhanced"],
        path: "request.requestedComplianceLevel",
        source: "authorized_case_snapshot",
        required: true,
      })),
      code: "supplier_onboarding_requirement" as const,
    };
    const authority = {
      ...(await put("minimum_control", "minimum", {
        owner: "business_partner",
        minimumProfile: "simple",
        mandatoryGateCodes: supplierGateCodes,
      })),
      owner: "business_partner",
    };
    const definition = supplierRequirementPolicy({
      id: id("policy"),
      tenantId: scope.tenantId,
      version: 1,
      effectiveFrom: supplierCatalogEffectiveFrom.slice(0, 10),
      ruleIds: {
        basic: id("rule.basic"),
        standard: id("rule.standard"),
        enhanced: id("rule.enhanced"),
      },
      profiles: Object.fromEntries(
        manifests.map((m) => [m.profile.code, m.profile]),
      ) as any,
    });
    const existingPolicy = (
      await sql`SELECT definition_hash FROM control.policy_definition WHERE id=${definition.id}::uuid`.execute(
        tx,
      )
    ).rows[0];
    if (existingPolicy)
      assert.equal(existingPolicy.definition_hash, definition.definitionHash);
    else {
      await sql`INSERT INTO control.policy_definition(id,tenant_id,entity_type,name,priority,evaluation_mode,effective_from,version_no,definition_hash,status,created_by)
        VALUES(${definition.id}::uuid,${scope.tenantId}::uuid,${definition.entityType},${definition.name},${definition.priority},${definition.evaluationMode},${definition.effectiveFrom}::date,1,${definition.definitionHash},'draft',${principal}::uuid)`.execute(
        tx,
      );
      for (const r of definition.rules)
        await sql`INSERT INTO control.policy_rule(id,policy_definition_id,priority,condition_expr,action_code,action_config,metadata,created_by)
        VALUES(${r.id}::uuid,${definition.id}::uuid,${r.priority},${JSON.stringify(r.condition)}::jsonb,${r.action},${JSON.stringify(r.actionConfig)}::jsonb,'{}'::jsonb,${principal}::uuid)`.execute(
          tx,
        );
      await sql`UPDATE control.policy_definition SET status='active',definition_hash=${definition.definitionHash} WHERE id=${definition.id}::uuid`.execute(
        tx,
      );
    }
    const publication: ProcessSelectionPublication = {
      schema: "athyper.process-selection-publication/1",
      scope,
      factSchema,
      policy: {
        id: definition.id,
        definitionId: definition.id,
        version: 1,
        hash: definition.definitionHash!,
      },
      definition,
      manifests,
      minimumControls: [
        {
          scope,
          authority,
          minimumProfile: "simple",
          mandatoryGateCodes: supplierGateCodes,
        },
      ],
    };
    const compiler = catalog.compiler(tx);
    const compiled = await compileProcessSelection(publication, compiler);
    assert.equal(compiled.valid, true, JSON.stringify(compiled.issues));
    const existing = (
      await sql`SELECT publication FROM control.process_selection_publication WHERE id=${id("publication")}::uuid`.execute(
        tx,
      )
    ).rows[0];
    if (existing) assert.deepEqual(existing.publication, publication);
    else
      await createKyselyProcessSelectionPublicationRepository().publish(
        {
          id: id("publication"),
          publication,
          effectiveFrom: supplierCatalogEffectiveFrom,
          actorPrincipalId: principal,
        },
        compiler,
        tx,
      );
    report.publication = publication;
    report.result = existing ? "replayed" : "published";
    report.checks.push({
      label: "all manifests compile against real published database owners",
      valid: compiled.valid,
    });
  });
  report.passed = true;
  writeFileSync(
    disposableName ? "governance/policy/reports/supplier-onboarding-p9-clean-catalog.dev.json" : "governance/policy/reports/supplier-process-catalog-publication.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      result: report.result,
      checks: report.checks,
      cycles: report.cycles,
      policy: report.publication.policy,
    }),
  );
} finally {
  await db.destroy();
}

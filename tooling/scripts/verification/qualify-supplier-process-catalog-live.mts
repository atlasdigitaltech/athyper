import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readSupplierProcessWorkflow } from "../../../server/apps/platform-host/src/composition/supplier-process-workflow.js";
import { supplierDocumentDefinition } from "../../../server/apps/platform-host/src/provisioning/supplier-process-catalog.js";
import {
  createProcessSelectionCatalog,
  compileProcessSelection,
  processCatalogContentHash,
} from "../../../server/packages/platform/control-admin/src/index.js";
import { renderStrictHandlebars } from "../../../server/packages/services/documents/src/strict-template-renderer.js";
import { createGotenbergRenderer } from "../../../server/packages/adapters/rendering/src/gotenberg-renderer.js";
import { createClamAvMalwareScanner } from "../../../server/packages/adapters/malware-clamav/src/clamav-malware-scanner.js";
const require = createRequire(
  new URL("../../../server/db/package.json", import.meta.url),
);
const { Pool } = require("pg"),
  { Kysely, PostgresDialect, sql } = require("kysely");
const ip = (container: string): string => {
  const inspected = JSON.parse(
    execFileSync("docker", ["inspect", container], { encoding: "utf8" }),
  )[0];
  const network = Object.values(inspected.NetworkSettings.Networks)[0] as {
    IPAddress: string;
  };
  assert.ok(network.IPAddress);
  return network.IPAddress;
};
const db = new Kysely({
  dialect: new PostgresDialect({
    pool: new Pool({
      host: ip("athyper-dev-db-1"),
      user: "postgres",
      database: "athyper_neon",
      password: readFileSync(
        `${process.env.HOME}/.athyper/instances/dev/secrets/postgres-password`,
        "utf8",
      ).trim(),
    }),
  }),
});
const published = JSON.parse(
  readFileSync(
    "governance/policy/reports/supplier-process-catalog-publication.dev.json",
    "utf8",
  ),
).publication;
const scope = published.scope;
const report: any = {
  at: new Date().toISOString(),
  mode: "real published catalogs, PostgreSQL, Gotenberg and ClamAV; synthetic document data",
  checks: [],
  documents: [],
};
const renderer = createGotenbergRenderer({
  baseUrl: `http://${ip("athyper-dev-docrender-1")}:3000`,
});
const scanner = createClamAvMalwareScanner({
  host: ip("athyper-dev-virusscan-1"),
  port: 3310,
});
try {
  await db.transaction().execute(async (tx: any) => {
    const catalog = createProcessSelectionCatalog({
      planeKey: "neon",
      workflow: async (revision, s, t) =>
        !!(await readSupplierProcessWorkflow(revision, s, t)),
    });
    const stored = (
      await sql`SELECT publication FROM control.process_selection_publication WHERE policy_definition_id=${published.policy.id}::uuid`.execute(
        tx,
      )
    ).rows;
    assert.equal(stored.length, 1);
    assert.deepEqual(stored[0].publication, published);
    const compiled = await compileProcessSelection(
      stored[0].publication,
      catalog.compiler(tx),
    );
    assert.equal(compiled.valid, true, JSON.stringify(compiled.issues));
    for (const m of published.manifests)
      for (const task of m.tasks.filter((t: any) => t.workflow)) {
        const workflow = await readSupplierProcessWorkflow(
          task.workflow,
          scope,
          tx,
        );
        assert.ok(workflow);
        assert.equal(
          workflow.stages.length,
          m.profile.code === "enhanced" ? 2 : 1,
        );
        for (const stage of workflow.stages)
          for (const selector of stage.approvers) {
            assert.equal(selector.kind, "role");
            if (selector.kind !== "role") throw Error("Named role required");
            const roles = (
              await sql`SELECT id FROM authz.role WHERE tenant_id=${scope.tenantId}::uuid AND code=${selector.roleCode} AND status='active'`.execute(
                tx,
              )
            ).rows;
            assert.equal(roles.length, 1, selector.roleCode);
          }
        assert.equal(
          await readSupplierProcessWorkflow(
            { ...task.workflow, hash: "0".repeat(64) },
            scope,
            tx,
          ),
          undefined,
        );
        assert.equal(
          await readSupplierProcessWorkflow(
            { ...task.workflow, definitionId: randomUUID() },
            scope,
            tx,
          ),
          undefined,
        );
        assert.equal(
          await readSupplierProcessWorkflow(
            { ...task.workflow, version: 2 },
            scope,
            tx,
          ),
          undefined,
        );
        assert.equal(
          await readSupplierProcessWorkflow(
            task.workflow,
            { ...scope, companyCodeId: null },
            tx,
          ),
          undefined,
        );
        report.checks.push({
          profile: m.profile.code,
          task: task.code,
          levels: workflow.stages.length,
          exactRevisionAndScope: true,
        });
      }
    for (const binding of published.manifests[0].documents) {
      const row = (
        await sql`SELECT content_html,styles_css,variables_schema,assets_manifest,checksum FROM snapshot.template_version WHERE id=${binding.template.id}::uuid AND tenant_id=${scope.tenantId}::uuid`.execute(
          tx,
        )
      ).rows[0];
      assert.ok(row);
      const { checksum, ...content } = row;
      assert.equal(processCatalogContentHash(content), checksum);
      const d = supplierDocumentDefinition(binding.purpose);
      const fields = Object.fromEntries(
        d.fields.map((field) => [
          field,
          `Qualification only: ${field} <escaped>`,
        ]),
      );
      const html = renderStrictHandlebars(
        row.content_html,
        fields,
        row.variables_schema,
      ).replace("</head>", `<style>${row.styles_css}</style></head>`);
      assert.ok(html.includes("&lt;escaped&gt;"));
      assert.throws(() =>
        renderStrictHandlebars(row.content_html, {}, row.variables_schema),
      );
      const pdf = await renderer.renderPdf({
        html,
        documentName: `supplier-${binding.purpose}-qualification`,
        options: { format: "A4" },
      });
      assert.equal(Buffer.from(pdf.bytes).subarray(0, 5).toString(), "%PDF-");
      const scan = await scanner.scan({
        content: pdf.bytes,
        fileName: `${binding.purpose}.pdf`,
        contentType: "application/pdf",
        sizeBytes: pdf.bytes.length,
      });
      assert.equal(scan.status, "clean");
      const directory =
        "governance/policy/reports/supplier-process-document-samples";
      mkdirSync(directory, { recursive: true });
      writeFileSync(`${directory}/${binding.purpose}.pdf`, pdf.bytes);
      report.documents.push({
        purpose: binding.purpose,
        templateVersionId: binding.template.id,
        templateChecksum: checksum,
        provider: pdf.provider,
        bytes: pdf.bytes.length,
        pdfHash: createHash("sha256").update(pdf.bytes).digest("hex"),
        scan,
        file: `${directory}/${binding.purpose}.pdf`,
      });
    }
  });
  // Regression: draft edits/activation must survive the published-revision guard.
  const rollback = Error("QUALIFICATION_ROLLBACK");
  try {
    await db.transaction().execute(async (tx: any) => {
      const policyId = randomUUID();
      await sql`INSERT INTO control.policy_definition(id,tenant_id,entity_type,name,priority,evaluation_mode,effective_from,version_no,status,created_by)
      VALUES(${policyId}::uuid,${scope.tenantId}::uuid,'supplier_onboarding',${`Draft guard qualification ${policyId}`},10,'first_match','2026-09-14',1,'draft','cca94907-7519-5871-8e3c-6b11aa545c93')`.execute(
        tx,
      );
      await sql`UPDATE control.policy_definition SET name='Edited draft',definition_hash=${"a".repeat(64)},status='active' WHERE id=${policyId}::uuid`.execute(
        tx,
      );
      const row = (
        await sql`SELECT name,status FROM control.policy_definition WHERE id=${policyId}::uuid`.execute(
          tx,
        )
      ).rows[0];
      assert.deepEqual(row, { name: "Edited draft", status: "active" });
      await sql.raw("SAVEPOINT immutable").execute(tx);
      await assert.rejects(
        sql`UPDATE control.policy_definition SET name='Forbidden edit' WHERE id=${policyId}::uuid`.execute(
          tx,
        ),
        (e: any) => e.code === "55000",
      );
      await sql.raw("ROLLBACK TO SAVEPOINT immutable").execute(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  report.checks.push({
    label:
      "draft activation persists and published mutation remains prohibited",
    passed: true,
    writesRolledBack: true,
  });
  report.passed = true;
  console.log(JSON.stringify(report));
} finally {
  scanner.close();
  await db.destroy();
  writeFileSync(
    "governance/policy/reports/supplier-process-catalog-qualification.dev.json",
    JSON.stringify(report, null, 2) + "\n",
  );
}

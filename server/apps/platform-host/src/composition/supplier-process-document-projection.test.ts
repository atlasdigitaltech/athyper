import { randomUUID } from "node:crypto";
import {
  Kysely,
  DummyDriver,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
} from "kysely";
import { it, expect } from "vitest";
import { createSupplierProcessDocuments } from "./supplier-process-documents.js";
import { supplierDocumentDefinition } from "../provisioning/supplier-process-catalog.js";
import { processCatalogContentHash } from "@athyper/server-platform-control-admin";
import { renderStrictHandlebars } from "@athyper/server-service-documents";
for (const purpose of [
  "submitted_review_pack",
  "decision_document",
  "activation_confirmation",
] as const) {
  it(`${purpose} uses owning facts and an exact allowlist`, async () => {
    const id = randomUUID(),
      tenant = randomUUID(),
      actor = randomUUID(),
      snapshot = { id: randomUUID(), version: 3, hash: "a".repeat(64) },
      template = {
        id: randomUUID(),
        version: 1,
        hash: "b".repeat(64),
        templateId: randomUUID(),
        bindingId: randomUUID(),
        locale: "en",
        variant: "default",
      },
      definition = supplierDocumentDefinition(purpose),
      source = {
        submitted_review_pack: "submitted_snapshot",
        decision_document: "decision_snapshot",
        activation_confirmation: "result_snapshot",
      }[purpose];
    const projection = {
      owner: "business_partner",
      omitCredentials: true,
      requireExactSnapshot: true,
      source,
      fields: definition.fields,
    };
    const coordinate = {
      scope: {
        planeKey: "neon",
        tenantId: tenant,
        operatingOrganizationId: randomUUID(),
        companyCodeId: randomUUID(),
      },
      caseId: id,
      attemptId: randomUUID(),
      attemptNumber: 1,
      submissionSnapshot: snapshot,
    };
    const evidence = {
      coordinate,
      effectiveProfile: { code: "simple" },
      policy: { id: randomUUID() },
    };
    const binding = {
      purpose,
      source,
      template,
      projection: {
        id: randomUUID(),
        version: 1,
        hash: processCatalogContentHash(projection),
      },
    };
    const job = {
      id: randomUUID(),
      case_id: id,
      status: "processing",
      intent_hash: "c".repeat(64),
      intent: {
        coordinate,
        sourceSnapshot: snapshot,
        binding,
        activationEvidence: {
          id: randomUUID(),
          version: 1,
          hash: "d".repeat(64),
        },
      },
    };
    let authorize = true,
      activated = true,
      sourceId = snapshot.id;
    const connection: DatabaseConnection = {
      executeQuery: async <R>(q: CompiledQuery) => {
        let rows: unknown[] = [];
        if (q.sql.includes("FROM governance.process_document_job"))
          rows = [job];
        else if (q.sql.includes("JOIN governance.process_attempt"))
          rows = [
            {
              id,
              status: "approved",
              created_by: actor,
              submitted_snapshot_id: sourceId,
              decision_snapshot_id: sourceId,
              result_snapshot_id: sourceId,
              target_entity_id: randomUUID(),
              evidence,
            },
          ];
        else if (q.sql.includes("FROM document.supplier_activation_evidence"))
          rows = activated
            ? [
                {
                  id: job.intent.activationEvidence.id,
                  supplier_id: id,
                  activated_at: new Date("2026-09-14T00:00:00Z"),
                  readiness_fingerprint: "d".repeat(64),
                },
              ]
            : [];
        else if (q.sql.includes("FROM snapshot.entity_snapshot_identity"))
          rows = [
            { id: sourceId, version_number: 3, payload_hash: snapshot.hash },
          ];
        else if (
          q.sql.includes("FROM control.process_selection_catalog_revision")
        )
          rows = [
            {
              definition: projection,
              content_hash: processCatalogContentHash(projection),
            },
          ];
        else if (q.sql.includes("FROM snapshot.entity_snapshot"))
          rows = [
            {
              name: "Authorized & Co",
              requirement: "basic",
              reason: "Pilot",
              bankAccount: "DO NOT PROJECT",
              credentials: "DO NOT PROJECT",
            },
          ];
        else if (q.sql.includes("FROM document.entity_case_command_evidence"))
          rows = [
            {
              id,
              after_status: "approved",
              recorded_at: new Date("2026-09-14T00:00:00Z"),
            },
          ];
        else if (q.sql.includes("FROM document.workflow_request"))
          rows = [{ id, status: "approved" }];
        return { rows: rows as R[] };
      },
      async *streamQuery<R>() {
        yield { rows: [] as R[] };
      },
    };
    class Driver extends DummyDriver {
      override async acquireConnection() {
        return connection;
      }
    }
    const db = new Kysely<Record<string, never>>({
      dialect: {
        createDriver: () => new Driver(),
        createAdapter: () => new PostgresAdapter(),
        createQueryCompiler: () => new PostgresQueryCompiler(),
        createIntrospector: (d) => new PostgresIntrospector(d),
      },
    });
    const owner = createSupplierProcessDocuments({
        authorizer: {
          authorize: async () =>
            authorize
              ? { allowed: true }
              : { allowed: false, reason: "denied" },
        },
        transactions: {} as never,
        documents: {} as never,
        reviewReady: async () => {},
      }),
      command = {
        context: { tenantId: tenant, principalId: actor, planeKey: "neon" },
        trustedJobId: job.id,
        entityType: "entity_case",
        entityId: id,
        operationCode: purpose,
        data: { decision: "Caller forgery", bankAccount: "DO NOT PROJECT" },
      } as never;
    try {
      const result = await owner.project(command, db as never);
      expect(Object.keys(result.data).sort()).toEqual(
        [...definition.fields].sort(),
      );
      expect(result.exactTemplate).toEqual(template);
      expect(result.provenance).toMatchObject({
        jobId: job.id,
        sourceSnapshot: snapshot,
        coordinate,
      });
      const html = renderStrictHandlebars(
        definition.content.content_html,
        result.data,
        definition.content.variables_schema,
      );
      expect(html).toContain(snapshot.hash);
      expect(html).not.toMatch(/DO NOT PROJECT|Caller forgery/);
      if (purpose === "submitted_review_pack")
        expect(html).toContain("Authorized &amp; Co");
      authorize = false;
      await expect(owner.project(command, db as never)).rejects.toMatchObject({
        code: "PROCESS_DOCUMENT_FORBIDDEN",
      });
      authorize = true;
      sourceId = randomUUID();
      await expect(owner.project(command, db as never)).rejects.toMatchObject({
        code: "PROCESS_DOCUMENT_SOURCE_STALE",
      });
      sourceId = snapshot.id;
      if (purpose === "activation_confirmation") {
        activated = false;
        await expect(owner.project(command, db as never)).rejects.toMatchObject(
          { code: "PROCESS_DOCUMENT_SOURCE_NOT_READY" },
        );
      }
    } finally {
      await db.destroy();
    }
  });
}

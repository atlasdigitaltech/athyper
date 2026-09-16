import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import type { Application, RequestHandler, Response } from "express";
import type {
  VerifiedIdentity,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type { ProcessDocumentPurpose } from "@athyper/server-contract-control-admin";
import type { createSupplierProcessDocuments } from "./supplier-process-documents.js";
import { createKyselyPermissionResolver } from "@athyper/server-platform-iam";
import {
  defineRouteContract,
  registerContractRoute,
} from "@athyper/server-runtime-http";
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
export function mountSupplierProcessDocuments(
  app: Application,
  options: {
    authenticate: RequestHandler;
    readContext(r: Response): VerifiedRequestContext;
    service: ReturnType<typeof createSupplierProcessDocuments>;
  },
) {
  for (const action of [
    "view",
    "request",
    "process",
    "retry",
    "download",
  ] as const) {
    const byCase = action === "view" || action === "request";
    registerContractRoute(
      app,
      defineRouteContract({
        method: action === "view" ? "get" : "post",
        path: `/api/governance/process-documents/${byCase ? "cases/:id" : "jobs/:id"}/${action}`,
        operationId: `governance.process_documents.${action}`,
        summary: `${action} pinned process documents`,
        tags: ["Governance"],
        authenticated: true,
        responses: {
          200: {
            description: "Document result",
            body: { type: "object", additionalProperties: true },
          },
          400: { description: "Invalid request" },
          403: { description: "Forbidden" },
          409: { description: "Document gate conflict" },
        },
      }),
      options.authenticate,
      async (req, res, next) => {
        try {
          const id = req.params["id"],
            body = req.body ?? {};
          if (
            !uuid(id) ||
            Object.keys(req.query).length ||
            Object.keys(body).some(
              (k) => action !== "request" || k !== "purpose",
            ) ||
            (action === "request" &&
              ![
                "submitted_review_pack",
                "decision_document",
                "activation_confirmation",
              ].includes(body.purpose))
          ) {
            res.status(400).json({ code: "PROCESS_DOCUMENT_INPUT_INVALID" });
            return;
          }
          const c = options.readContext(res);
          const result =
            action === "request"
              ? await options.service.request(
                  c,
                  id,
                  body.purpose as ProcessDocumentPurpose,
                )
              : await options.service[action](c, id);
          res.setHeader("Cache-Control", "no-store");
          res.status(200).json(result);
        } catch (error) {
          next(error);
        }
      },
    );
  }
}
/** Runs under a durable plane job; identity comes from committed case ownership and current IAM, never a caller permission snapshot. */
export function createSupplierProcessDocumentPoll(
  db: Kysely<Record<string, never>>,
  service: ReturnType<typeof createSupplierProcessDocuments>,
) {
  const permissions = createKyselyPermissionResolver({
    run: (identity, work) =>
      db.transaction().execute(async (tx) => {
        await sql`SELECT set_config('app.current_tenant_id',${identity.tenantId},true),set_config('app.current_principal_id',${identity.principalId},true)`.execute(
          tx,
        );
        return work(tx);
      }),
  });
  return async () => {
    const candidates = (
      await sql<{
        tenant_id: string;
        case_id: string;
        principal_id: string;
        auth_epoch: number;
      }>`SELECT * FROM document.process_document_candidates()`.execute(db)
    ).rows;
    let processed = 0,
      failed = 0;
    for (const row of candidates) {
      try {
        const identity: VerifiedIdentity = {
          planeKey: "neon",
          realmKey: "athyper",
          tenantId: row.tenant_id,
          principalId: row.principal_id,
          authEpoch: row.auth_epoch,
          assurance: "baseline",
        };
        const resolved = await permissions.resolve(identity);
        const c: VerifiedRequestContext = {
          ...identity,
          permissions: resolved,
          profileHash: resolved.profileHash,
          requestId: randomUUID(),
        };
        for (const purpose of [
          "submitted_review_pack",
          "decision_document",
          "activation_confirmation",
        ] as const) {
          try {
            const receipt = await service.request(c, row.case_id, purpose);
            const jobs = (await service.view(c, row.case_id)) as {
              id: string;
              status: string;
              gate_status: string;
              attempt_count: number;
            }[];
            const job = jobs.find((j) => j.id === receipt.jobId)!;
            if (
              (job.status === "ready" && job.gate_status === "succeeded") ||
              job.attempt_count >= 5
            )
              continue;
            await service.process(c, receipt.jobId);
            processed++;
          } catch (error) {
            if (
              (error as { code?: string }).code !==
              "PROCESS_DOCUMENT_SOURCE_NOT_READY"
            )
              failed++;
          }
        }
      } catch {
        failed++;
      }
    }
    return { processed, failed };
  };
}

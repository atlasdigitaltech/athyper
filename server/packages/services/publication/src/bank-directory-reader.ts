import { sql, type Kysely } from "kysely";
import {
  defineRouteContract,
  registerContractRoute,
  type Application,
  type RequestHandler,
  type Response,
} from "@athyper/server-runtime-http";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { PublicationPlane } from "@athyper/server-contract-publication";
export async function resolveBankDirectoryReference(
  database: Kysely<Record<string, never>>,
  input: { releaseId: string; institutionId: string; branchId?: string },
) {
  return (
    await sql<{
      result: Record<string, unknown>;
    }>`SELECT shared.resolve_bank_directory_reference(${input.releaseId}::uuid,${input.institutionId}::uuid,${input.branchId ?? null}::uuid) result`.execute(
      database,
    )
  ).rows[0]!.result;
}
/** Published institution data is shared; authentication still selects the receiving plane. */
export function registerBankDirectoryReferenceRoute(
  app: Application,
  options: {
    authenticate: RequestHandler;
    readContext: (r: Response) => VerifiedRequestContext;
    databases: Partial<Record<PublicationPlane, Kysely<Record<string, never>>>>;
  },
) {
  registerContractRoute(
    app,
    defineRouteContract({
      method: "get",
      path: "/api/bank-directory/reference",
      operationId: "bankDirectory.resolveReference",
      summary: "Resolve an exact published directory reference",
      tags: ["Bank Directory"],
      authenticated: true,
      responses: {
        200: { description: "Resolved, pending or unresolved reference" },
        400: { description: "Invalid reference" },
        503: { description: "Plane unavailable" },
      },
    }),
    options.authenticate,
    async (req, res, next) => {
      try {
        const context = options.readContext(res),
          database = options.databases[context.planeKey as PublicationPlane];
        if (!database) {
          res
            .status(503)
            .json({ state: "pending", reason: "plane_unavailable" });
          return;
        }
        const id = (v: unknown) => {
          if (
            typeof v !== "string" ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
              v,
            )
          )
            throw new TypeError("Invalid directory reference");
          return v;
        };
        res.json(
          await resolveBankDirectoryReference(database, {
            releaseId: id(req.query["releaseId"]),
            institutionId: id(req.query["institutionId"]),
            ...(req.query["branchId"]
              ? { branchId: id(req.query["branchId"]) }
              : {}),
          }),
        );
      } catch (e) {
        if (e instanceof TypeError) res.status(400).json({ error: e.message });
        else next(e);
      }
    },
  );
}

/** Reconcile coordinates supplied by received disclosures without guessing identities. */
export async function reconcileBankDirectoryReferences(
  database: Kysely<Record<string, never>>,
  references: readonly {
    releaseId: string;
    institutionId: string;
    branchId?: string;
  }[],
) {
  if (references.length > 1000)
    throw new TypeError("Reconcile at most 1000 references per batch");
  const results = (
    await sql<{
      result: Record<string, unknown>;
    }>`SELECT shared.resolve_bank_directory_reference(r."releaseId",r."institutionId",r."branchId") result FROM jsonb_to_recordset(${JSON.stringify(references)}::jsonb) AS r("releaseId" uuid,"institutionId" uuid,"branchId" uuid)`.execute(
      database,
    )
  ).rows.map((r) => r.result);
  return {
    results,
    pending: results.filter((r) => r["state"] === "pending").length,
    unresolved: results.filter((r) => r["state"] === "unresolved").length,
    resolved: results.filter((r) => r["state"] === "resolved").length,
  };
}

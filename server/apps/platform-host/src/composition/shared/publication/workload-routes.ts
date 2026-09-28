import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { runWithRequestContext, tryGetRequestContext } from "@athyper/server-foundation/context";
import type { Application } from "express";
import { sql } from "kysely";
import { calculateDefinitionHash, createKyselyPolicyRepository } from "@athyper/server-platform-policy";
import { canonicalJson } from "@athyper/server-plane-studio-meta-entity-authoring";
import { parseEnrollablePublicationPolicy } from "./enrollment-contract.js";
import { defineRouteContract, HttpError, registerContractRoute } from "@athyper/server-runtime-http";
import { createReferencePublicationWorkload, type ReferencePublicationWorkloadConfiguration, type ReferencePublicationWorkloadDependencies } from "./workload.js";
import { MACHINE_PUBLICATION_PERMISSION } from "./machine-policy.js";
import { executeCompilationRecovery } from "./compilation-recovery-execution.js";

type Configuration = Omit<ReferencePublicationWorkloadConfiguration, "policy" | "policyHash" | "machinePolicy">;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
/** Both mounted workload credentials authenticate execution; neither can enroll
 * policy. Only a hash-pinned persisted, independently activated policy supplies
 * the source and targets. Request bodies cannot supply grants or source graphs. */
export function registerPublicationWorkloadRoutes(app: Application, options: {
  configuration: Configuration; dependencies: ReferencePublicationWorkloadDependencies;
}) {
  const config = structuredClone(options.configuration);
  if (config.environment !== "local" || config.instance !== "dev" || config.domainSuffix !== "dev.athyper.test") throw Error("PUBLICATION_WORKLOAD_DEV_ONLY");
  if (!uuid.test(config.tenantId) || config.author.principalId === config.publisher.principalId
    || config.author.credentialSha256 === config.publisher.credentialSha256
    || ![config.author, config.publisher].every(c => uuid.test(c.principalId) && /^[a-f0-9]{64}$/.test(c.credentialSha256)))
    throw Error("PUBLICATION_WORKLOAD_MOUNT_INVALID");
  registerContractRoute(app, defineRouteContract({ method: "post", path: "/api/studio/publication-policies/:id/execute",
    operationId: "studio.publication_policy.execute", summary: "Execute an independently enrolled DEV publication policy",
    authenticated: true, tags: ["Studio"], responses: { 200: { description: "Publication dispatched", body: { type: "object", additionalProperties: true } },
      401: { description: "Workload credentials required" }, 403: { description: "Policy or IAM denied" }, 503: { description: "Runtime qualification unavailable" } },
  }), (req, res, next) => {
    try {
      res.setHeader("Cache-Control", "private, no-store");
      const credentials = { author: req.get("x-publication-author") ?? "", publisher: req.get("x-publication-publisher") ?? "" };
      for (const role of ["author", "publisher"] as const) {
        if (!/^[A-Za-z0-9_-]{43}$/.test(credentials[role]) || !timingSafeEqual(createHash("sha256").update(credentials[role]).digest(), Buffer.from(config[role].credentialSha256, "hex")))
          throw new HttpError(401, "PUBLICATION_WORKLOAD_AUTH_REQUIRED", "Both workload credentials are required");
      }
      // Only verified mounted identities enter the authenticated limiter.
      // This context is identification, not policy/IAM authorization.
      runWithRequestContext({ ...tryGetRequestContext(), requestId: tryGetRequestContext()?.requestId ?? randomUUID(),
        planeKey: "studio", tenantId: config.tenantId, principalId: config.publisher.principalId }, next);
    } catch (error) { next(error); }
  }, async (req, res, next) => {
    try {
      const credentials = { author: req.get("x-publication-author") ?? "", publisher: req.get("x-publication-publisher") ?? "" };
      const body = req.body, id = String(req.params.id);
      if (req.get("x-plane") !== "studio" || Object.keys(req.query).length || !uuid.test(id)
        || !body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).sort().join() !== "expectedHash,version"
        || typeof body.expectedHash !== "string" || !/^[a-f0-9]{64}$/.test(body.expectedHash) || !Number.isSafeInteger(body.version) || body.version < 1)
        throw new HttpError(400, "PUBLICATION_WORKLOAD_PIN_INVALID", "An exact policy revision is required");
      const pin = { id, version: body.version as number, hash: body.expectedHash as string };
      const definition = await options.dependencies.database.transaction().setIsolationLevel("repeatable read").execute(async tx => {
        await sql`SET TRANSACTION READ ONLY`.execute(tx);
        await sql`SELECT set_config('app.database_plane','studio',true),set_config('app.current_tenant_id',${config.tenantId},true),set_config('app.current_principal_id',${config.publisher.principalId},true)`.execute(tx);
        return createKyselyPolicyRepository().findExact!({ planeKey: "studio", tenantId: config.tenantId, entityType: "metadata.publication",
          effectiveOn: new Date().toISOString().slice(0, 10), revision: pin }, tx);
      });
      if (!definition || calculateDefinitionHash(definition) !== pin.hash || definition.rules.length !== 1)
        throw new HttpError(403, "PUBLICATION_WORKLOAD_POLICY_DENIED", "The enrolled policy is unavailable");
      const enrollment = definition.rules[0]!.actionConfig;
      if (definition.rules[0]!.action !== "allow" || enrollment.schema !== "athyper.machine-publication-enrollment/1"
        || enrollment.environment !== "dev" || enrollment.tenantId !== config.tenantId || enrollment.permissionCode !== MACHINE_PUBLICATION_PERMISSION)
        throw new HttpError(403, "PUBLICATION_WORKLOAD_POLICY_DENIED", "The enrolled policy does not authorize this workload");
      const policy = parseEnrollablePublicationPolicy(enrollment.policy);
      if (policy.schema === "athyper.dev-compilation-recovery-policy/1") {
        res.json(await executeCompilationRecovery(config, policy, pin, options.dependencies));
        return;
      }
      // The workflow independently rechecks current policy status, maker/checker,
      // actual workload IAM and principal revocation before doing authoring work.
      const workflow = createReferencePublicationWorkload({ ...config, policy, machinePolicy: pin,
        policyHash: createHash("sha256").update(canonicalJson(policy)).digest("hex") }, credentials, options.dependencies);
      res.json(await workflow.run());
    } catch (error) {
      if (error instanceof HttpError) return next(error);
      const code = error instanceof Error ? error.message : "";
      if (/^(MACHINE_PUBLICATION|REFERENCE_WORKLOAD|REFERENCE_ONBOARDING|PUBLICATION)_[A-Z0-9_]{1,100}$/.test(code))
        console.warn(JSON.stringify({ event: "publication.workload.denied", code }));
      if (/MACHINE_PUBLICATION_|REFERENCE_WORKLOAD_|REFERENCE_ONBOARDING_|ENTITY_SUCCESSOR_|COMPILATION_RECOVERY_|PUBLICATION_POLICY_SCHEMA_INVALID/.test(code))
        return next(new HttpError(403, "PUBLICATION_WORKLOAD_DENIED", "Publication authority or source admission was denied"));
      next(error);
    }
  });
}

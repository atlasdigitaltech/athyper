import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type {
  AuthorizationRequest,
  Authorizer,
} from "@athyper/server-contract-auth";
import {
  entityScopeResolvers,
  parseEntityAuthorizationProfile,
  type EntityAuthorizationProfileV1,
} from "@athyper/server-contract-metadata";
import { createShadowAuthorizer } from "@athyper/server-platform-iam";
import {
  createEntityAccessEvaluator,
  type EntityScopeAdapter,
  type EntityScopeCoordinates,
} from "@athyper/server-service-records";
import type { Application } from "@athyper/server-runtime-http";
import { sql, type Kysely } from "kysely";

export interface BusinessPartnerShadowConfig {
  readonly mode: "shadow";
  readonly profile: EntityAuthorizationProfileV1;
  readonly profileHash: string;
  /** Pinned predecessor vocabulary used only to identify legacy observations. */
  readonly observationProfile?: EntityAuthorizationProfileV1;
  readonly observationProfileHash?: string;
}
/** There is deliberately no enforce value or grant writer in this deployment seam. */
export function readBusinessPartnerShadowConfig(
  env: NodeJS.ProcessEnv,
): BusinessPartnerShadowConfig | undefined {
  const mode = env["BP_AUTHORIZATION_MODE"] ?? "off";
  if (mode === "off") return undefined;
  if (mode !== "shadow")
    throw new Error("BP_AUTHORIZATION_MODE must be off or shadow");
  const path = env["BP_AUTHORIZATION_PROFILE_PATH"],
    expected = env["BP_AUTHORIZATION_PROFILE_SHA256"];
  if (!path || !expected || !/^[a-f0-9]{64}$/.test(expected))
    throw new Error("BP shadow requires a pinned profile path and SHA256");
  const bytes = readFileSync(path);
  if (digest(bytes) !== expected)
    throw new Error("BP shadow profile SHA256 mismatch");
  const profile = parseEntityAuthorizationProfile(
    JSON.parse(bytes.toString("utf8")),
  );
  if (profile.entityCode !== "business_partner" || profile.planeKey !== "neon")
    throw new Error("BP shadow requires the NEON business_partner profile");
  const sourcePath = env["BP_AUTHORIZATION_OBSERVATION_PROFILE_PATH"];
  const sourceHash = env["BP_AUTHORIZATION_OBSERVATION_PROFILE_SHA256"];
  if (sourcePath || sourceHash) {
    if (!sourcePath || !sourceHash || !/^[a-f0-9]{64}$/.test(sourceHash))
      throw Error("BP observation profile requires an exact pin");
    const sourceBytes = readFileSync(sourcePath);
    if (digest(sourceBytes) !== sourceHash)
      throw Error("BP observation profile SHA256 mismatch");
    const observationProfile = parseEntityAuthorizationProfile(
      JSON.parse(sourceBytes.toString("utf8")),
    );
    if (
      observationProfile.entityCode !== profile.entityCode ||
      observationProfile.planeKey !== profile.planeKey
    )
      throw Error("BP observation profile identity mismatch");
    return {
      mode,
      profile,
      profileHash: expected,
      observationProfile,
      observationProfileHash: sourceHash,
    };
  }
  return { mode, profile, profileHash: expected };
}
const digest = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const string = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 && value.length <= 160
    ? value
    : undefined;
const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
    value,
  );
interface Journey {
  method: string;
  recordId?: string;
  routeFamily: string;
  observations: number;
  cache: Map<string, Promise<unknown>>;
}
export type BusinessPartnerShadowEvent = Readonly<
  Record<string, string | number | boolean | readonly string[]>
>;

export function createBusinessPartnerAuthorizationShadow(options: {
  config: BusinessPartnerShadowConfig;
  scopes: EntityScopeAdapter;
  emit: (event: BusinessPartnerShadowEvent) => void;
}) {
  const journeys = new AsyncLocalStorage<Journey>();
  const { profile, profileHash } = options.config;
  const observationProfile = options.config.observationProfile ?? profile;
  // Telemetry cannot affect HTTP responses, including response finish listeners.
  const emit = (event: BusinessPartnerShadowEvent) => {
    try {
      options.emit({
        schemaVersion: 1,
        event: "bp_authorization_shadow",
        planeKey: "neon",
        entityCode: "business_partner",
        profileHash,
        authority: "legacy",
        grantsChanged: false,
        ...event,
      });
    } catch {
      /* advisory */
    }
  };
  const bindings = profile.operations.map((operation) => ({
    entityCode: profile.entityCode,
    operationKey: operation.key,
    permissionCode: operation.permissionCode,
    decisionMode: "authorize",
    requiredScopeKinds: entityScopeResolvers[operation.scope].map(
      (key) =>
        ({
          operatingOrganizationId: "operating_organization",
          companyCodeId: "company_code",
          workspaceId: "workspace",
          networkRelationshipId: "network_relationship",
        })[key],
    ),
  }));
  return {
    register(application: Application) {
      application.use((request, response, next) => {
        // Store only validated coordinates and a fixed route family, never a URL, body, cookie or token.
        const bp = request.path.match(
          /^\/api\/neon\/business-partners\/([a-f0-9-]{36})(?:\/|$)/i,
        );
        const generic = request.path.match(
          /^\/api\/[^?]*business_partner(?:\/([a-f0-9-]{36}))?(?:\/|$)/i,
        );
        const family = bp
          ? "bp_360"
          : /\/business-partner-(cases|requests)(\/|$)/.test(request.path)
            ? "bp_requests"
            : generic
              ? "bp_records"
              : undefined;
        if (!family) return next();
        const id = bp?.[1] ?? generic?.[1];
        const journey: Journey = {
          method: request.method,
          routeFamily: family,
          ...(uuid(id) ? { recordId: id } : {}),
          observations: 0,
          cache: new Map(),
        };
        response.once("finish", () =>
          emit({
            kind: "http_outcome",
            routeFamily: family,
            method: request.method,
            status: response.statusCode,
            observations: journey.observations,
            evidence: "transport_only",
          }),
        );
        journeys.run(journey, next);
      });
      emit({
        kind: "started",
        mode: "shadow",
        candidateBindings: "isolated_preview",
        executionParity: false,
      });
    },
    wrap(authority: Authorizer): Authorizer {
      const observer = createShadowAuthorizer({
        authority,
        timeoutMs: 250,
        unavailable: () =>
          emit({
            kind: "unavailable",
            reason: "observer_failed_or_deadline",
            executionParity: false,
          }),
        async observe(request, legacy, signal) {
          const journey = journeys.getStore(),
            resource = request.resource ?? {};
          const recordId =
            string(resource["businessPartnerId"]) ??
            (resource["entityCode"] === "business_partner" ||
            resource["ownerEntityCode"] === "business_partner"
              ? string(resource["recordId"])
              : undefined) ??
            request.observation?.recordId ??
            (request.observation?.surface === "list"
              ? undefined
              : journey?.recordId);
          if (
            request.context.planeKey !== "neon" ||
            !(
              request.permissionCode.startsWith(
                "neon.relationship.business_partner",
              ) ||
              (request.permissionCode.startsWith(
                "neon.relationship.entity_case.",
              ) &&
                journeys.getStore()?.routeFamily === "bp_requests") ||
              request.observation?.entityCode === "business_partner" ||
              resource["entityCode"] === "business_partner" ||
              resource["ownerEntityCode"] === "business_partner" ||
              recordId
            )
          )
            return;
          if (journey) journey.observations++;
          const identity = {
            principalRef: digest(
              request.context.tenantId + ":" + request.context.principalId,
            ),
            snapshotRef: digest(
              request.context.permissions.profileHash +
                ":" +
                request.context.permissions.schemaHash,
            ),
            grantSnapshotRef: digest(
              JSON.stringify({
                evidence: request.context.permissions.evidence,
                allowed: request.context.permissions.allowed,
                denied: request.context.permissions.denied,
                planLocked: request.context.permissions.planLocked,
                planeExcluded: request.context.permissions.planeExcluded,
              }),
            ),
            authEpoch: request.context.authEpoch,
            requestRef: digest(request.context.requestId),
            permissionCode: request.permissionCode,
          };
          const actionKey = string(resource["actionCode"]),
            operationKey = string(resource["operationKey"]);
          // Resolve the legacy operation before selecting its target permission.
          // This vocabulary is never copied into grants or target bindings.
          let candidates = observationProfile.operations.filter(
            (o) => o.permissionCode === request.permissionCode,
          );
          // Native callers already use the published vocabulary. This only selects
          // an observation; it neither changes bindings nor authorizes the request.
          if (!candidates.length)
            candidates = profile.operations.filter(
              (o) => o.permissionCode === request.permissionCode,
            );
          // The non-enforcing Records adapter uses the descriptor's read permission
          // for list admission. Compare that explicit collection intent with the
          // target directory operation; do not invent an existing record from the
          // surrounding BP HTTP route or change the selected source decision.
          if (
            request.observation?.surface === "list" &&
            request.observation.operationKey === "discover" &&
            !resource["recordId"] &&
            !request.observation.recordId &&
            (!operationKey || operationKey === profile.recordReadOperation) &&
            request.permissionCode ===
              profile.operations.find(
                (o) => o.key === profile.recordReadOperation,
              )?.permissionCode
          ) {
            candidates = profile.operations.filter(
              (o) => o.key === profile.directory.operation,
            );
          }
          const caseKey =
            request.permissionCode.startsWith(
              "neon.relationship.entity_case.",
            ) &&
            !actionKey &&
            !resource["sectionCode"] &&
            !operationKey
              ? "case_" + request.permissionCode.split(".").at(-1)
              : undefined;
          const companySection =
            resource["sectionCode"] === "supplier-company" ||
            resource["sectionCode"] === "customer-company"
              ? resource["sectionCode"]
              : resource["companyCodeId"] &&
                  resource["operatingOrganizationId"] &&
                  (resource["roleLens"] === "supplier" ||
                    resource["roleLens"] === "customer")
                ? resource["roleLens"] + "-company"
                : undefined;
          const sectionKey =
            request.permissionCode === "neon.relationship.entity_case.read" &&
            resource["sectionCode"]
              ? "requests_read"
              : request.permissionCode ===
                    "neon.relationship.business_partner.read" && companySection
                ? companySection === "supplier-company"
                  ? "supplier_company_read"
                  : "customer_company_read"
                : undefined;
          const providerKey =
            request.permissionCode === "neon.supplier.qualification.admin"
              ? resource["companyCodeId"]
                ? "qualification_company"
                : "qualification"
              : undefined;
          const explicit =
            providerKey ??
            request.observation?.operationKey ??
            actionKey ??
            caseKey ??
            sectionKey ??
            (operationKey === "read"
              ? recordId
                ? "read"
                : "discover"
              : operationKey === "patch" &&
                  request.permissionCode ===
                    "neon.relationship.business_partner.update"
                ? "update"
                : operationKey);
          if (explicit && !resource["field"])
            candidates = candidates.filter((o) => o.key === explicit);
          if (
            !explicit &&
            request.permissionCode === "neon.relationship.business_partner.read"
          )
            candidates = candidates.filter(
              (o) => o.key === (recordId ? "read" : "discover"),
            );
          const field = string(resource["field"]);
          if (field) {
            const policy = observationProfile.fieldPolicies.find((p) =>
              p.fields.includes(field),
            );
            candidates = candidates.filter(
              (o) => o.key === policy?.readOperation,
            );
          }
          if (candidates.length !== 1) {
            emit({
              ...identity,
              kind: "mapping_gap",
              reason: candidates.length
                ? "ambiguous_operation"
                : "operation_not_profiled",
              candidates: candidates.map((o) => o.key),
              operationHint: profile.operations.some((o) => o.key === explicit)
                ? explicit!
                : "unrecognized",
              fieldCoordinatePresent: !!field,
              recordCoordinatePresent: !!recordId,
              legacy: legacy.allowed ? "allowed" : "denied",
              executionParity: false,
            });
            return;
          }
          const sourceOperation = candidates[0]!;
          const operation =
            profile.operations.find((o) => o.key === sourceOperation.key) ??
            (profile.deferredOperations?.includes(sourceOperation.key)
              ? sourceOperation
              : undefined);
          if (!operation) {
            emit({
              ...identity,
              kind: "mapping_gap",
              reason: "target_operation_missing",
              candidates: [sourceOperation.key],
              legacy: legacy.allowed ? "allowed" : "denied",
              executionParity: false,
            });
            return;
          }
          const coordinates: Record<string, string> = {};
          // A global master operation deliberately does not acquire the shell's organization/company.
          for (const key of entityScopeResolvers[operation.scope]) {
            const value = string(resource[key]);
            if (value) coordinates[key] = value;
          }
          const input = {
            context: request.context,
            operationKey: operation.key,
            ...(recordId ? { recordId } : {}),
            coordinates,
            phase: "discover" as const,
          };
          const scopes: EntityScopeAdapter = {
            ...options.scopes,
            async resolve(input) {
              const key = JSON.stringify([
                input.context.tenantId,
                input.context.principalId,
                input.context.authEpoch,
                input.recordId,
                input.target,
                input.resolver,
                input.coordinates,
              ]);
              let pending = journey?.cache.get(key) as
                ReturnType<EntityScopeAdapter["resolve"]> | undefined;
              if (!pending) {
                pending = options.scopes.resolve(input);
                journey?.cache.set(key, pending);
              }
              return pending;
            },
          };
          // Retain verified domain policy facts, never old coordinates or operation mappings.
          const domainFacts: Record<string, unknown> = {};
          for (const key of [
            "proposalOnly",
            "makerCheckerEnforced",
            "submittedBy",
            "approvedEvidencePinned",
            "requiresElevatedAssurance",
            "externalApplicant",
            "restrictedSessionRequired",
            "ownedRequestRequired",
            "qualificationControl",
            "preferenceControl",
            "createdBy",
          ])
            if (resource[key] !== undefined) domainFacts[key] = resource[key];
          const targetAuthority: Authorizer = {
            authorize: (request) =>
              authority.authorize({
                ...request,
                resource: { ...domainFacts, ...request.resource },
              }),
          };
          let trace: string[] = [];
          const evaluator = createEntityAccessEvaluator({
            profile,
            authorityRevision: profileHash,
            authorizer: targetAuthority,
            scopes,
            diagnostic: (event) => {
              if (trace.length < 8)
                trace.push(
                  `${event.operationKey}:${event.stage}:${event.state}`,
                );
            },
          });
          const installed = await evaluator.evaluate(input);
          const installedTrace = trace;
          trace = [];
          if (signal.aborted) return;
          // Only bindings are projected in the cloned advisory snapshot. All grant, deny, ACL,
          // entitlement, assurance and policy evidence remains exactly the authenticated snapshot.
          const candidate = await evaluator.evaluate({
            ...input,
            context: {
              ...request.context,
              permissions: {
                ...request.context.permissions,
                operationBindings: [
                  ...(
                    request.context.permissions.operationBindings ?? []
                  ).filter((b) => b.entityCode !== "business_partner"),
                  ...bindings,
                ],
              },
            },
          });
          if (signal.aborted) return;
          emit({
            ...identity,
            kind: "decision",
            operationKey: operation.key,
            surface:
              request.observation?.surface ??
              (field
                ? "field"
                : actionKey
                  ? "action"
                  : string(resource["sectionCode"])
                    ? "section"
                    : operation.target === "collection"
                      ? "list"
                      : "record"),
            legacy: legacy.allowed ? "allowed" : "denied",
            installedTarget: installed.state,
            candidateTarget: candidate.state,
            installedTrace,
            candidateTrace: trace,
            coordinateKinds: Object.keys(coordinates).sort(),
            recordCoordinatePresent: Boolean(recordId),
            differs:
              (legacy.allowed ? "allowed" : "denied") !== candidate.state,
            targetPhase: "discover",
            legacyPhase:
              request.observation?.phase ??
              (actionKey || journey?.method === "GET"
                ? "discover"
                : "authorization_gate"),
            evidence:
              operation.effect === "read" && !operation.requiresPreflight
                ? "authorization_comparison"
                : "command_discovery_preview",
            executionParity: false,
            bindingProjection: true,
          });
        },
      });
      // Unrelated entities never incur cloning, latency or shadow telemetry failures.
      return {
        ...(authority.checkSourceConstraints
          ? {
              checkSourceConstraints:
                authority.checkSourceConstraints.bind(authority),
            }
          : {}),
        ...(authority.enforcedEntityProfile
          ? {
              enforcedEntityProfile:
                authority.enforcedEntityProfile.bind(authority),
            }
          : {}),
        authorize(request) {
          return request.context.planeKey === "neon"
            ? request.permissionCode.startsWith(
                "neon.relationship.business_partner",
              ) ||
              (request.permissionCode.startsWith(
                "neon.relationship.entity_case.",
              ) &&
                journeys.getStore()?.routeFamily === "bp_requests") ||
              request.observation?.entityCode === "business_partner" ||
              request.resource?.["entityCode"] === "business_partner" ||
              request.resource?.["ownerEntityCode"] === "business_partner" ||
              request.resource?.["businessPartnerId"] ||
              journeys.getStore()?.recordId
              ? observer.authorize(request)
              : authority.authorize(request)
            : authority.authorize(request);
        },
      };
    },
  };
}

/** Read-only catalog validation. No domain locks, mutations, preflights or command replay. */
export function createBusinessPartnerShadowScopes(
  database: Kysely<Record<string, never>>,
): EntityScopeAdapter {
  let running = 0;
  return {
    async resolve(input) {
      if (
        input.entityCode !== "business_partner" ||
        input.context.planeKey !== "neon" ||
        ![
          "tenant.record.v1",
          "organization.record.v1",
          "company.record.v1",
          "organization-company.record.v1",
        ].includes(input.resolver)
      )
        return { state: "invalid" };
      if (running >= 4) throw new Error("BP shadow capacity reached");
      if (
        !uuid(input.context.tenantId) ||
        !uuid(input.context.principalId) ||
        (input.recordId && !uuid(input.recordId))
      )
        return { state: "invalid" };
      const coordinates = input.coordinates ?? {};
      if (Object.values(coordinates).some((v) => !uuid(v)))
        return { state: "invalid" };
      running++;
      try {
        return await database.transaction().execute(async (tx) => {
          await sql`SET TRANSACTION READ ONLY`.execute(tx);
          await sql`SET LOCAL statement_timeout='150ms'`.execute(tx);
          await sql`SELECT set_config('app.current_tenant_id', ${input.context.tenantId}, true), set_config('app.current_principal_id', ${input.context.principalId}, true), set_config('app.current_plane_key', 'neon', true)`.execute(
            tx,
          );
          if (input.target === "existing" || input.recordId) {
            const found = (
              await sql`SELECT 1 FROM master.business_partner WHERE tenant_id=${input.context.tenantId}::uuid AND id=${input.recordId}::uuid`.execute(
                tx,
              )
            ).rows.length;
            if (!found) return { state: "invalid" as const };
          }
          const org = coordinates.operatingOrganizationId,
            company = coordinates.companyCodeId;
          if (
            org &&
            !(
              await sql`SELECT 1 FROM master.operating_organization WHERE tenant_id=${input.context.tenantId}::uuid AND id=${org}::uuid AND status='active'`.execute(
                tx,
              )
            ).rows.length
          )
            return { state: "invalid" as const };
          if (
            company &&
            !(
              await sql`SELECT 1 FROM master.company_code WHERE tenant_id=${input.context.tenantId}::uuid AND id=${company}::uuid AND status='active' AND is_active`.execute(
                tx,
              )
            ).rows.length
          )
            return { state: "invalid" as const };
          if (
            org &&
            company &&
            !(
              await sql`SELECT 1 FROM master.operating_organization_company_assignment WHERE tenant_id=${input.context.tenantId}::uuid AND operating_organization_id=${org}::uuid AND company_code_id=${company}::uuid AND status='active' AND effective_from<=current_date AND (effective_until IS NULL OR effective_until>current_date)`.execute(
                tx,
              )
            ).rows.length
          )
            return { state: "invalid" as const };
          if (
            org &&
            input.recordId &&
            input.target === "existing" &&
            !(
              await sql`SELECT 1 FROM master.business_partner_operating_organization_assignment WHERE tenant_id=${input.context.tenantId}::uuid AND business_partner_id=${input.recordId}::uuid AND operating_organization_id=${org}::uuid AND status='active' AND is_active AND effective_from<=current_date AND (effective_until IS NULL OR effective_until>current_date)`.execute(
                tx,
              )
            ).rows.length
          )
            return { state: "invalid" as const };
          return {
            state: "resolved" as const,
            coordinates: coordinates as EntityScopeCoordinates,
          };
        });
      } finally {
        running--;
      }
    },
    async preflight() {
      throw new Error("Shadow must never run command preflight");
    },
  };
}

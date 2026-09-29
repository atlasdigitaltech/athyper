import { identityProblem as problem } from "./http-problem.js";
import {
  createIamService,
  createIamAuthenticationMiddleware,
  readVerifiedRequestContext,
} from "@athyper/server-platform-iam";
import type { Container } from "../../../kernel/container.js";
import { sql, type Transaction } from "kysely";
import {
  defineRouteContract,
  registerContractRoute,
} from "@athyper/server-runtime-http";

type Row = Record<string, unknown>;
type SystemWork = <Result>(
  work: (transaction: Transaction<Record<string, never>>) => Promise<Result>,
) => Promise<Result>;

export function registerTrustedDeviceRoutes(
  application: Parameters<Container["platform"]["httpRegistrars"][number]>[0],
  container: Container,
  authenticator: ReturnType<typeof createIamService>,
): void {
  const authenticate = createIamAuthenticationMiddleware(authenticator);
  registerContractRoute(
    application,
    defineRouteContract({
      method: "post",
      path: "/api/iam/trusted-devices",
      operationId: "iam.registerTrustedDevice",
      summary: "Register remembered-device evidence after verified step-up",
      tags: ["IAM"],
      authenticated: true,
      request: {
        body: {
          type: "object",
          properties: {
            deviceTokenHash: { type: "string", pattern: "^[0-9a-f]{64}$" },
            ttlSeconds: { type: "integer", minimum: 60, maximum: 7_776_000 },
            userAgent: { type: "string", maxLength: 2048 },
          },
          required: ["deviceTokenHash", "ttlSeconds"],
        },
      },
      responses: {
        201: {
          description: "Remembered-device evidence registered",
          body: { type: "object" },
        },
        400: { description: "Invalid registration" },
        401: { description: "Authentication required" },
        403: { description: "Context rejected" },
        409: { description: "Token digest collision" },
        503: { description: "Exact-plane authority unavailable" },
      },
    }),
    authenticate,
    async (request, response, next) => {
      try {
        const context = readVerifiedRequestContext(response);
        if (!hasSecondFactor(context.authenticationMethods)) {
          response
            .status(403)
            .json(
              problem(
                403,
                "AUTH_STEP_UP_ASSURANCE_REQUIRED",
                "Trusted-device enrollment requires issuer-proven multi-factor authentication",
              ),
            );
          return;
        }
        const hash =
          typeof request.body?.deviceTokenHash === "string"
            ? request.body.deviceTokenHash
            : "";
        const ttlSeconds = request.body?.ttlSeconds;
        const userAgent = request.body?.userAgent;
        if (
          !/^[0-9a-f]{64}$/.test(hash) ||
          typeof ttlSeconds !== "number" ||
          !Number.isInteger(ttlSeconds) ||
          ttlSeconds < 60 ||
          ttlSeconds > 7_776_000 ||
          (userAgent !== undefined &&
            (typeof userAgent !== "string" || userAgent.length > 2048))
        ) {
          response
            .status(400)
            .json(
              problem(
                400,
                "AUTH_TRUSTED_DEVICE_REGISTRATION_INVALID",
                "Trusted-device registration is invalid",
              ),
            );
          return;
        }
        const run = tenantContextTransaction(container, context.planeKey);
        if (!run) {
          response
            .status(503)
            .json(
              problem(
                503,
                "AUTH_TRUSTED_DEVICE_DIRECTORY_UNAVAILABLE",
                "Exact-plane trusted-device authority is unavailable",
              ),
            );
          return;
        }
        const row = await run(async (transaction) => {
          const created = (
            await sql<{ id: string; expiresAt: string }>`
          INSERT INTO authz.trusted_device
            (tenant_id,principal_id,auth_epoch,device_token_hash,user_agent,expires_at,created_by)
          VALUES
            (${context.tenantId}::uuid,${context.principalId}::uuid,${context.authEpoch},${hash},${typeof userAgent === "string" ? userAgent : null},clock_timestamp()+(${ttlSeconds}*interval '1 second'),${context.principalId}::uuid)
          ON CONFLICT (tenant_id,device_token_hash) DO NOTHING
          RETURNING id::text,expires_at::text AS "expiresAt"
        `.execute(transaction)
          ).rows[0];
          if (created)
            await container.platform.audit?.record(
              {
                eventCode: "iam.trusted_device.registered",
                action: "create",
                outcome: "success",
                actor: { kind: "user", principalId: context.principalId },
                tenantId: context.tenantId,
                entityType: "authz.trusted_device",
                entityId: created.id,
                requestId: context.requestId,
                ...(context.correlationId
                  ? { correlationId: context.correlationId }
                  : {}),
                metadata: {
                  planeKey: context.planeKey,
                  expiresAt: created.expiresAt,
                },
              },
              transaction,
            );
          return created;
        });
        if (!row) {
          response
            .status(409)
            .json(
              problem(
                409,
                "AUTH_TRUSTED_DEVICE_TOKEN_COLLISION",
                "Trusted-device registration could not allocate unique evidence",
              ),
            );
          return;
        }
        response.setHeader("Cache-Control", "private, no-store");
        response.status(201).json({
          tenantId: context.tenantId,
          principalId: context.principalId,
          expiresAt: row.expiresAt,
        });
      } catch (error) {
        next(error);
      }
    },
  );
  registerContractRoute(
    application,
    defineRouteContract({
      method: "post",
      path: "/api/iam/trusted-devices/verify",
      operationId: "iam.verifyTrustedDevice",
      summary:
        "Verify remembered-device evidence in the exact authenticated plane",
      tags: ["IAM"],
      authenticated: true,
      request: {
        body: {
          type: "object",
          properties: {
            deviceTokenHash: { type: "string", pattern: "^[0-9a-f]{64}$" },
          },
          required: ["deviceTokenHash"],
        },
      },
      responses: {
        200: {
          description: "Current remembered-device decision",
          body: { type: "object" },
        },
        400: { description: "Invalid token digest" },
        401: { description: "Authentication required" },
        403: { description: "Context rejected" },
        503: { description: "Exact-plane authority unavailable" },
      },
    }),
    authenticate,
    async (request, response, next) => {
      try {
        const context = readVerifiedRequestContext(response);
        const hash =
          typeof request.body?.deviceTokenHash === "string"
            ? request.body.deviceTokenHash
            : "";
        if (!/^[0-9a-f]{64}$/.test(hash)) {
          response
            .status(400)
            .json(
              problem(
                400,
                "AUTH_TRUSTED_DEVICE_TOKEN_INVALID",
                "Trusted-device token digest is invalid",
              ),
            );
          return;
        }
        const run = tenantContextTransaction(container, context.planeKey);
        if (!run) {
          response
            .status(503)
            .json(
              problem(
                503,
                "AUTH_TRUSTED_DEVICE_DIRECTORY_UNAVAILABLE",
                "Exact-plane trusted-device authority is unavailable",
              ),
            );
          return;
        }
        const row = await run(
          async (transaction) =>
            (
              await sql<{ expiresAt: string }>`
        UPDATE authz.trusted_device
           SET last_seen_at=clock_timestamp()
         WHERE tenant_id=${context.tenantId}::uuid
           AND principal_id=${context.principalId}::uuid
           AND auth_epoch=${context.authEpoch}
           AND device_token_hash=${hash}
           AND revoked_at IS NULL
           AND expires_at>clock_timestamp()
         RETURNING expires_at::text AS "expiresAt"
      `.execute(transaction)
            ).rows[0],
        );
        response.setHeader("Cache-Control", "private, no-store");
        response.status(200).json(
          row
            ? {
                active: true,
                tenantId: context.tenantId,
                principalId: context.principalId,
                expiresAt: row.expiresAt,
              }
            : {
                active: false,
                tenantId: context.tenantId,
                principalId: context.principalId,
              },
        );
      } catch (error) {
        next(error);
      }
    },
  );
}

function tenantContextTransaction(
  container: Container,
  plane: "neon" | "mesh" | "studio",
): SystemWork | undefined {
  if (plane === "neon" && container.adapters.neonDatabase)
    return (work) =>
      container.adapters.neonDatabase!.withTenantTransaction((transaction) =>
        work(transaction as unknown as Transaction<Record<string, never>>),
      );
  if (plane === "mesh" && container.adapters.meshDatabase)
    return (work) =>
      container.adapters.meshDatabase!.withTenantTransaction((transaction) =>
        work(transaction as unknown as Transaction<Record<string, never>>),
      );
  if (plane === "studio" && container.adapters.athyperDatabase)
    return (work) =>
      container.adapters.athyperDatabase!.withTenantTransaction((transaction) =>
        work(transaction as unknown as Transaction<Record<string, never>>),
      );
  return undefined;
}

function hasSecondFactor(methods: readonly string[] | undefined): boolean {
  return (
    methods?.some((method) =>
      [
        "otp",
        "webauthn",
        "webauthn-passwordless",
        "fido",
        "fido2",
        "hwk",
        "mfa",
      ].includes(method.trim().toLowerCase()),
    ) === true
  );
}

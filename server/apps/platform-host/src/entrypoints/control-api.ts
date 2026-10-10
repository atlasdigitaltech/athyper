import { loadPublicationWorkloadConfiguration } from "../composition/shared/publication/workload-configuration.js";
import { createNativeBootstrapStartup } from "../composition/control-plane/native-bootstrap-startup.js";
import {
  createDeployedComponentArtifactQualification,
  createDeployedComponentQualification,
} from "../composition/shared/publication/component-qualification.js";
import { createResourceVerifier } from "../composition/control-plane/resource-verifier.js";
import { createControlResourceReview } from "../composition/control-plane/resource-review.js";
import { createResourceSourceQualification } from "../composition/control-plane/resource-source-qualification.js";
import { createFileAuthoringResourceSnapshotReader } from "@athyper/server-service-publication";
import type { EntityAuthoringResourceSource } from "@athyper/server-contract-publication";
import { parseReferenceResourceConfiguration } from "../composition/control-plane/reference-resource-configuration.js";
import { createCurrentResourceReviewEligibility } from "../composition/control-plane/resource-review-eligibility.js";
import { createControlProductCommandRuntime } from "../composition/control-plane/product-command-runtime.js";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { Kysely, sql } from "kysely";
import {
  createPostgresPool,
  createPostgresDialect,
} from "@athyper/server-adapter-db-core";
import { createKeycloakAuthAdapter } from "@athyper/server-adapter-auth-keycloak";
import { createInfisicalSecretStore } from "@athyper/server-adapter-secretstore-infisical";
import {
  canonicalBytes,
  sha256,
  TrustScopedPublicationKeyResolver,
  Ed25519PublicationSigner,
  Ed25519PublicationVerifier,
} from "@athyper/server-adapter-publication-signing";
import {
  createAuditService,
  createStructuredLogAuditSink,
  createTransactionBoundAuditSink,
} from "@athyper/server-platform-audit";
import {
  createIamConfig,
  createIamService,
} from "@athyper/server-platform-iam";
import {
  createHttpApplication,
  HttpDrainController,
} from "@athyper/server-runtime-http";
import { readControlPlaneConfiguration } from "../config/control-plane.js";
import { createControlPlaneIdentityResolver } from "../composition/control-plane/identity.js";
import { registerControlPlane } from "../composition/control-plane/control-plane.js";
import { launchControlApi } from "../kernel/launch.js";
import { captureOperationalError } from "../diagnostics/telemetry/error-collector.js";

// Deliberately does not import main.ts, combined configuration, or bootstrap.
// No workers, scheduler, tenant routes, or customer-plane adapters are loaded.
async function readPrivateFile(path: string): Promise<Buffer> {
  const metadata = await stat(path);
  if (
    !metadata.isFile() ||
    (metadata.mode & 0o077) !== 0 ||
    metadata.size > 65536
  )
    throw Error("CONTROL_PLANE_SECRET_FILE_INVALID");
  return readFile(path);
}

export async function startControlApi() {
  const config = readControlPlaneConfiguration(process.env);
  const database = new Kysely<Record<string, never>>({
    dialect: createPostgresDialect(
      createPostgresPool({
        connectionString: (await readPrivateFile(config.databaseUrlFile))
          .toString("utf8")
          .trim(),
        max: 4,
      }),
    ),
  });
  const commandConnections: Kysely<Record<string, never>>[] = [];
  try {
    const role = (
      await sql<{
        safe: boolean;
      }>`SELECT NOT rolsuper AND NOT rolbypassrls AS safe
      FROM pg_roles WHERE rolname=current_user`.execute(database)
    ).rows;
    if (role.length !== 1 || !role[0]!.safe)
      throw Error("CONTROL_PLANE_DATABASE_ROLE_UNSAFE");
    const secretStore = config.secretStore
      ? createInfisicalSecretStore({
          endpoint: config.secretStore.endpoint,
          workspaceId: config.secretStore.workspaceId,
          environment: "dev",
          token: (await readPrivateFile(config.secretStore.tokenFile))
            .toString("utf8")
            .trim(),
        })
      : undefined;
    const keys = new TrustScopedPublicationKeyResolver(
      {
        async resolve(reference) {
          if (reference === "control.signing")
            return secretStore
              ? secretStore.resolve("PUBLICATION_DEV_SIGNING_PRIVATE_V1")
              : {
                  bytes: await readPrivateFile(config.privateKeyFile!),
                  version: "mounted",
                };
          if (reference === "control.verification")
            return secretStore
              ? secretStore.resolve("PUBLICATION_DEV_SIGNING_PUBLIC_V1")
              : {
                  bytes: await readFile(config.publicKeyFile!),
                  version: "mounted",
                };
          throw Error("CONTROL_PLANE_SECRET_REFERENCE_DENIED");
        },
      },
      {
        manifest: JSON.parse(await readFile(config.trustManifestFile, "utf8")),
        domain: "dev",
        access: "sign_and_verify",
        keys: [
          {
            keyId: config.signingKeyId,
            privateKeyReference: "control.signing",
            publicKeyReferences: ["control.verification"],
          },
        ],
      },
    );
    if (!(await keys.health(config.signingKeyId, true)).healthy)
      throw Error("CONTROL_PLANE_TRUST_UNAVAILABLE");
    const signer = new Ed25519PublicationSigner(keys),
      verifier = new Ed25519PublicationVerifier(keys);
    const resourceVerifier = config.referenceTrustFile
      ? createResourceVerifier(
          JSON.parse(await readFile(config.referenceTrustFile, "utf8")),
        )
      : verifier;
    const audit = createAuditService({
      sink: createTransactionBoundAuditSink(
        createStructuredLogAuditSink({
          info(event, fields) {
            console.info(JSON.stringify({ event, ...fields }));
          },
        }),
        {
          async append(event, transaction) {
            await sql`SELECT audit.append_event(p_event_code := ${event.eventCode},p_operation := 'execute'::audit.operation_d,
        p_entity_type := ${event.entityType ?? "platform.audit_event"},p_entity_id := ${event.entityId ?? null}::uuid,
        p_outcome := ${event.outcome}::audit.outcome_d,p_severity := ${event.severity}::audit.event_severity_d,
        p_context := ${JSON.stringify({ ...event.metadata, recorderEventId: event.id })}::jsonb,
        p_request_id := ${event.requestId ?? null},p_occurred_at := ${event.occurredAt}::timestamptz)
      `.execute(transaction as Kysely<Record<string, never>>);
          },
        },
      ),
    });
    const tokenVerifier = createKeycloakAuthAdapter({
      defaultRealm: {
        issuerUrl: config.authority.issuer,
        audience: config.authority.audience,
        jwksUrl: config.jwksUrl,
      },
    });
    await tokenVerifier.warmUp();
    const authenticator = createIamService({
      tokenVerifier,
      audit,
      config: createIamConfig({
        environment: "local",
        defaultRealmKey: config.authority.realmKey,
        // Plane admission and permissions come from the exact Studio DB resolver,
        // not the ordinary tenant app's legacy realm-role naming convention.
        claimContextMode: "enforce",
        requireAuthorizedRole: false,
        enforceRequiredActions: true,
      }),
      resolveIdentityContext: createControlPlaneIdentityResolver(
        database,
        config.authority,
      ),
    });
    const commandConnection = async (file: string) => {
      const connection = new Kysely<Record<string, never>>({
        dialect: createPostgresDialect(
          createPostgresPool({
            connectionString: (await readPrivateFile(file))
              .toString("utf8")
              .trim(),
            max: 2,
          }),
        ),
      });
      commandConnections.push(connection);
      return connection;
    };
    const nativeTargetDatabases: Partial<
      Record<"neon" | "mesh", Kysely<Record<string, never>>>
    > = {};
    for (const plane of ["neon", "mesh"] as const) {
      const file = config.nativeTargetDatabaseUrlFiles[plane];
      if (!file) continue;
      const target = await commandConnection(file);
      const safe = (
        await sql<{
          safe: boolean;
        }>`SELECT NOT rolsuper AND NOT rolbypassrls AS safe FROM pg_roles WHERE rolname=current_user`.execute(
          target,
        )
      ).rows;
      if (safe.length !== 1 || !safe[0]!.safe)
        throw Error("CONTROL_NATIVE_TARGET_ROLE_UNSAFE");
      nativeTargetDatabases[plane] = target;
    }
    const nativeBootstrap: Partial<
      ReturnType<typeof createNativeBootstrapStartup>
    > = config.nativeBootstrapConfigurationFile
      ? createNativeBootstrapStartup({
          targetDatabases: nativeTargetDatabases,
          configuration: JSON.parse(
            (
              await readPrivateFile(config.nativeBootstrapConfigurationFile)
            ).toString("utf8"),
          ),
          authorityTenantId: config.authority.tenantId,
          loader: {
            canonicalizer: { canonicalBytes, sha256 },
            verifier: resourceVerifier,
            runtimeVersion: "1.0.0",
            store: {
              async get() {
                throw Error("NATIVE_COMPONENT_LOCKED_BYTES_REQUIRED");
              },
              async putImmutable() {
                throw Error("NATIVE_COMPONENT_READER_IS_READ_ONLY");
              },
            },
            uiComponents: createDeployedComponentArtifactQualification(
              process.env,
              {
                canonicalBytes,
                sha256,
              },
            ),
          },
          audit: async (tx, input, result) => {
            const event = await audit.record(
              {
                eventCode: "metadata.entity.product.enrollment",
                severity: "critical",
                tenantId: config.authority.tenantId,
                actor: { kind: "user", principalId: input.actorId },
                entityType: "metadata.entity_change_set",
                entityId: input.changeSetId,
                action: "native_bootstrap",
                outcome: "success",
                metadata: {
                  idempotencyKey: input.idempotencyKey,
                  proposalHash: input.proposalHash,
                  revision: result.revision,
                  graphHash: result.graphHash,
                  compiledHash: result.compiledHash,
                  replay: result.replay,
                },
              },
              tx,
            );
            if (
              !event.id ||
              event.actor.principalId !== input.actorId ||
              event.tenantId !== config.authority.tenantId
            )
              throw Error("PRODUCT_REFERENCE_AUDIT_REQUIRED");
          },
        })
      : {};
    const productLabelEnrollment = config.productCommands
      ? await createControlProductCommandRuntime({
          ...(config.nativeBootstrapConfigurationFile
            ? {
                nativeBootstrapProposals:
                  nativeBootstrap.nativeBootstrapProposals!,
                nativeBootstrapResources:
                  nativeBootstrap.nativeBootstrapResources!,
              }
            : {}),
          governanceDatabase: database,
          issuerDatabase: await commandConnection(
            config.productCommands.issuerDatabaseUrlFile,
          ),
          commandDatabase: await commandConnection(
            config.productCommands.applicationDatabaseUrlFile,
          ),
          applicationLogin: config.productCommands.applicationLogin,
          labels: JSON.parse(
            (
              await readPrivateFile(config.productCommands.labelPolicyFile)
            ).toString("utf8"),
          ),
          authority: config.authority,
          audit,
          ...(config.referenceResourcePolicyFile
            ? {
                referenceResources: {
                  ...parseReferenceResourceConfiguration(
                    JSON.parse(
                      (
                        await readPrivateFile(
                          config.referenceResourcePolicyFile,
                        )
                      ).toString("utf8"),
                    ),
                  ),
                  authorityTenantId: config.authority.tenantId,
                  verifier: resourceVerifier,
                  authorizeReview: async (_tx, input) =>
                    createCurrentResourceReviewEligibility({
                      database,
                      authority: config.authority,
                    })(input),
                  async audit(tx, context, input, result) {
                    const event = await audit.record(
                      {
                        eventCode: "metadata.entity.product.enrollment",
                        action: "reference_enrollment",
                        outcome: "success",
                        severity: "critical",
                        tenantId: context.tenantId,
                        actor: {
                          kind: "user",
                          principalId: context.principalId,
                        },
                        entityType: "metadata.entity_change_set",
                        entityId: input.changeSetId,
                        requestId: context.requestId,
                        metadata: {
                          idempotencyKey: input.idempotencyKey,
                          sourceHash: input.expectedSourceHash,
                          revision: result.revision,
                        },
                      },
                      tx,
                    );
                    if (
                      !event.id ||
                      event.tenantId !== context.tenantId ||
                      event.actor.principalId !== context.principalId
                    )
                      throw Error("PRODUCT_REFERENCE_AUDIT_REQUIRED");
                  },
                },
              }
            : {}),
        })
      : undefined;
    if (
      config.nativeBootstrapConfigurationFile &&
      !productLabelEnrollment?.referenceEnrollment?.nativeBootstrap
    )
      throw Error("CONTROL_NATIVE_BOOTSTRAP_RUNTIME_REQUIRED");
    const localPublicationConfiguration = loadPublicationWorkloadConfiguration(
      process.env,
      "local",
    );
    const drain = new HttpDrainController();
    const app = createHttpApplication({
      environment: "local",
      exposeErrorDetails: false,
      jsonLimit: "64kb",
      drainController: drain,
      requestDeadlineMs: 15000,
      openApi: false,
      onUnexpectedError(error, request) {
        captureOperationalError(error, {
          "http.method": request.method,
          "http.path": request.path,
        });
      },
      rateLimit: { windowMs: 60000, maxRequests: 60, scope: "source" },
      configure(application) {
        registerControlPlane(application, {
          ...(localPublicationConfiguration?.localAuthority
            ? {
                localPublication: {
                  configuration: localPublicationConfiguration,
                  targetDatabases: nativeTargetDatabases,
                },
              }
            : {}),
          ...(config.nativeBootstrapConfigurationFile
            ? { nativeSource: nativeBootstrap.nativeSource! }
            : {}),
          database,
          audit,
          authenticator,
          authority: config.authority,
          ...(config.resourceProducer
            ? {
                resourceReview: createControlResourceReview({
                  database,
                  authority: config.authority,
                  audit,
                  canonical: { canonicalBytes, sha256 },
                  readSnapshot: async (id) =>
                    (await createFileAuthoringResourceSnapshotReader(
                      config.resourceProducer!.sourceDirectory,
                      4194304,
                    )(id)) as EntityAuthoringResourceSource,
                  qualify: createResourceSourceQualification(
                    config.resourceProducer.descriptorHash,
                    { canonicalBytes, sha256 },
                    createDeployedComponentQualification(process.env, {
                      canonicalBytes,
                      sha256,
                    }),
                  ),
                }),
              }
            : {}),
          ...(productLabelEnrollment
            ? {
                productLabelEnrollment,
                ...(productLabelEnrollment.referenceEnrollment
                  ? {
                      productReferenceEnrollment:
                        productLabelEnrollment.referenceEnrollment,
                    }
                  : {}),
              }
            : {}),
          environment: "local",
          instance: "dev",
          domainSuffix: "dev.athyper.test",
          signer: {
            sign: async (payload) => ({
              keyId: config.signingKeyId,
              ...(await signer.sign({
                keyId: config.signingKeyId,
                algorithm: "Ed25519",
                bytes: Buffer.from(payload),
              })),
            }),
            verify: (payload, keyId, signature) =>
              verifier.verify({
                keyId,
                algorithm: "Ed25519",
                bytes: Buffer.from(payload),
                signature,
              }),
          },
        });
      },
    });
    const server = createServer(app);
    // All-interface binding is only for the private, non-published container network.
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(config.port, config.listenHost, resolve);
    });
    let stopping = false;
    const shutdown = async () => {
      if (stopping) return;
      stopping = true;
      drain.beginDrain();
      const closed = new Promise<void>((resolve) =>
        server.close(() => resolve()),
      );
      if (!(await drain.waitForDrain(15000))) {
        drain.abortActive();
        server.closeAllConnections();
      }
      await closed;
      await Promise.all(
        commandConnections.map((connection) => connection.destroy()),
      );
      await database.destroy();
    };
    process.once("SIGTERM", () => {
      void shutdown();
    });
    process.once("SIGINT", () => {
      void shutdown();
    });
    console.info(
      JSON.stringify({
        event: "control_api.started",
        port: config.port,
        realm: config.authority.realmKey,
      }),
    );
  } catch (error) {
    await Promise.allSettled(
      commandConnections.map((connection) => connection.destroy()),
    );
    await database.destroy();
    throw error;
  }
}

void launchControlApi();

import {
  createKeycloakAuthAdapter,
  type KeycloakAuthAdapter,
  type KeycloakAuthAdapterConfig,
} from "@athyper/server-adapter-auth-keycloak";
import {
  createRedisCacheAdapter,
  createRedisNotificationEventBus,
  type RedisCacheAdapter,
  type RedisCacheAdapterConfig,
  type RedisNotificationEventBus,
} from "@athyper/server-adapter-cache-redis";
import {
  createEmailAdapter,
  createFcmPushAdapter,
  createMetaWhatsAppAdapter,
  createSmsAdapter,
  createWebPushAdapter,
  type EmailAdapterConfig,
  type FcmPushAdapterConfig,
  type MetaWhatsAppAdapterConfig,
  type SmsAdapterConfig,
  type WebPushAdapterConfig,
} from "@athyper/server-adapter-communications";
import type {
  NotificationChannelHandler,
  PushTransport,
} from "@athyper/server-contract-notifications";
import {
  createAthyperDatabaseAdapter,
  type AthyperDatabaseAdapter,
  type AthyperDatabaseAdapterConfig,
} from "@athyper/server-adapter-db-athyper";
import {
  createMeshDatabaseAdapter,
  type MeshDatabaseAdapter,
  type MeshDatabaseAdapterConfig,
} from "@athyper/server-adapter-db-mesh";
import {
  createNeonDatabaseAdapter,
  type NeonDatabaseAdapter,
  type NeonDatabaseAdapterConfig,
} from "@athyper/server-adapter-db-neon";
import { qualifyRuntimePlaneDatabase } from "./database-qualification.js";
import {
  createS3ObjectStorageAdapter,
  type S3ObjectStorageAdapter,
  type S3ObjectStorageAdapterConfig,
} from "@athyper/server-adapter-object-storage-s3";
import {
  createClamAvMalwareScanner,
  type ClamAvMalwareScanner,
  type ClamAvMalwareScannerConfig,
} from "@athyper/server-adapter-malware-clamav";
import {createTikaContentExtractor,type TikaContentExtractor,type TikaContentExtractorConfig} from "@athyper/server-adapter-document-parser-tika";
import {createMeilisearchIndex,type MeilisearchIndex,type MeilisearchIndexConfig} from "@athyper/server-adapter-search-meilisearch";
import {
  createGotenbergRenderer,
  type GotenbergRendererConfig,
} from "@athyper/server-adapter-rendering";
import type { PdfRenderer } from "@athyper/server-contract-rendering";
import { createPreviewRendererAdapter, type PreviewRendererConfig } from "@athyper/server-adapter-preview-renderer";
import type { DerivativeRenderer } from "@athyper/server-contract-derivatives";
import {
  createOpenTelemetryAdapter,
  type OpenTelemetryAdapter,
  type OpenTelemetryAdapterConfig,
} from "@athyper/server-adapter-telemetry-otel";
import { tryGetRequestContext } from "@athyper/server-foundation/context";
import type { LifecycleManager } from "@athyper/server-foundation/lifecycle";
import { CachedPublicationKeyResolver, Ed25519PublicationSigner, Ed25519PublicationVerifier, sha256 } from "@athyper/server-adapter-publication-signing";
import { createInfisicalSecretStore, type InfisicalSecretStoreConfig } from "@athyper/server-adapter-secretstore-infisical";
import type { SecretStore } from "@athyper/server-contract-secrets";
import { ImmutablePublicationArtifactStore } from "@athyper/server-service-publication";

import type { HostConfig } from "../config/index.js";
import type { Container } from "./create-container.js";

export interface AdapterRegistrationDependencies {
  createKeycloakAuth(config: KeycloakAuthAdapterConfig): KeycloakAuthAdapter;
  createRedisCache(config: RedisCacheAdapterConfig): RedisCacheAdapter;
  createNotificationEvents(client: RedisCacheAdapter["client"]): RedisNotificationEventBus;
  createNeonDatabase(config: NeonDatabaseAdapterConfig): NeonDatabaseAdapter;
  createAthyperDatabase(
    config: AthyperDatabaseAdapterConfig,
  ): AthyperDatabaseAdapter;
  createMeshDatabase(config: MeshDatabaseAdapterConfig): MeshDatabaseAdapter;
  createObjectStorage(
    config: S3ObjectStorageAdapterConfig,
  ): S3ObjectStorageAdapter;
  createMalwareScanner(config: ClamAvMalwareScannerConfig): ClamAvMalwareScanner;
  createContentExtractor(config:TikaContentExtractorConfig):TikaContentExtractor;
  createSearchIndex(config:MeilisearchIndexConfig):MeilisearchIndex;
  createOpenTelemetry(
    config: OpenTelemetryAdapterConfig,
  ): OpenTelemetryAdapter;
  createEmail(config: EmailAdapterConfig): NotificationChannelHandler;
  createSms(config: SmsAdapterConfig): NotificationChannelHandler;
  createMetaWhatsApp(config: MetaWhatsAppAdapterConfig): NotificationChannelHandler;
  createFcmPush(config: FcmPushAdapterConfig): PushTransport;
  createWebPush(config: WebPushAdapterConfig): PushTransport;
  createPdfRenderer(config: GotenbergRendererConfig): PdfRenderer;
  createPreviewRenderer(config: PreviewRendererConfig): DerivativeRenderer;
  createSecretStore?(config: InfisicalSecretStoreConfig): SecretStore;
}

const DEFAULT_DEPENDENCIES: AdapterRegistrationDependencies = {
  createKeycloakAuth: createKeycloakAuthAdapter,
  createRedisCache: createRedisCacheAdapter,
  createNotificationEvents: createRedisNotificationEventBus,
  createNeonDatabase: createNeonDatabaseAdapter,
  createAthyperDatabase: createAthyperDatabaseAdapter,
  createMeshDatabase: createMeshDatabaseAdapter,
  createObjectStorage: createS3ObjectStorageAdapter,
  createMalwareScanner: createClamAvMalwareScanner,
  createContentExtractor:createTikaContentExtractor,
  createSearchIndex:createMeilisearchIndex,
  createOpenTelemetry: createOpenTelemetryAdapter,
  createEmail: createEmailAdapter,
  createSms: createSmsAdapter,
  createMetaWhatsApp: createMetaWhatsAppAdapter,
  createFcmPush: createFcmPushAdapter,
  createWebPush: createWebPushAdapter,
  createPdfRenderer: createGotenbergRenderer,
  createPreviewRenderer: createPreviewRendererAdapter,
  createSecretStore: createInfisicalSecretStore,
};

/** The only composition boundary allowed to instantiate concrete adapters. */
export function registerAdapters(
  container: Container,
  config: HostConfig,
  lifecycle: LifecycleManager,
  dependencyOverrides: Partial<AdapterRegistrationDependencies> = {},
): void {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...dependencyOverrides };
  let openTelemetry: OpenTelemetryAdapter | undefined;

  if (config.openTelemetry.endpoint) {
    openTelemetry = dependencies.createOpenTelemetry({
      endpoint: config.openTelemetry.endpoint,
      serviceName: config.openTelemetry.serviceName,
      serviceVersion: config.openTelemetry.serviceVersion,
      environment: config.env,
      processMode: config.mode,
      enableAutoInstrumentations:
        config.openTelemetry.enableAutoInstrumentations,
    });
    container.adapters.openTelemetry = openTelemetry;
    lifecycle.onReady(() => openTelemetry!.start());
  }

  if (config.keycloak.issuerUrl && config.keycloak.audience) {
    const keycloakAuth = dependencies.createKeycloakAuth({
      defaultRealm: {
        issuerUrl: config.keycloak.issuerUrl,
        audience: config.keycloak.audience,
        ...(config.keycloak.jwksUrl ? { jwksUrl: config.keycloak.jwksUrl } : {}),
      },
      jwksCacheTtlMs: config.keycloak.jwksCacheTtlMs,
    });
    container.adapters.keycloakAuth = keycloakAuth;
    lifecycle.onReady(() => keycloakAuth.warmUp());
  }

  if (config.redis.url) {
    const redisOperations = container.adapters.openTelemetry?.metrics.counter("athyper_redis_operations_total", "Redis operations by operation and outcome");
    const redisCache = dependencies.createRedisCache({
      url: config.redis.url,
      connectTimeoutMs: config.redis.connectTimeoutMs,
      maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
      ...(config.redis.keyPrefix ? { keyPrefix: config.redis.keyPrefix } : {}),
      ...(redisOperations ? { observer: { operation(name, outcome) { redisOperations.increment({ operation: name, outcome, capability: "redis" }); } } } : {}),
    });
    container.adapters.redisCache = redisCache;
    const notificationEvents=dependencies.createNotificationEvents(redisCache.client);
    container.adapters.notificationEvents=notificationEvents;
    lifecycle.onReady(() => redisCache.connect());
    lifecycle.onShutdown(() => redisCache.close());
    lifecycle.onShutdown(() => notificationEvents.close());
  }

  if (config.email.host && config.email.fromAddress) {
    const email = dependencies.createEmail({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure,
      fromAddress: config.email.fromAddress,
      ...(config.email.user ? { user: config.email.user } : {}),
      ...(config.email.password ? { password: config.email.password } : {}),
    });
    container.adapters.notificationChannels.set("email", email);
    lifecycle.onShutdown(() => email.close?.());
  }

  if (config.sms.accountSid && config.sms.authToken) {
    const sms = dependencies.createSms({
      accountSid: config.sms.accountSid,
      authToken: config.sms.authToken,
      ...(config.sms.fromNumber ? { fromNumber: config.sms.fromNumber } : {}),
      ...(config.sms.messagingServiceSid
        ? { messagingServiceSid: config.sms.messagingServiceSid }
        : {}),
    });
    container.adapters.notificationChannels.set("sms", sms);
  }

  if (
    config.metaWhatsApp.apiVersion &&
    config.metaWhatsApp.phoneNumberId &&
    config.metaWhatsApp.accessToken
  ) {
    const whatsApp = dependencies.createMetaWhatsApp({
      apiVersion: config.metaWhatsApp.apiVersion,
      phoneNumberId: config.metaWhatsApp.phoneNumberId,
      accessToken: config.metaWhatsApp.accessToken,
      ...(config.metaWhatsApp.graphBaseUrl
        ? { graphBaseUrl: config.metaWhatsApp.graphBaseUrl }
        : {}),
    });
    container.adapters.notificationChannels.set("whatsapp", whatsApp);
  }

  if (config.fcm.projectId && config.fcm.clientEmail && config.fcm.privateKey) {
    container.adapters.pushTransports.push(
      dependencies.createFcmPush({
        projectId: config.fcm.projectId,
        clientEmail: config.fcm.clientEmail,
        privateKey: config.fcm.privateKey,
      }),
    );
  }

  if (
    config.webPush.subject &&
    config.webPush.publicKey &&
    config.webPush.privateKey
  ) {
    container.adapters.pushTransports.push(
      dependencies.createWebPush({
        subject: config.webPush.subject,
        publicKey: config.webPush.publicKey,
        privateKey: config.webPush.privateKey,
      }),
    );
  }

  if (config.objectStorage.bucket) {
    const objectStorage = dependencies.createObjectStorage({
      region: config.objectStorage.region,
      bucket: config.objectStorage.bucket,
      multipartPartSizeMb: config.objectStorage.multipartPartSizeMb,
      multipartQueueSize: config.objectStorage.multipartQueueSize,
      maxUploadMb: config.objectStorage.maxUploadMb,
      presignedTtlSeconds: config.objectStorage.presignedTtlSeconds,
      ...(config.objectStorage.endpoint
        ? { endpoint: config.objectStorage.endpoint }
        : {}),
      ...(config.objectStorage.accessKeyId
        ? { accessKeyId: config.objectStorage.accessKeyId }
        : {}),
      ...(config.objectStorage.secretAccessKey
        ? { secretAccessKey: config.objectStorage.secretAccessKey }
        : {}),
    });
    container.adapters.objectStorage = objectStorage;
    container.adapters.objectStorageBucket = config.objectStorage.bucket;
    lifecycle.onReady(() => objectStorage.validateAccess());
    lifecycle.onShutdown(() => objectStorage.close());
  }

  if (config.malwareScanning.host) {
    const malwareScanner = dependencies.createMalwareScanner({
      host: config.malwareScanning.host,
      port: config.malwareScanning.port,
      timeoutMs: config.malwareScanning.timeoutMs,
      maxBytes: config.malwareScanning.maxBytes,
    });
    container.adapters.malwareScanner = malwareScanner;
    lifecycle.onReady(async () => {
      const health = await malwareScanner.health();
      if (health.status === "unhealthy") throw new Error(health.message ?? "Configured malware scanner is unhealthy");
    });
    lifecycle.onShutdown(() => malwareScanner.close());
  }

  if(config.contentExtraction.baseUrl){const contentExtractor=dependencies.createContentExtractor({baseUrl:config.contentExtraction.baseUrl,timeoutMs:config.contentExtraction.timeoutMs,maxInputBytes:config.contentExtraction.maxInputBytes,maxTextChars:config.contentExtraction.maxTextChars});container.adapters.contentExtractor=contentExtractor;lifecycle.onReady(async()=>{const health=await contentExtractor.health();if(health.status==="unhealthy")throw new Error(health.message??"Configured content extractor is unhealthy");});lifecycle.onShutdown(()=>contentExtractor.close());}

  if(config.search.baseUrl&&config.search.apiKey){const searchIndex=dependencies.createSearchIndex({baseUrl:config.search.baseUrl,apiKey:config.search.apiKey,indexUid:config.search.indexUid,timeoutMs:config.search.timeoutMs});container.adapters.searchIndex=searchIndex;lifecycle.onReady(async()=>{const health=await searchIndex.health();if(health.status==="unhealthy")throw new Error(health.message??"Configured search index is unhealthy");if(config.mode==="api")await searchIndex.initialize();});lifecycle.onShutdown(()=>searchIndex.close());}

  if (config.rendering.baseUrl) {
    const pdfRenderer = dependencies.createPdfRenderer({
      baseUrl: config.rendering.baseUrl,
      timeoutMs: config.rendering.timeoutMs,
      maxHtmlBytes: config.rendering.maxHtmlBytes,
      maxPdfBytes: config.rendering.maxPdfBytes,
    });
    container.adapters.pdfRenderer = pdfRenderer;
    const previewRenderer = dependencies.createPreviewRenderer({
      baseUrl: config.rendering.baseUrl,
      timeoutMs: config.rendering.timeoutMs,
      maxSourceBytes: config.rendering.maxHtmlBytes,
      maxOutputBytes: config.rendering.maxPdfBytes,
    });
    container.adapters.previewRenderer = previewRenderer;
    lifecycle.onReady(async () => {
      const health = await pdfRenderer.health();
      if (health.status === "unhealthy") {
        throw new Error(health.message ?? "Configured PDF renderer is unhealthy");
      }
      const previewHealth = await previewRenderer.health();
      if (previewHealth.status === "unhealthy") {
        throw new Error(previewHealth.message ?? "Configured preview renderer is unhealthy");
      }
    });
  }

  if (config.database.connectionString) {
    const neonDatabase = dependencies.createNeonDatabase({
      connectionString: config.database.connectionString,
      max: config.database.poolMax,
      actorProvider: () => {
        const context = tryGetRequestContext();
        if (!context?.tenantId || !context.principalId) return undefined;
        return {
          tenantId: context.tenantId,
          principalId: context.principalId,
        };
      },
      observer: poolObserver("neon", container),
    });
    container.adapters.neonDatabase = neonDatabase;
    lifecycle.onReady(async () => { await qualifyRuntimePlaneDatabase(neonDatabase.database as never, "neon"); });
    lifecycle.onShutdown(() => neonDatabase.close());
  }

  if (config.studioDatabase.connectionString) {
    const athyperDatabase = dependencies.createAthyperDatabase({
      connectionString: config.studioDatabase.connectionString,
      max: config.studioDatabase.poolMax,
      actorProvider: () => {
        const context = tryGetRequestContext();
        if (!context?.tenantId || !context.principalId) return undefined;
        return { tenantId: context.tenantId, principalId: context.principalId };
      },
      observer: poolObserver("studio", container),
    });
    container.adapters.athyperDatabase = athyperDatabase;
    lifecycle.onReady(async () => { await qualifyRuntimePlaneDatabase(athyperDatabase.database as never, "studio"); });
    lifecycle.onShutdown(() => athyperDatabase.close());
  }

  if (config.meshDatabase.connectionString) {
    const meshDatabase = dependencies.createMeshDatabase({
      connectionString: config.meshDatabase.connectionString,
      max: config.meshDatabase.poolMax,
      actorProvider: () => {
        const context = tryGetRequestContext();
        if (!context?.tenantId || !context.principalId) return undefined;
        return { tenantId: context.tenantId, principalId: context.principalId };
      },
      observer: poolObserver("mesh", container),
    });
    container.adapters.meshDatabase = meshDatabase;
    lifecycle.onReady(async () => { await qualifyRuntimePlaneDatabase(meshDatabase.database as never, "mesh"); });
    lifecycle.onShutdown(() => meshDatabase.close());
  }

  const publicationEnabled=config.publication?.compileEnabled||config.publication?.dispatchEnabled||config.publication?.applyEnabled;
  if(publicationEnabled){
    if(!container.adapters.objectStorage||!container.adapters.objectStorageBucket)throw new Error("Publication requires configured object storage");
    container.adapters.publicationArtifactStore=new ImmutablePublicationArtifactStore({storage:container.adapters.objectStorage,bucket:container.adapters.objectStorageBucket,canonicalizer:{sha256}});
    container.runtimes.health.register("publication.object-storage",async()=>{const result=await (container.adapters.publicationArtifactStore as ImmutablePublicationArtifactStore).health();return{status:result.healthy?"healthy":"unhealthy",...(result.message?{message:result.message}:{})};});
    if(!config.infisical.endpoint||!config.infisical.token||!config.infisical.workspaceId)throw new Error("Publication requires Infisical configuration");
    const secretStore=(dependencies.createSecretStore??createInfisicalSecretStore)({endpoint:config.infisical.endpoint,token:config.infisical.token,workspaceId:config.infisical.workspaceId,environment:config.infisical.environment,secretPath:config.infisical.secretPath});
    container.adapters.secretStore=secretStore;lifecycle.onShutdown(()=>secretStore.close?.());
    if(!config.publication.signingKeyId||!config.publication.publicKeyReference)throw new Error("Publication requires signing key ID and public key reference");
    const resolver=new CachedPublicationKeyResolver(secretStore,[{keyId:config.publication.signingKeyId,...(config.publication.privateKeyReference?{privateKeyReference:config.publication.privateKeyReference}:{}),publicKeyReferences:[config.publication.publicKeyReference]}]);
    container.adapters.publicationVerifier=new Ed25519PublicationVerifier(resolver);
    if(config.publication.compileEnabled||config.publication.dispatchEnabled){if(!config.publication.privateKeyReference)throw new Error("Publication authority requires private signing key reference");container.adapters.publicationSigner=new Ed25519PublicationSigner(resolver);}
    container.runtimes.health.register("publication.trust-keys",async()=>{const result=await resolver.health(config.publication.signingKeyId!,config.publication.compileEnabled||config.publication.dispatchEnabled);return{status:result.healthy?"healthy":"unhealthy",...(result.message?{message:result.message}:{})};});
  }

  if (config.mode === "worker" && config.jobs.workerDatabaseUrls.neon) {
    const database = dependencies.createNeonDatabase({
      connectionString: config.jobs.workerDatabaseUrls.neon,
      max: 2,
      observer: poolObserver("neon", container),
    });
    container.adapters.jobNeonDatabase = database;
    lifecycle.onReady(async () => { await qualifyRuntimePlaneDatabase(database.database as never, "neon"); });
    lifecycle.onShutdown(() => database.close());
  }
  if (config.mode === "worker" && config.jobs.workerDatabaseUrls.studio) {
    const database = dependencies.createAthyperDatabase({
      connectionString: config.jobs.workerDatabaseUrls.studio,
      max: 2,
      observer: poolObserver("studio", container),
    });
    container.adapters.jobAthyperDatabase = database;
    lifecycle.onReady(async () => { await qualifyRuntimePlaneDatabase(database.database as never, "studio"); });
    lifecycle.onShutdown(() => database.close());
  }
  if (config.mode === "worker" && config.jobs.workerDatabaseUrls.mesh) {
    const database = dependencies.createMeshDatabase({
      connectionString: config.jobs.workerDatabaseUrls.mesh,
      max: 2,
      observer: poolObserver("mesh", container),
    });
    container.adapters.jobMeshDatabase = database;
    lifecycle.onReady(async () => { await qualifyRuntimePlaneDatabase(database.database as never, "mesh"); });
    lifecycle.onShutdown(() => database.close());
  }

  // Register last so LIFO shutdown flushes telemetry before infrastructure closes.
  if (openTelemetry) {
    lifecycle.onShutdown(() => openTelemetry.shutdown());
  }
}

function poolObserver(plane: "studio" | "neon" | "mesh", container: Container) {
  const gauge = container.adapters.openTelemetry?.metrics?.gauge("athyper_db_pool_connections", "PostgreSQL pool connections by state");
  return {
    onPoolError(error: Error) {
      console.error(`[database] ${plane}_pool_error`, error.message);
    },
    onPoolStats(stats: { totalCount: number; idleCount: number; waitingCount: number; max: number }) {
      for (const [state, value] of [["total", stats.totalCount], ["idle", stats.idleCount], ["active", Math.max(0, stats.totalCount - stats.idleCount)], ["waiting", stats.waitingCount], ["max", stats.max]] as const) {
        gauge?.set(value, { plane, state, capability: "database" });
      }
    },
  };
}

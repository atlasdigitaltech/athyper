import { createLifecycle } from "@athyper/server-foundation/lifecycle";
import { describe, expect, it, vi } from "vitest";

import type { HostConfig } from "../../config/index.js";
import { createContainer } from "../create-container.js";
import { registerAdapters } from "../register-adapters.js";

describe("registerAdapters", () => {
  it("does not create an adapter without host database configuration", () => {
    const createNeonDatabase = vi.fn();

    registerAdapters(createContainer(), config(), createLifecycle(), {
      createNeonDatabase,
    });

    expect(createNeonDatabase).not.toHaveBeenCalled();
  });

  it("constructs Neon in the composition root and closes it through lifecycle", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const adapter = { close };
    const createNeonDatabase = vi.fn().mockReturnValue(adapter);
    const container = createContainer();
    const lifecycle = createLifecycle();

    registerAdapters(
      container,
      config("postgresql://localhost/athyper_neon"),
      lifecycle,
      { createNeonDatabase: createNeonDatabase as never },
    );

    expect(container.adapters.neonDatabase).toBe(adapter);
    expect(createNeonDatabase).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString: "postgresql://localhost/athyper_neon",
        max: 10,
        actorProvider: expect.any(Function),
      }),
    );

    await lifecycle.shutdown("test");
    expect(close).toHaveBeenCalledOnce();
  });

  it("constructs and shuts down all configured database planes independently", async () => {
    const shutdownOrder: string[] = [];
    const neonDatabase = adapter("neon", shutdownOrder);
    const athyperDatabase = adapter("athyper", shutdownOrder);
    const meshDatabase = adapter("mesh", shutdownOrder);
    const hostConfig = config("postgresql://localhost/athyper_neon");
    hostConfig.studioDatabase = {
      connectionString: "postgresql://localhost/athyper_studio",
      poolMax: 5,
    };
    hostConfig.meshDatabase = {
      connectionString: "postgresql://localhost/athyper_mesh",
      poolMax: 10,
    };
    const container = createContainer();
    const lifecycle = createLifecycle();

    registerAdapters(container, hostConfig, lifecycle, {
      createNeonDatabase: vi.fn().mockReturnValue(neonDatabase) as never,
      createAthyperDatabase: vi.fn().mockReturnValue(athyperDatabase) as never,
      createMeshDatabase: vi.fn().mockReturnValue(meshDatabase) as never,
    });

    expect(container.adapters).toMatchObject({
      neonDatabase,
      athyperDatabase,
      meshDatabase,
    });

    await lifecycle.shutdown("test");
    expect(shutdownOrder).toEqual(["mesh", "athyper", "neon"]);
  });

  it("constructs Keycloak in the composition root and warms JWKS on readiness", async () => {
    const warmUp = vi.fn().mockResolvedValue(undefined);
    const keycloakAuth = { warmUp };
    const createKeycloakAuth = vi.fn().mockReturnValue(keycloakAuth);
    const hostConfig = config();
    hostConfig.keycloak = {
      issuerUrl: "https://iam.athyper.test/realms/athyper",
      audience: "athyper-api",
      jwksCacheTtlMs: 120_000,
    };
    const container = createContainer();
    const lifecycle = createLifecycle();

    registerAdapters(container, hostConfig, lifecycle, {
      createKeycloakAuth: createKeycloakAuth as never,
    });

    expect(container.adapters.keycloakAuth).toBe(keycloakAuth);
    expect(createKeycloakAuth).toHaveBeenCalledWith({
      defaultRealm: {
        issuerUrl: "https://iam.athyper.test/realms/athyper",
        audience: "athyper-api",
      },
      jwksCacheTtlMs: 120_000,
    });
    expect(warmUp).not.toHaveBeenCalled();

    await lifecycle.signalReady();
    expect(warmUp).toHaveBeenCalledOnce();
  });

  it("constructs Redis in the composition root and owns connect/close lifecycle", async () => {
    const connect = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const redisCache = { connect, close };
    const createRedisCache = vi.fn().mockReturnValue(redisCache);
    const closeNotificationEvents = vi.fn().mockResolvedValue(undefined);
    const notificationEvents = {
      publish: vi.fn(),
      subscribe: vi.fn(),
      close: closeNotificationEvents,
    };
    const createNotificationEvents = vi.fn().mockReturnValue(notificationEvents);
    const hostConfig = config();
    hostConfig.redis = {
      url: "redis://localhost:6379/0",
      keyPrefix: "platform:",
      connectTimeoutMs: 5_000,
      maxRetriesPerRequest: 3,
    };
    const container = createContainer();
    const lifecycle = createLifecycle();

    registerAdapters(container, hostConfig, lifecycle, {
      createRedisCache: createRedisCache as never,
      createNotificationEvents: createNotificationEvents as never,
    });

    expect(container.adapters.redisCache).toBe(redisCache);
    expect(container.adapters.notificationEvents).toBe(notificationEvents);
    expect(createRedisCache).toHaveBeenCalledWith({
      url: "redis://localhost:6379/0",
      keyPrefix: "platform:",
      connectTimeoutMs: 5_000,
      maxRetriesPerRequest: 3,
    });
    await lifecycle.signalReady();
    expect(connect).toHaveBeenCalledOnce();
    await lifecycle.shutdown("test");
    expect(closeNotificationEvents).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it("registers configured notification transports and owns their lifecycle", async () => {
    const close = vi.fn();
    const email = { channel: "email", close };
    const sms = { channel: "sms" };
    const createEmail = vi.fn().mockReturnValue(email);
    const createSms = vi.fn().mockReturnValue(sms);
    const hostConfig = config();
    hostConfig.email = {
      provider: "smtp",
      host: "smtp.example.test",
      port: 465,
      secure: true,
      user: "mailer",
      password: "secret",
      fromAddress: "no-reply@example.test",
      sesRegion: undefined,
      sesConfigurationSetName: undefined,
      sesFromAddress: undefined,
      sesReplyToAddress: undefined,
    };
    hostConfig.sms = {
      accountSid: "AC123",
      authToken: "token",
      fromNumber: undefined,
      messagingServiceSid: "MG123",
    };
    const container = createContainer();
    const lifecycle = createLifecycle();

    registerAdapters(container, hostConfig, lifecycle, {
      createEmail: createEmail as never,
      createSms: createSms as never,
    });

    expect(container.adapters.notificationChannels.get("email")).toBe(email);
    expect(container.adapters.notificationChannels.get("sms")).toBe(sms);
    expect(createEmail).toHaveBeenCalledWith({
      host: "smtp.example.test",
      port: 465,
      secure: true,
      user: "mailer",
      password: "secret",
      fromAddress: "no-reply@example.test",
    });
    expect(createSms).toHaveBeenCalledWith({
      accountSid: "AC123",
      authToken: "token",
      messagingServiceSid: "MG123",
    });
    await lifecycle.shutdown("test");
    expect(close).toHaveBeenCalledOnce();
  });

  it("registers SES v2 as the selected email provider with deterministic tenant mapping", async () => {
    const close = vi.fn();
    const email = { channel: "email", close };
    const createSesEmail = vi.fn().mockReturnValue(email);
    const hostConfig = config();
    hostConfig.env = "staging";
    hostConfig.email = {
      provider: "ses",
      host: undefined,
      port: 587,
      secure: false,
      user: undefined,
      password: undefined,
      fromAddress: undefined,
      sesRegion: "ap-southeast-1",
      sesConfigurationSetName: "athyper-stg-transactional",
      sesFromAddress: "notifications@notify.stg.athyper.com",
      sesReplyToAddress: "support@athyper.com",
    };
    const container = createContainer();
    const lifecycle = createLifecycle();

    registerAdapters(container, hostConfig, lifecycle, {
      createSesEmail: createSesEmail as never,
    });

    expect(container.adapters.notificationChannels.get("email")).toBe(email);
    const sesConfig = createSesEmail.mock.calls[0]?.[0];
    expect(sesConfig).toMatchObject({
      region: "ap-southeast-1",
      configurationSetName: "athyper-stg-transactional",
      fromAddress: "notifications@notify.stg.athyper.com",
      replyToAddress: "support@athyper.com",
      environment: "staging",
    });
    expect(sesConfig.resolveTenantName("11111111-1111-4111-8111-111111111111"))
      .toMatch(/^t-[a-f0-9]{40}$/);
    await lifecycle.shutdown("test");
    expect(close).toHaveBeenCalledOnce();
  });

  it("composes the worker SES event source with lifecycle and deferred platform handler", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn();
    const health = vi.fn().mockResolvedValue({ status: "healthy", latencyMs: 1 });
    const source = { run, close, health, pollOnce: vi.fn() };
    const createSesEventSource = vi.fn().mockReturnValue(source);
    const hostConfig = config();
    hostConfig.mode = "worker";
    hostConfig.email.provider = "ses";
    hostConfig.jobs = {
      scheduleReconcileMs: 60_000,
      cronwatchBaseUrl: undefined,
      cronwatchPingKey: undefined,
      workerDatabaseUrls: { studio: undefined, neon: undefined, mesh: undefined },
      invalidationListenerDatabaseUrls: { studio: undefined, neon: undefined, mesh: undefined },
    };
    hostConfig.sesEvents = {
      region: "ap-southeast-1",
      queueUrl: "https://sqs.ap-southeast-1.amazonaws.com/123456789012/athyper-stg-ses-events",
      waitTimeSeconds: 20,
      visibilityTimeoutSeconds: 60,
      maxMessages: 10,
      failureBackoffMs: 1_000,
    };
    const container = createContainer();
    const lifecycle = createLifecycle();

    registerAdapters(container, hostConfig, lifecycle, { createSesEventSource: createSesEventSource as never });
    expect(container.adapters.sesEventSource).toBe(source);
    expect(container.runtimes.health.list()).toContain("notifications.ses-event-source");
    const forwarded = vi.fn().mockResolvedValue({ outcome: "acknowledge" });
    container.adapters.sesEventHandler = { process: forwarded };
    const handler = createSesEventSource.mock.calls[0]?.[1];
    await handler.process("{}");
    expect(forwarded).toHaveBeenCalledWith("{}");
    await lifecycle.signalReady();
    expect(run).toHaveBeenCalledOnce();
    await lifecycle.shutdown("test");
    expect(close).toHaveBeenCalledOnce();
  });

  it("registers Meta WhatsApp and separate push transports in the composition root", () => {
    const whatsApp = { channel: "whatsapp" };
    const fcm = { platforms: ["android", "ios"] };
    const webPush = { platforms: ["web"] };
    const hostConfig = config();
    hostConfig.metaWhatsApp = {
      apiVersion: "v23.0",
      phoneNumberId: "phone-1",
      accessToken: "secret",
      graphBaseUrl: undefined,
    };
    hostConfig.fcm = {
      projectId: "project",
      clientEmail: "service@example.test",
      privateKey: "private-key",
    };
    hostConfig.webPush = {
      subject: "mailto:no-reply@example.test",
      publicKey: "public",
      privateKey: "private",
    };
    const container = createContainer();

    registerAdapters(container, hostConfig, createLifecycle(), {
      createMetaWhatsApp: vi.fn().mockReturnValue(whatsApp) as never,
      createFcmPush: vi.fn().mockReturnValue(fcm) as never,
      createWebPush: vi.fn().mockReturnValue(webPush) as never,
    });

    expect(container.adapters.notificationChannels.get("whatsapp")).toBe(whatsApp);
    expect(container.adapters.pushTransports).toEqual([fcm, webPush]);
  });

  it("constructs S3 storage in the composition root and owns readiness validation", async () => {
    const validateAccess = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn();
    const objectStorage = { validateAccess, close };
    const createObjectStorage = vi.fn().mockReturnValue(objectStorage);
    const hostConfig = config();
    hostConfig.objectStorage = {
      endpoint: "http://localhost:9000",
      region: "us-east-1",
      bucket: "documents",
      accessKeyId: "app",
      secretAccessKey: "secret",
      multipartPartSizeMb: 5,
      multipartQueueSize: 4,
      maxUploadMb: 100,
      presignedTtlSeconds: 900,
    };
    const container = createContainer();
    const lifecycle = createLifecycle();

    registerAdapters(container, hostConfig, lifecycle, {
      createObjectStorage: createObjectStorage as never,
    });

    expect(container.adapters.objectStorage).toBe(objectStorage);
    expect(createObjectStorage).toHaveBeenCalledWith({
      endpoint: "http://localhost:9000",
      region: "us-east-1",
      bucket: "documents",
      accessKeyId: "app",
      secretAccessKey: "secret",
      multipartPartSizeMb: 5,
      multipartQueueSize: 4,
      maxUploadMb: 100,
      presignedTtlSeconds: 900,
    });
    await lifecycle.signalReady();
    expect(validateAccess).toHaveBeenCalledOnce();
    await lifecycle.shutdown("test");
    expect(close).toHaveBeenCalledOnce();
  });

  it("constructs ClamAV centrally and requires a healthy scanner at readiness", async () => {
    const health = vi.fn().mockResolvedValue({ status: "healthy" });
    const close = vi.fn();
    const malwareScanner = { scan: vi.fn(), health, close };
    const createMalwareScanner = vi.fn().mockReturnValue(malwareScanner);
    const hostConfig = config();
    hostConfig.malwareScanning = { host:"virusscan", port:3310, timeoutMs:30_000, maxBytes:104_857_600, onUnavailable:"fail-closed" };
    const container = createContainer();
    const lifecycle = createLifecycle();

    registerAdapters(container, hostConfig, lifecycle, { createMalwareScanner: createMalwareScanner as never });

    expect(container.adapters.malwareScanner).toBe(malwareScanner);
    expect(createMalwareScanner).toHaveBeenCalledWith({ host:"virusscan", port:3310, timeoutMs:30_000, maxBytes:104_857_600 });
    await lifecycle.signalReady();
    expect(health).toHaveBeenCalledOnce();
    await lifecycle.shutdown("test");
    expect(close).toHaveBeenCalledOnce();
  });

  it("owns Tika and Meilisearch readiness and shutdown",async()=>{const tikaHealth=vi.fn().mockResolvedValue({status:"healthy"});const tikaClose=vi.fn();const searchHealth=vi.fn().mockResolvedValue({status:"healthy"});const initialize=vi.fn().mockResolvedValue(undefined);const searchClose=vi.fn();const createContentExtractor=vi.fn().mockReturnValue({extract:vi.fn(),health:tikaHealth,close:tikaClose});const createSearchIndex=vi.fn().mockReturnValue({upsert:vi.fn(),remove:vi.fn(),search:vi.fn(),health:searchHealth,initialize,close:searchClose});const hostConfig=config();hostConfig.mode="api";hostConfig.contentExtraction={baseUrl:"http://docparser:9998",timeoutMs:120_000,maxInputBytes:52_428_800,maxTextChars:5_000_000};hostConfig.search={baseUrl:"http://searchcore:7700",apiKey:"secret",indexUid:"documents",timeoutMs:10_000};const container=createContainer();const lifecycle=createLifecycle();registerAdapters(container,hostConfig,lifecycle,{createContentExtractor:createContentExtractor as never,createSearchIndex:createSearchIndex as never});expect(container.adapters.contentExtractor).toBeDefined();expect(container.adapters.searchIndex).toBeDefined();await lifecycle.signalReady();expect(tikaHealth).toHaveBeenCalledOnce();expect(searchHealth).toHaveBeenCalledOnce();expect(initialize).toHaveBeenCalledOnce();await lifecycle.shutdown("test");expect(tikaClose).toHaveBeenCalledOnce();expect(searchClose).toHaveBeenCalledOnce();});

  it("constructs Gotenberg centrally and verifies readiness", async () => {
    const health = vi.fn().mockResolvedValue({ status: "healthy" });
    const pdfRenderer = { renderPdf: vi.fn(), health };
    const createPdfRenderer = vi.fn().mockReturnValue(pdfRenderer);
    const hostConfig = config();
    hostConfig.rendering = {
      baseUrl: "http://docrender:3000",
      timeoutMs: 120_000,
      maxHtmlBytes: 5_242_880,
      maxPdfBytes: 52_428_800,
    };
    const container = createContainer();
    const lifecycle = createLifecycle();

    registerAdapters(container, hostConfig, lifecycle, {
      createPdfRenderer: createPdfRenderer as never,
    });
    expect(container.adapters.pdfRenderer).toBe(pdfRenderer);
    expect(createPdfRenderer).toHaveBeenCalledWith(hostConfig.rendering);
    await lifecycle.signalReady();
    expect(health).toHaveBeenCalledOnce();
  });

  it("constructs OpenTelemetry centrally and flushes it first on shutdown", async () => {
    const order: string[] = [];
    const start = vi.fn().mockResolvedValue(undefined);
    const shutdown = vi.fn(async () => {
      order.push("telemetry");
    });
    const openTelemetry = { start, shutdown, tracer: {}, started: false };
    const createOpenTelemetry = vi.fn().mockReturnValue(openTelemetry);
    const hostConfig = config("postgresql://localhost/athyper_neon");
    hostConfig.openTelemetry = {
      endpoint: "http://localhost:4317",
      serviceName: "platform-host",
      serviceVersion: "1.0.0",
      enableAutoInstrumentations: false,
    };
    const database = adapter("database", order);
    const container = createContainer();
    const lifecycle = createLifecycle();

    registerAdapters(container, hostConfig, lifecycle, {
      createOpenTelemetry: createOpenTelemetry as never,
      createNeonDatabase: vi.fn().mockReturnValue(database) as never,
    });

    expect(container.adapters.openTelemetry).toBe(openTelemetry);
    expect(createOpenTelemetry).toHaveBeenCalledWith({
      endpoint: "http://localhost:4317",
      serviceName: "platform-host",
      serviceVersion: "1.0.0",
      environment: "local",
      processMode: "api",
      enableAutoInstrumentations: false,
    });
    await lifecycle.signalReady();
    expect(start).toHaveBeenCalledOnce();
    await lifecycle.shutdown("test");
    expect(order).toEqual(["telemetry", "database"]);
  });
});

function adapter(name: string, shutdownOrder: string[]) {
  return {
    close: vi.fn(async () => {
      shutdownOrder.push(name);
    }),
  };
}

function config(connectionString?: string): HostConfig {
  return {
    port: 4000,
    logLevel: "info",
    shutdownTimeoutMs: 15_000,
    env: "local",
    mode: "api",
    database: { connectionString, poolMax: 10 },
    studioDatabase: { connectionString: undefined, poolMax: 5 },
    meshDatabase: { connectionString: undefined, poolMax: 10 },
    keycloak: {
      issuerUrl: undefined,
      audience: undefined,
      jwksCacheTtlMs: 600_000,
    },
    redis: {
      url: undefined,
      keyPrefix: undefined,
      connectTimeoutMs: 10_000,
      maxRetriesPerRequest: 2,
    },
    objectStorage: {
      endpoint: undefined,
      region: "us-east-1",
      bucket: undefined,
      accessKeyId: undefined,
      secretAccessKey: undefined,
      multipartPartSizeMb: 5,
      multipartQueueSize: 4,
      maxUploadMb: 100,
      presignedTtlSeconds: 900,
    },
    malwareScanning: {
      host: undefined,
      port: 3310,
      timeoutMs: 30_000,
      maxBytes: 104_857_600,
      onUnavailable: "fail-closed",
    },
    contentExtraction:{baseUrl:undefined,timeoutMs:120_000,maxInputBytes:52_428_800,maxTextChars:5_000_000},
    search:{baseUrl:undefined,apiKey:undefined,indexUid:"documents",timeoutMs:10_000},
    openTelemetry: {
      endpoint: undefined,
      serviceName: "athyper-platform-host",
      serviceVersion: "0.0.0",
      enableAutoInstrumentations: false,
    },
    email: {
      provider: "disabled",
      host: undefined,
      port: 587,
      secure: false,
      user: undefined,
      password: undefined,
      fromAddress: undefined,
      sesRegion: undefined,
      sesConfigurationSetName: undefined,
      sesFromAddress: undefined,
      sesReplyToAddress: undefined,
    },
    sesEvents: {
      region: undefined,
      queueUrl: undefined,
      waitTimeSeconds: 20,
      visibilityTimeoutSeconds: 60,
      maxMessages: 10,
      failureBackoffMs: 1_000,
    },
    sms: {
      accountSid: undefined,
      authToken: undefined,
      fromNumber: undefined,
      messagingServiceSid: undefined,
    },
    metaWhatsApp: {
      apiVersion: undefined,
      phoneNumberId: undefined,
      accessToken: undefined,
      graphBaseUrl: undefined,
    },
    fcm: {
      projectId: undefined,
      clientEmail: undefined,
      privateKey: undefined,
    },
    webPush: {
      subject: undefined,
      publicKey: undefined,
      privateKey: undefined,
    },
    rendering: {
      baseUrl: undefined,
      timeoutMs: 120_000,
      maxHtmlBytes: 5_242_880,
      maxPdfBytes: 52_428_800,
    },
  };
}

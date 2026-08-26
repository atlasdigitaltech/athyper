import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../config/index.js";

describe("loadConfig", () => {
  const snapshot: Record<string, string | undefined> = {};
  const keys = ["PORT", "ATHYPER_ENV", "ENVIRONMENT", "NODE_ENV", "LOG_LEVEL", "SHUTDOWN_TIMEOUT_MS", "MODE", "DATABASE_URL", "DATABASE_POOL_MAX", "ATHYPER_PLATFORM_DATABASE_URL", "ATHYPER_PLATFORM_DATABASE_POOL_MAX", "MESH_DATABASE_URL", "MESH_DATABASE_POOL_MAX", "KEYCLOAK_ISSUER_URL", "KEYCLOAK_BASE_URL", "KEYCLOAK_REALM", "KEYCLOAK_CLIENT_ID", "KEYCLOAK_JWKS_CACHE_TTL_MS", "IAM_ISSUER_URL", "IAM_CLIENT_ID", "REDIS_URL", "REDIS_KEY_PREFIX", "REDIS_CONNECT_TIMEOUT_MS", "REDIS_MAX_RETRIES_PER_REQUEST", "S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY", "APP_S3_ACCESS_KEY", "APP_S3_SECRET_KEY", "S3_MULTIPART_PART_SIZE_MB", "S3_MULTIPART_QUEUE_SIZE", "S3_MAX_UPLOAD_MB", "S3_PRESIGNED_TTL_SECONDS", "CLAMD_HOST", "CLAMD_PORT", "CLAMD_TIMEOUT_MS", "CLAMD_MAX_BYTES", "CLAMD_ON_UNAVAILABLE", "OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_SERVICE_NAME", "SERVICE_NAME", "SERVICE_VERSION", "OTEL_AUTO_INSTRUMENTATIONS_ENABLED", "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER", "TWILIO_MESSAGING_SERVICE_SID", "META_WHATSAPP_API_VERSION", "META_WHATSAPP_PHONE_NUMBER_ID", "META_WHATSAPP_ACCESS_TOKEN", "META_WHATSAPP_GRAPH_BASE_URL", "PUSH_FCM_PROJECT_ID", "PUSH_FCM_CLIENT_EMAIL", "PUSH_FCM_PRIVATE_KEY", "VAPID_SUBJECT", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "DOCRENDER_BASE_URL", "DOCRENDER_TIMEOUT_MS", "DOCRENDER_MAX_HTML_BYTES", "DOCRENDER_MAX_PDF_BYTES"];

  keys.push(
    "EMAIL_PROVIDER",
    "SES_REGION",
    "SES_CONFIGURATION_SET",
    "SES_FROM",
    "SES_REPLY_TO",
    "SES_EVENT_REGION",
    "SES_EVENT_QUEUE_URL",
    "SES_EVENT_WAIT_SECONDS",
    "SES_EVENT_VISIBILITY_TIMEOUT_SECONDS",
    "SES_EVENT_MAX_MESSAGES",
    "SES_EVENT_FAILURE_BACKOFF_MS",
    "REDIS_BULLMQ_URL",
    "ALLOW_SHARED_BULLMQ_REDIS",
    "JOB_WORKER_CONCURRENCY",
    "AUTH_CLAIM_FIRST_CONTEXT",
    "AUTH_REQUIRE_AUTHORIZED_ROLE",
    "AUTH_VERIFY_ENFORCE_REQUIRED_ACTIONS",
    "AUTH_REQUIRED_ACTIONS_MATRIX",
  );
  keys.push("STUDIO_DATABASE_URL", "STUDIO_DATABASE_POOL_MAX", "STUDIO_WORKER_DATABASE_URL");
  keys.push("DOCPARSER_URL","DOCPARSER_TIMEOUT_MS","DOCPARSER_MAX_INPUT_BYTES","DOCPARSER_MAX_TEXT_CHARS","SEARCHCORE_URL","SEARCHCORE_MASTER_KEY","SEARCHCORE_DOCUMENT_INDEX","SEARCHCORE_TIMEOUT_MS");
  keys.push("JOB_SCHEDULE_RECONCILE_MS","CRONWATCH_BASE_URL","CRONWATCH_PING_KEY","NEON_WORKER_DATABASE_URL","ATHYPER_PLATFORM_WORKER_DATABASE_URL","MESH_WORKER_DATABASE_URL","DATABASE_ADMIN_URL");
  keys.push("PUBLICATION_API_ENABLED","PUBLICATION_COMPILE_ENABLED","PUBLICATION_DISPATCH_ENABLED","PUBLICATION_APPLY_ENABLED","PUBLICATION_RECOVERY_ENABLED","PUBLICATION_TARGET_PLANES","PUBLICATION_REQUIRE_SIGNATURE","PUBLICATION_SIGNING_KEY_ID","PUBLICATION_PRIVATE_KEY_REFERENCE","PUBLICATION_PUBLIC_KEY_REFERENCE","PUBLICATION_RUNTIME_VERSION","PUBLICATION_RECOVERY_INTERVAL_MS","INFISICAL_URL","INFISICAL_TOKEN","INFISICAL_WORKSPACE_ID","INFISICAL_ENVIRONMENT","INFISICAL_SECRET_PATH");
  keys.push("FINANCE_F2_ENABLED","FINANCE_F3_ENABLED","FINANCE_F4_ENABLED","FINANCE_F5_ENABLED","FINANCE_F6_ENABLED");
  keys.push("WAVE0_CONTROL_ADMIN_TENANT_OVERRIDES_ENABLED","WAVE0_CONTROL_ADMIN_LOOKUP_ROUNDING_ENABLED","WAVE0_CONTROL_ADMIN_CONNECTOR_LIFECYCLE_ENABLED","WAVE0_CONTROL_ADMIN_CYCLE_CONFIG_ENABLED","WAVE0_CONTROL_ADMIN_LOCAL_CATALOG_READS_ENABLED","WAVE0_CONTROL_ADMIN_CATALOG_AUTHORING_ENABLED","WAVE0_CONTROL_ADMIN_RUNTIME_COMMANDS_ENABLED");

  beforeEach(() => {
    for (const k of keys) snapshot[k] = process.env[k];
    for (const k of keys) delete process.env[k];
  });

  afterEach(() => {
    for (const k of keys) {
      if (snapshot[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = snapshot[k];
      }
    }
  });

  it("defaults to port 4000, env=local, mode=api", () => {
    const config = loadConfig();
    expect(config.port).toBe(4000);
    expect(config.env).toBe("local");
    expect(config.mode).toBe("api");
    expect(config.database).toEqual({ connectionString: undefined, poolMax: 10 });
    expect(config.studioDatabase).toEqual({ connectionString: undefined, poolMax: 5 });
    expect(config.meshDatabase).toEqual({ connectionString: undefined, poolMax: 10 });
    expect(config.keycloak).toEqual({
      issuerUrl: undefined,
      audience: undefined,
      jwksCacheTtlMs: 600_000,
    });
    expect(config.iam).toEqual({
      defaultRealmKey: "default",
      claimContextMode: "shadow",
      requireAuthorizedRole: true,
      enforceRequiredActions: true,
      requiredActionsMatrixJson: undefined,
    });
    expect(config.redis).toEqual({
      url: undefined,
      keyPrefix: undefined,
      connectTimeoutMs: 10_000,
      maxRetriesPerRequest: 2,
    });
    expect(config.bullMq).toEqual({
      url: undefined,
      concurrency: 10,
      usesSharedRedis: false,
    });
    expect(config.objectStorage).toEqual({
      endpoint: undefined,
      region: "us-east-1",
      bucket: undefined,
      accessKeyId: undefined,
      secretAccessKey: undefined,
      multipartPartSizeMb: 5,
      multipartQueueSize: 4,
      maxUploadMb: 100,
      presignedTtlSeconds: 900,
      tenantQuotaGb: 10,
      tenantQuotaItems: 50_000,
      quotaReservationTtlSeconds: 1_800,
      quotaRetryAfterSeconds: 900,
    });
    expect(config.contentExtraction).toEqual({baseUrl:undefined,timeoutMs:120_000,maxInputBytes:52_428_800,maxTextChars:5_000_000});
    expect(config.search).toEqual({baseUrl:undefined,apiKey:undefined,indexUid:"documents",timeoutMs:10_000});
    expect(config.malwareScanning).toEqual({ host: undefined, port: 3310, timeoutMs: 30_000, maxBytes: 104_857_600, onUnavailable: "fail-closed" });
    expect(config.openTelemetry).toEqual({
      endpoint: undefined,
      serviceName: "athyper-platform-host",
      serviceVersion: "0.0.0",
      enableAutoInstrumentations: false,
    });
    expect(config.email).toEqual({
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
    });
    expect(config.sesEvents).toEqual({
      region: undefined,
      queueUrl: undefined,
      waitTimeSeconds: 20,
      visibilityTimeoutSeconds: 60,
      maxMessages: 10,
      failureBackoffMs: 1_000,
    });
    expect(config.sms).toEqual({
      accountSid: undefined,
      authToken: undefined,
      fromNumber: undefined,
      messagingServiceSid: undefined,
    });
  });

  it("reads PORT from env", () => {
    process.env["PORT"] = "5000";
    const config = loadConfig();
    expect(config.port).toBe(5000);
  });

  it("defaults every qualified finance slice to disabled",()=>{expect(loadConfig().wave0).toMatchObject({financeF2Enabled:false,financeF3Enabled:false,financeF4Enabled:false,financeF5Enabled:false,financeF6Enabled:false});});

  it("maps ENVIRONMENT=staging to env=staging", () => {
    process.env["ENVIRONMENT"] = "staging";
    const config = loadConfig();
    expect(config.env).toBe("staging");
  });

  it("falls back to production when NODE_ENV=production and ATHYPER_ENV unset", () => {
    process.env["NODE_ENV"] = "production";
    const config = loadConfig();
    expect(config.env).toBe("production");
  });

  it("throws on invalid PORT", () => {
    process.env["PORT"] = "not-a-number";
    expect(() => loadConfig()).toThrow("PORT");
  });

  it("reads and validates Neon database settings", () => {
    process.env["DATABASE_URL"] = "postgresql://localhost/athyper_neon";
    process.env["DATABASE_POOL_MAX"] = "18";

    expect(loadConfig().database).toEqual({
      connectionString: "postgresql://localhost/athyper_neon",
      poolMax: 18,
    });
  });

  it("throws on an invalid database pool size", () => {
    process.env["DATABASE_POOL_MAX"] = "0";
    expect(() => loadConfig()).toThrow("DATABASE_POOL_MAX");
  });

  it("reads Studio and Mesh database settings independently", () => {
    process.env["STUDIO_DATABASE_URL"] =
      "postgresql://localhost/athyper_studio";
    process.env["STUDIO_DATABASE_POOL_MAX"] = "6";
    process.env["MESH_DATABASE_URL"] = "postgresql://localhost/athyper_mesh";
    process.env["MESH_DATABASE_POOL_MAX"] = "14";

    const config = loadConfig();
    expect(config.studioDatabase).toEqual({
      connectionString: "postgresql://localhost/athyper_studio",
      poolMax: 6,
    });
    expect(config.meshDatabase).toEqual({
      connectionString: "postgresql://localhost/athyper_mesh",
      poolMax: 14,
    });
  });

  it("accepts legacy Studio database configuration only as an ingress compatibility alias", () => {
    process.env["ATHYPER_PLATFORM_DATABASE_URL"] = "postgresql://localhost/athyper_studio";
    expect(loadConfig().studioDatabase.connectionString).toBe("postgresql://localhost/athyper_studio");
  });

  it("builds a Keycloak issuer from base URL and realm", () => {
    process.env["KEYCLOAK_BASE_URL"] = "https://iam.athyper.test/";
    process.env["KEYCLOAK_REALM"] = "athyper";
    process.env["KEYCLOAK_CLIENT_ID"] = "athyper-api";
    process.env["KEYCLOAK_JWKS_CACHE_TTL_MS"] = "120000";

    expect(loadConfig().keycloak).toEqual({
      issuerUrl: "https://iam.athyper.test/realms/athyper",
      audience: "athyper-api",
      jwksCacheTtlMs: 120_000,
    });
  });

  it("rejects partial Keycloak configuration", () => {
    process.env["KEYCLOAK_ISSUER_URL"] =
      "https://iam.athyper.test/realms/athyper";
    expect(() => loadConfig()).toThrow("client ID");
  });

  it("loads IAM-owned authentication flags", () => {
    process.env["KEYCLOAK_BASE_URL"] = "https://iam.athyper.test";
    process.env["KEYCLOAK_REALM"] = "athyper";
    process.env["KEYCLOAK_CLIENT_ID"] = "athyper-api";
    process.env["AUTH_CLAIM_FIRST_CONTEXT"] = "on";
    process.env["AUTH_REQUIRE_AUTHORIZED_ROLE"] = "false";
    process.env["AUTH_VERIFY_ENFORCE_REQUIRED_ACTIONS"] = "false";
    process.env["AUTH_REQUIRED_ACTIONS_MATRIX"] = "{\"UPDATE_PASSWORD\":[\"/api/\"]}";
    expect(loadConfig().iam).toEqual({
      defaultRealmKey: "athyper",
      claimContextMode: "on",
      requireAuthorizedRole: false,
      enforceRequiredActions: false,
      requiredActionsMatrixJson: "{\"UPDATE_PASSWORD\":[\"/api/\"]}",
    });
  });

  it("supports the local IAM issuer compatibility chain", () => {
    process.env["IAM_ISSUER_URL"] =
      "https://iam.athyper.local/realms/athyper";
    process.env["IAM_CLIENT_ID"] = "athyper-api";

    expect(loadConfig().keycloak).toMatchObject({
      issuerUrl: "https://iam.athyper.local/realms/athyper",
      audience: "athyper-api",
    });
  });

  it("reads Redis cache configuration", () => {
    process.env["REDIS_URL"] = "rediss://cache.athyper.test:6380/1";
    process.env["REDIS_KEY_PREFIX"] = "platform:";
    process.env["REDIS_CONNECT_TIMEOUT_MS"] = "5000";
    process.env["REDIS_MAX_RETRIES_PER_REQUEST"] = "4";

    expect(loadConfig().redis).toEqual({
      url: "rediss://cache.athyper.test:6380/1",
      keyPrefix: "platform:",
      connectTimeoutMs: 5_000,
      maxRetriesPerRequest: 4,
    });
    expect(loadConfig().bullMq).toEqual({
      url: "rediss://cache.athyper.test:6380/1",
      concurrency: 10,
      usesSharedRedis: true,
    });
  });

  it("keeps BullMQ on a dedicated Redis endpoint outside local development", () => {
    process.env["ATHYPER_ENV"] = "production";
    process.env["REDIS_URL"] = "redis://cache:6379/0";
    process.env["REDIS_BULLMQ_URL"] = "redis://queues:6379/1";
    process.env["JOB_WORKER_CONCURRENCY"] = "24";
    expect(loadConfig().bullMq).toEqual({
      url: "redis://queues:6379/1",
      concurrency: 24,
      usesSharedRedis: false,
    });
  });

  it("requires dedicated system database credentials for production workers", () => {
    process.env["ATHYPER_ENV"] = "production";
    process.env["MODE"] = "worker";
    process.env["DATABASE_URL"] = "postgresql://app@db/neon";
    expect(() => loadConfig()).toThrow("NEON_WORKER_DATABASE_URL");
    process.env["NEON_WORKER_DATABASE_URL"] = "postgresql://worker@db/neon";
    expect(loadConfig().jobs.workerDatabaseUrls.neon).toBe("postgresql://worker@db/neon");
  });

  it("reads S3-compatible storage configuration", () => {
    process.env["S3_ENDPOINT"] = "http://localhost:9000";
    process.env["S3_REGION"] = "ap-southeast-1";
    process.env["S3_BUCKET"] = "documents";
    process.env["S3_ACCESS_KEY"] = "app";
    process.env["S3_SECRET_KEY"] = "secret";
    process.env["S3_MAX_UPLOAD_MB"] = "250";

    expect(loadConfig().objectStorage).toMatchObject({
      endpoint: "http://localhost:9000",
      region: "ap-southeast-1",
      bucket: "documents",
      accessKeyId: "app",
      secretAccessKey: "secret",
      maxUploadMb: 250,
    });
  });

  it("uses the scoped application S3 account outside local development", () => {
    process.env["ATHYPER_ENV"] = "production";
    process.env["APP_S3_ACCESS_KEY"] = "scoped-app";
    process.env["APP_S3_SECRET_KEY"] = "scoped-secret";
    process.env["S3_ACCESS_KEY"] = "root-user";
    process.env["S3_SECRET_KEY"] = "root-secret";
    expect(loadConfig().objectStorage).toMatchObject({ accessKeyId:"scoped-app", secretAccessKey:"scoped-secret" });
  });

  it("reads explicit OpenTelemetry configuration", () => {
    process.env["OTEL_EXPORTER_OTLP_ENDPOINT"] = "http://localhost:4317";
    process.env["OTEL_SERVICE_NAME"] = "athyper-api";
    process.env["SERVICE_VERSION"] = "1.2.3";
    process.env["OTEL_AUTO_INSTRUMENTATIONS_ENABLED"] = "true";

    expect(loadConfig().openTelemetry).toEqual({
      endpoint: "http://localhost:4317",
      serviceName: "athyper-api",
      serviceVersion: "1.2.3",
      enableAutoInstrumentations: true,
    });
  });

  it("reads SMTP and Twilio communication settings", () => {
    process.env["SMTP_HOST"] = "smtp.example.test";
    process.env["SMTP_PORT"] = "465";
    process.env["SMTP_SECURE"] = "true";
    process.env["SMTP_FROM"] = "no-reply@example.test";
    process.env["TWILIO_ACCOUNT_SID"] = "AC123";
    process.env["TWILIO_AUTH_TOKEN"] = "token";
    process.env["TWILIO_MESSAGING_SERVICE_SID"] = "MG123";

    const config = loadConfig();
    expect(config.email).toMatchObject({
      provider: "smtp",
      host: "smtp.example.test",
      port: 465,
      secure: true,
      fromAddress: "no-reply@example.test",
    });
    expect(config.sms).toEqual({
      accountSid: "AC123",
      authToken: "token",
      fromNumber: undefined,
      messagingServiceSid: "MG123",
    });
  });

  it("reads and validates native SES provider settings", () => {
    process.env["EMAIL_PROVIDER"] = "ses";
    process.env["SES_REGION"] = "ap-southeast-1";
    process.env["SES_CONFIGURATION_SET"] = "athyper-stg-transactional";
    process.env["SES_FROM"] = "notifications@notify.stg.athyper.com";
    process.env["SES_REPLY_TO"] = "support@athyper.com";

    expect(loadConfig().email).toMatchObject({
      provider: "ses",
      sesRegion: "ap-southeast-1",
      sesConfigurationSetName: "athyper-stg-transactional",
      sesFromAddress: "notifications@notify.stg.athyper.com",
      sesReplyToAddress: "support@athyper.com",
    });

    delete process.env["SES_FROM"];
    expect(() => loadConfig()).toThrow("EMAIL_PROVIDER=ses requires");
  });

  it("requires the SES event queue outside local environments", () => {
    process.env["ATHYPER_ENV"] = "staging";
    process.env["EMAIL_PROVIDER"] = "ses";
    process.env["SES_REGION"] = "ap-southeast-1";
    process.env["SES_CONFIGURATION_SET"] = "athyper-transactional-stg";
    process.env["SES_FROM"] = "notifications@notify.stg.athyper.com";
    expect(() => loadConfig()).toThrow("SES_EVENT_QUEUE_URL");

    process.env["SES_EVENT_QUEUE_URL"] = "https://sqs.ap-southeast-1.amazonaws.com/111111111111/athyper-stg-events";
    expect(loadConfig().sesEvents).toMatchObject({
      region: "ap-southeast-1",
      maxMessages: 10,
    });
  });

  it("rejects partial communication credentials", () => {
    process.env["SMTP_HOST"] = "smtp.example.test";
    expect(() => loadConfig()).toThrow("SMTP_FROM");

    delete process.env["SMTP_HOST"];
    process.env["TWILIO_ACCOUNT_SID"] = "AC123";
    expect(() => loadConfig()).toThrow("TWILIO_AUTH_TOKEN");
  });

  it("reads Meta WhatsApp and push provider settings", () => {
    process.env["META_WHATSAPP_API_VERSION"] = "v23.0";
    process.env["META_WHATSAPP_PHONE_NUMBER_ID"] = "phone-1";
    process.env["META_WHATSAPP_ACCESS_TOKEN"] = "secret";
    process.env["PUSH_FCM_PROJECT_ID"] = "project";
    process.env["PUSH_FCM_CLIENT_EMAIL"] = "service@example.test";
    process.env["PUSH_FCM_PRIVATE_KEY"] = "private";
    process.env["VAPID_SUBJECT"] = "mailto:no-reply@example.test";
    process.env["VAPID_PUBLIC_KEY"] = "public";
    process.env["VAPID_PRIVATE_KEY"] = "private";

    const config = loadConfig();
    expect(config.metaWhatsApp).toMatchObject({
      apiVersion: "v23.0",
      phoneNumberId: "phone-1",
      accessToken: "secret",
    });
    expect(config.fcm).toEqual({
      projectId: "project",
      clientEmail: "service@example.test",
      privateKey: "private",
    });
    expect(config.webPush).toEqual({
      subject: "mailto:no-reply@example.test",
      publicKey: "public",
      privateKey: "private",
    });
  });

  it("reads bounded Gotenberg rendering settings", () => {
    process.env["DOCRENDER_BASE_URL"] = "http://docrender:3000";
    process.env["DOCRENDER_TIMEOUT_MS"] = "90000";
    process.env["DOCRENDER_MAX_HTML_BYTES"] = "1000000";
    process.env["DOCRENDER_MAX_PDF_BYTES"] = "20000000";
    expect(loadConfig().rendering).toEqual({
      baseUrl: "http://docrender:3000",
      timeoutMs: 90_000,
      maxHtmlBytes: 1_000_000,
      maxPdfBytes: 20_000_000,
    });
  });

  it("reads Tika and Meilisearch settings",()=>{process.env["DOCPARSER_URL"]="http://docparser:9998";process.env["DOCPARSER_TIMEOUT_MS"]="90000";process.env["SEARCHCORE_URL"]="http://searchcore:7700";process.env["SEARCHCORE_MASTER_KEY"]="secret";process.env["SEARCHCORE_DOCUMENT_INDEX"]="documents_v1";expect(loadConfig()).toMatchObject({contentExtraction:{baseUrl:"http://docparser:9998",timeoutMs:90_000},search:{baseUrl:"http://searchcore:7700",apiKey:"secret",indexUid:"documents_v1"}});});

  it("reads fail-closed ClamAV settings", () => {
    process.env["CLAMD_HOST"] = "virusscan";
    process.env["CLAMD_PORT"] = "3310";
    process.env["CLAMD_TIMEOUT_MS"] = "45000";
    process.env["CLAMD_MAX_BYTES"] = "20000000";
    expect(loadConfig().malwareScanning).toEqual({ host:"virusscan", port:3310, timeoutMs:45_000, maxBytes:20_000_000, onUnavailable:"fail-closed" });
  });

  it("rejects fail-open malware scanning", () => {
    process.env["CLAMD_ON_UNAVAILABLE"] = "fail-open";
    expect(() => loadConfig()).toThrow("CLAMD_ON_UNAVAILABLE must be one of fail-closed");
  });

  it("reads fail-closed Publication rollout configuration",()=>{
    process.env["PUBLICATION_APPLY_ENABLED"]="true";process.env["PUBLICATION_TARGET_PLANES"]="studio,neon,mesh";process.env["PUBLICATION_SIGNING_KEY_ID"]="key-v1";process.env["PUBLICATION_PUBLIC_KEY_REFERENCE"]="publication/public";process.env["INFISICAL_URL"]="https://secrets.example";process.env["INFISICAL_TOKEN"]="token";process.env["INFISICAL_WORKSPACE_ID"]="workspace";
    expect(loadConfig()).toMatchObject({publication:{compileEnabled:false,dispatchEnabled:false,applyEnabled:true,targetPlanes:["studio","neon","mesh"],requireSignature:true,signingKeyId:"key-v1",publicKeyReference:"publication/public"},infisical:{endpoint:"https://secrets.example",token:"token",workspaceId:"workspace"}});
  });

  it("rejects unsigned or non-canonical Publication configuration",()=>{
    process.env["PUBLICATION_REQUIRE_SIGNATURE"]="false";expect(()=>loadConfig()).toThrow("PUBLICATION_REQUIRE_SIGNATURE");delete process.env["PUBLICATION_REQUIRE_SIGNATURE"];
    process.env["PUBLICATION_TARGET_PLANES"]="athyper";expect(()=>loadConfig()).toThrow("invalid plane");
  });

  it("reads independently gated control-administration surfaces",()=>{
    process.env["WAVE0_CONTROL_ADMIN_TENANT_OVERRIDES_ENABLED"]="true";
    process.env["WAVE0_CONTROL_ADMIN_CYCLE_CONFIG_ENABLED"]="true";
    process.env["WAVE0_CONTROL_ADMIN_RUNTIME_COMMANDS_ENABLED"]="true";
    expect(loadConfig().wave0).toMatchObject({controlAdminTenantOverridesEnabled:true,controlAdminCycleConfigEnabled:true,controlAdminLookupRoundingEnabled:false,controlAdminConnectorLifecycleEnabled:false,controlAdminLocalCatalogReadsEnabled:false,controlAdminCatalogAuthoringEnabled:false,controlAdminRuntimeCommandsEnabled:true});
  });
});

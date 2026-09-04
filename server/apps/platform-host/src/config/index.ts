export interface HostConfig {
  port: number;
  logLevel: string;
  shutdownTimeoutMs: number;
  env: "local" | "staging" | "production";
  mode: string;
  database: {
    connectionString: string | undefined;
    poolMax: number;
  };
  studioDatabase: {
    connectionString: string | undefined;
    poolMax: number;
  };
  meshDatabase: {
    connectionString: string | undefined;
    poolMax: number;
  };
  businessPartner360: {
    meshLiveBaseUrl: string | undefined;
    meshLiveCredentialReference: string | undefined;
    meshTimeoutMs: number;
  };
  keycloak: {
    issuerUrl: string | undefined;
    audience: string | undefined;
    jwksUrl: string | undefined;
    jwksCacheTtlMs: number;
  };
  iam: {
    defaultRealmKey: string;
    claimContextMode: "off" | "shadow" | "enforce" | "on";
    requireAuthorizedRole: boolean;
    enforceRequiredActions: boolean;
    requiredActionsMatrixJson: string | undefined;
  };
  identityProvider: {
    keycloakAdminBaseUrl: string | undefined;
    keycloakAdminRealm: string;
    keycloakAdminClientId: string | undefined;
    keycloakAdminCredentialReference: string | undefined;
  };
  redis: {
    url: string | undefined;
    keyPrefix: string | undefined;
    connectTimeoutMs: number;
    maxRetriesPerRequest: number;
  };
  bullMq: {
    url: string | undefined;
    concurrency: number;
    usesSharedRedis: boolean;
  };
  jobs: {
    scheduleReconcileMs: number;
    cronwatchBaseUrl: string | undefined;
    cronwatchPingKey: string | undefined;
    workerDatabaseUrls: {
      studio: string | undefined;
      neon: string | undefined;
      mesh: string | undefined;
    };
    invalidationListenerDatabaseUrls: {
      studio: string | undefined;
      neon: string | undefined;
      mesh: string | undefined;
    };
  };
  objectStorage: {
    endpoint: string | undefined;
    publicEndpoint: string | undefined;
    region: string;
    bucket: string | undefined;
    accessKeyId: string | undefined;
    secretAccessKey: string | undefined;
    multipartPartSizeMb: number;
    multipartQueueSize: number;
    maxUploadMb: number;
    presignedTtlSeconds: number;
    tenantQuotaGb: number;
    tenantQuotaItems: number;
    quotaReservationTtlSeconds: number;
    quotaRetryAfterSeconds: number;
  };
  malwareScanning: {
    host: string | undefined;
    port: number;
    timeoutMs: number;
    maxBytes: number;
    onUnavailable: "fail-closed";
  };
  openTelemetry: {
    endpoint: string | undefined;
    serviceName: string;
    serviceVersion: string;
    enableAutoInstrumentations: boolean;
  };
  email: {
    provider: "smtp" | "ses" | "disabled";
    host: string | undefined;
    port: number;
    secure: boolean;
    user: string | undefined;
    password: string | undefined;
    fromAddress: string | undefined;
    sesRegion: string | undefined;
    sesConfigurationSetName: string | undefined;
    sesFromAddress: string | undefined;
    sesReplyToAddress: string | undefined;
  };
  sesEvents: {
    region: string | undefined;
    queueUrl: string | undefined;
    waitTimeSeconds: number;
    visibilityTimeoutSeconds: number;
    maxMessages: number;
    failureBackoffMs: number;
  };
  sms: {
    accountSid: string | undefined;
    authToken: string | undefined;
    fromNumber: string | undefined;
    messagingServiceSid: string | undefined;
  };
  metaWhatsApp: {
    apiVersion: string | undefined;
    phoneNumberId: string | undefined;
    accessToken: string | undefined;
    graphBaseUrl: string | undefined;
  };
  fcm: {
    projectId: string | undefined;
    clientEmail: string | undefined;
    privateKey: string | undefined;
  };
  webPush: {
    subject: string | undefined;
    publicKey: string | undefined;
    privateKey: string | undefined;
  };
  rendering: {
    baseUrl: string | undefined;
    timeoutMs: number;
    maxHtmlBytes: number;
    maxPdfBytes: number;
  };
  contentExtraction: {
    baseUrl: string | undefined;
    timeoutMs: number;
    maxInputBytes: number;
    maxTextChars: number;
  };
  search: {
    baseUrl: string | undefined;
    apiKey: string | undefined;
    indexUid: string;
    timeoutMs: number;
  };
  verification: {
    enabled: boolean;
    grafanaUrl: string | undefined;
  };
  publication: {
    apiEnabled: boolean;
    compileEnabled: boolean;
    dispatchEnabled: boolean;
    applyEnabled: boolean;
    recoveryEnabled: boolean;
    targetPlanes: readonly ("studio" | "neon" | "mesh")[];
    requireSignature: true;
    signingKeyId: string | undefined;
    privateKeyReference: string | undefined;
    publicKeyReference: string | undefined;
    runtimeVersion: string;
    recoveryIntervalMs: number;
  };
  infisical: {
    endpoint: string | undefined;
    token: string | undefined;
    workspaceId: string | undefined;
    environment: string;
    secretPath: string;
  };
  wave0: {
    financeRoutesEnabled: boolean;
    financeF2Enabled?: boolean;
    financeF3Enabled?: boolean;
    financeF4Enabled?: boolean;
    financeF5Enabled?: boolean;
    financeF6Enabled?: boolean;
    governanceRoutesEnabled: boolean;
    controlAdminTenantOverridesEnabled: boolean;
    controlAdminLookupRoundingEnabled: boolean;
    controlAdminConnectorLifecycleEnabled: boolean;
    controlAdminCycleConfigEnabled: boolean;
    controlAdminLocalCatalogReadsEnabled: boolean;
    controlAdminCatalogAuthoringEnabled: boolean;
    controlAdminRuntimeCommandsEnabled: boolean;
    recordSnapshotRoutesEnabled: boolean;
    recordTransferPublicApiEnabled: boolean;
    businessPartnerDeliveryEnabled?: boolean;
    businessPartnerReconciliationEnabled?: boolean;
    authorizationManagementRoutesEnabled: boolean;
    authorizationManagementMutationsEnabled: boolean;
    authorizationManagementMode: "legacy" | "shadow" | "enforce";
    authorizationGoldenEvaluatorCorpusQualified: boolean;
    authorizationDdlEpochIntegrationQualified: boolean;
    authorizationWriterSwitchQualified: boolean;
  };
  atlas: {
    enabled: boolean;
    toolsEnabled: boolean;
    persistenceEnabled: boolean;
  };
}

export function loadConfig(): HostConfig {
  const rawEnv = process.env["ATHYPER_ENV"] ?? process.env["ENVIRONMENT"];
  const env = (["local", "staging", "production"] as const).includes(
    rawEnv as "local" | "staging" | "production",
  )
    ? (rawEnv as "local" | "staging" | "production")
    : process.env["NODE_ENV"] === "production"
      ? "production"
      : "local";
  const mode = process.env["MODE"] ?? "api";

  const port = Number(process.env["PORT"] ?? 4000);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(
      `PORT must be a positive integer, got: ${process.env["PORT"]}`,
    );
  }

  const shutdownTimeoutMs = Number(
    process.env["SHUTDOWN_TIMEOUT_MS"] ?? 15_000,
  );
  if (!Number.isFinite(shutdownTimeoutMs) || shutdownTimeoutMs <= 0) {
    throw new Error(
      `SHUTDOWN_TIMEOUT_MS must be a positive integer, got: ${process.env["SHUTDOWN_TIMEOUT_MS"]}`,
    );
  }

  const poolMax = Number(process.env["DATABASE_POOL_MAX"] ?? 10);
  if (!Number.isInteger(poolMax) || poolMax <= 0) {
    throw new Error(
      `DATABASE_POOL_MAX must be a positive integer, got: ${process.env["DATABASE_POOL_MAX"]}`,
    );
  }

  const rawDatabaseUrl = process.env["DATABASE_URL"]?.trim();
  const studioPoolMax = readPositiveInteger("STUDIO_DATABASE_POOL_MAX", 5);
  const meshPoolMax = readPositiveInteger("MESH_DATABASE_POOL_MAX", 10);
  const rawStudioDatabaseUrl = readStudioEnvironment("DATABASE_URL");
  const rawMeshDatabaseUrl = process.env["MESH_DATABASE_URL"]?.trim();
  const bp360MeshLiveBaseUrl = process.env["BP360_MESH_LIVE_BASE_URL"]?.trim(),
    bp360MeshLiveCredentialReference =
      process.env["BP360_MESH_LIVE_CREDENTIAL_REFERENCE"]?.trim(),
    bp360MeshTimeoutMs = readPositiveInteger("BP360_MESH_TIMEOUT_MS", 1_500);
  if (
    Boolean(bp360MeshLiveBaseUrl) !== Boolean(bp360MeshLiveCredentialReference)
  )
    throw new Error(
      "BP360 MESH live transport requires both BP360_MESH_LIVE_BASE_URL and BP360_MESH_LIVE_CREDENTIAL_REFERENCE",
    );
  if (bp360MeshTimeoutMs > 3_000)
    throw new Error("BP360_MESH_TIMEOUT_MS must not exceed 3000");
  const explicitIssuer =
    process.env["KEYCLOAK_ISSUER_URL"]?.trim() ??
    process.env["IAM_ISSUER_URL"]?.trim();
  const keycloakBaseUrl = process.env["KEYCLOAK_BASE_URL"]?.trim();
  const keycloakRealm = process.env["KEYCLOAK_REALM"]?.trim();
  const keycloakAudience =
    process.env["KEYCLOAK_CLIENT_ID"]?.trim() ??
    process.env["IAM_CLIENT_ID"]?.trim();
  const keycloakIssuer =
    explicitIssuer ||
    (keycloakBaseUrl && keycloakRealm
      ? `${keycloakBaseUrl.replace(/\/+$/, "")}/realms/${keycloakRealm}`
      : undefined);
  const hasPartialKeycloakConfig = Boolean(
    explicitIssuer || keycloakBaseUrl || keycloakRealm || keycloakAudience,
  );
  if (hasPartialKeycloakConfig && (!keycloakIssuer || !keycloakAudience)) {
    throw new Error(
      "Keycloak configuration requires a client ID and either an issuer URL or KEYCLOAK_BASE_URL plus KEYCLOAK_REALM",
    );
  }
  const jwksCacheTtlMs = readPositiveInteger(
    "KEYCLOAK_JWKS_CACHE_TTL_MS",
    600_000,
  );
  const keycloakJwksUrl = process.env["KEYCLOAK_JWKS_URL"]?.trim();
  const claimContextMode = readChoice(
    "AUTH_CLAIM_FIRST_CONTEXT",
    env === "production" ? "enforce" : "shadow",
    ["off", "shadow", "enforce", "on"] as const,
  );
  const requireAuthorizedRole = readBoolean(
    "AUTH_REQUIRE_AUTHORIZED_ROLE",
    true,
  );
  const enforceRequiredActions = readBoolean(
    "AUTH_VERIFY_ENFORCE_REQUIRED_ACTIONS",
    true,
  );
  const requiredActionsMatrixJson =
    process.env["AUTH_REQUIRED_ACTIONS_MATRIX"]?.trim();
  const keycloakAdminBaseUrl = process.env["KEYCLOAK_ADMIN_BASE_URL"]?.trim();
  const keycloakAdminClientId = process.env["KEYCLOAK_ADMIN_CLIENT_ID"]?.trim();
  const keycloakAdminCredentialReference =
    process.env["KEYCLOAK_ADMIN_CREDENTIAL_REFERENCE"]?.trim();
  const keycloakAdminRealm =
    process.env["KEYCLOAK_ADMIN_REALM"]?.trim() || "master";
  const hasPartialIdentityProvider = Boolean(
    keycloakAdminBaseUrl ||
    keycloakAdminClientId ||
    keycloakAdminCredentialReference,
  );
  if (
    hasPartialIdentityProvider &&
    !(
      keycloakAdminBaseUrl &&
      keycloakAdminClientId &&
      keycloakAdminCredentialReference
    )
  )
    throw new Error(
      "Keycloak identity provider requires KEYCLOAK_ADMIN_BASE_URL, KEYCLOAK_ADMIN_CLIENT_ID and KEYCLOAK_ADMIN_CREDENTIAL_REFERENCE",
    );
  const redisUrl = process.env["REDIS_URL"]?.trim();
  const redisKeyPrefix = process.env["REDIS_KEY_PREFIX"]?.trim();
  const redisConnectTimeoutMs = readPositiveInteger(
    "REDIS_CONNECT_TIMEOUT_MS",
    10_000,
  );
  const redisMaxRetriesPerRequest = readNonNegativeInteger(
    "REDIS_MAX_RETRIES_PER_REQUEST",
    2,
  );
  const explicitBullMqUrl = process.env["REDIS_BULLMQ_URL"]?.trim();
  const allowSharedBullMqRedis = readBoolean(
    "ALLOW_SHARED_BULLMQ_REDIS",
    env === "local",
  );
  const bullMqUrl =
    explicitBullMqUrl || (allowSharedBullMqRedis ? redisUrl : undefined);
  const bullMqConcurrency = readPositiveInteger("JOB_WORKER_CONCURRENCY", 10);
  const scheduleReconcileMs = readPositiveInteger(
    "JOB_SCHEDULE_RECONCILE_MS",
    60_000,
  );
  const cronwatchBaseUrl = process.env["CRONWATCH_BASE_URL"]?.trim();
  const cronwatchPingKey = process.env["CRONWATCH_PING_KEY"]?.trim();
  const studioWorkerDatabaseUrl = readStudioEnvironment("WORKER_DATABASE_URL");
  const neonWorkerDatabaseUrl =
    process.env["NEON_WORKER_DATABASE_URL"]?.trim() ??
    process.env["DATABASE_ADMIN_URL"]?.trim();
  const meshWorkerDatabaseUrl = process.env["MESH_WORKER_DATABASE_URL"]?.trim();
  const studioInvalidationListenerUrl =
    process.env["STUDIO_INVALIDATION_LISTENER_DATABASE_URL"]?.trim();
  const neonInvalidationListenerUrl =
    process.env["NEON_INVALIDATION_LISTENER_DATABASE_URL"]?.trim();
  const meshInvalidationListenerUrl =
    process.env["MESH_INVALIDATION_LISTENER_DATABASE_URL"]?.trim();
  if (env === "production" && mode === "worker") {
    const missing = [
      rawStudioDatabaseUrl && !studioWorkerDatabaseUrl
        ? "STUDIO_WORKER_DATABASE_URL"
        : undefined,
      rawDatabaseUrl && !neonWorkerDatabaseUrl
        ? "NEON_WORKER_DATABASE_URL"
        : undefined,
      rawMeshDatabaseUrl && !meshWorkerDatabaseUrl
        ? "MESH_WORKER_DATABASE_URL"
        : undefined,
    ].filter((value): value is string => Boolean(value));
    if (missing.length > 0) {
      throw new Error(
        `Production worker requires dedicated job database URLs: ${missing.join(", ")}`,
      );
    }
  }
  const s3Endpoint = process.env["S3_ENDPOINT"]?.trim();
  const s3PublicEndpoint = process.env["S3_PUBLIC_ENDPOINT"]?.trim();
  const s3Bucket = process.env["S3_BUCKET"]?.trim();
  const s3AccessKeyId =
    process.env["APP_S3_ACCESS_KEY"]?.trim() ??
    (env === "local" ? process.env["S3_ACCESS_KEY"]?.trim() : undefined);
  const s3SecretAccessKey =
    process.env["APP_S3_SECRET_KEY"]?.trim() ??
    (env === "local" ? process.env["S3_SECRET_KEY"]?.trim() : undefined);
  if (Boolean(s3AccessKeyId) !== Boolean(s3SecretAccessKey))
    throw new Error(
      "Object storage requires both APP_S3_ACCESS_KEY and APP_S3_SECRET_KEY",
    );
  const s3Region = process.env["S3_REGION"]?.trim() || "us-east-1";
  const s3MultipartPartSizeMb = readPositiveInteger(
    "S3_MULTIPART_PART_SIZE_MB",
    5,
  );
  const s3MultipartQueueSize = readPositiveInteger(
    "S3_MULTIPART_QUEUE_SIZE",
    4,
  );
  const s3MaxUploadMb = readPositiveInteger("S3_MAX_UPLOAD_MB", 100);
  const s3PresignedTtlSeconds = readPositiveInteger(
    "S3_PRESIGNED_TTL_SECONDS",
    900,
  );
  const attachmentTenantQuotaGb = readPositiveInteger(
    "ATTACHMENT_TENANT_QUOTA_GB",
    10,
  );
  const attachmentTenantQuotaItems = readPositiveInteger(
    "ATTACHMENT_TENANT_QUOTA_ITEMS",
    50_000,
  );
  const attachmentQuotaReservationTtlSeconds = readPositiveInteger(
    "ATTACHMENT_QUOTA_RESERVATION_TTL_SECONDS",
    1_800,
  );
  const attachmentQuotaRetryAfterSeconds = readPositiveInteger(
    "ATTACHMENT_QUOTA_RETRY_AFTER_SECONDS",
    900,
  );
  const clamdHost = process.env["CLAMD_HOST"]?.trim();
  const clamdPort = readPositiveInteger("CLAMD_PORT", 3310);
  if (clamdPort > 65_535) throw new Error("CLAMD_PORT must not exceed 65535");
  const clamdTimeoutMs = readPositiveInteger("CLAMD_TIMEOUT_MS", 30_000);
  const clamdMaxBytes = readPositiveInteger(
    "CLAMD_MAX_BYTES",
    s3MaxUploadMb * 1_024 * 1_024,
  );
  const clamdOnUnavailable = readChoice("CLAMD_ON_UNAVAILABLE", "fail-closed", [
    "fail-closed",
  ] as const);
  const otlpEndpoint = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"]?.trim();
  const otelServiceName =
    process.env["OTEL_SERVICE_NAME"]?.trim() ||
    process.env["SERVICE_NAME"]?.trim() ||
    "athyper-platform-host";
  const otelServiceVersion = process.env["SERVICE_VERSION"]?.trim() || "0.0.0";
  const otelAutoInstrumentations = readBoolean(
    "OTEL_AUTO_INSTRUMENTATIONS_ENABLED",
    false,
  );
  const smtpHost = process.env["SMTP_HOST"]?.trim();
  const smtpUser = process.env["SMTP_USER"]?.trim();
  const smtpPassword = process.env["SMTP_PASS"]?.trim();
  const smtpFromAddress = process.env["SMTP_FROM"]?.trim();
  const smtpPort = readPositiveInteger("SMTP_PORT", 587);
  const smtpSecure = readBoolean("SMTP_SECURE", false);
  const sesRegion = process.env["SES_REGION"]?.trim();
  const sesConfigurationSetName = process.env["SES_CONFIGURATION_SET"]?.trim();
  const sesFromAddress = process.env["SES_FROM"]?.trim();
  const sesReplyToAddress = process.env["SES_REPLY_TO"]?.trim();
  const hasSesConfig = Boolean(
    sesRegion || sesConfigurationSetName || sesFromAddress || sesReplyToAddress,
  );
  const hasSmtpConfig = Boolean(
    smtpHost || smtpUser || smtpPassword || smtpFromAddress,
  );
  const emailProvider = readChoice(
    "EMAIL_PROVIDER",
    hasSesConfig ? "ses" : hasSmtpConfig ? "smtp" : "disabled",
    ["smtp", "ses", "disabled"] as const,
  );
  if (
    hasSmtpConfig &&
    (!smtpHost ||
      !smtpFromAddress ||
      Boolean(smtpUser) !== Boolean(smtpPassword))
  ) {
    throw new Error(
      "SMTP configuration requires SMTP_HOST, SMTP_FROM, and both or neither of SMTP_USER and SMTP_PASS",
    );
  }
  if (emailProvider === "smtp" && (!smtpHost || !smtpFromAddress)) {
    throw new Error("EMAIL_PROVIDER=smtp requires SMTP_HOST and SMTP_FROM");
  }
  if (
    emailProvider === "ses" &&
    (!sesRegion || !sesConfigurationSetName || !sesFromAddress)
  ) {
    throw new Error(
      "EMAIL_PROVIDER=ses requires SES_REGION, SES_CONFIGURATION_SET, and SES_FROM",
    );
  }
  const sesEventQueueUrl = process.env["SES_EVENT_QUEUE_URL"]?.trim();
  const sesEventRegion = process.env["SES_EVENT_REGION"]?.trim() || sesRegion;
  const sesEventWaitTimeSeconds = readNonNegativeInteger(
    "SES_EVENT_WAIT_SECONDS",
    20,
  );
  const sesEventVisibilityTimeoutSeconds = readPositiveInteger(
    "SES_EVENT_VISIBILITY_TIMEOUT_SECONDS",
    60,
  );
  const sesEventMaxMessages = readPositiveInteger("SES_EVENT_MAX_MESSAGES", 10);
  const sesEventFailureBackoffMs = readPositiveInteger(
    "SES_EVENT_FAILURE_BACKOFF_MS",
    1_000,
  );
  if (sesEventWaitTimeSeconds > 20)
    throw new Error("SES_EVENT_WAIT_SECONDS must not exceed 20");
  if (sesEventVisibilityTimeoutSeconds > 43_200)
    throw new Error(
      "SES_EVENT_VISIBILITY_TIMEOUT_SECONDS must not exceed 43200",
    );
  if (sesEventMaxMessages > 10)
    throw new Error("SES_EVENT_MAX_MESSAGES must not exceed 10");
  if (sesEventFailureBackoffMs > 60_000)
    throw new Error("SES_EVENT_FAILURE_BACKOFF_MS must not exceed 60000");
  if (sesEventQueueUrl) {
    let queueUrl: URL;
    try {
      queueUrl = new URL(sesEventQueueUrl);
    } catch {
      throw new Error("SES_EVENT_QUEUE_URL must be a valid HTTPS URL");
    }
    if (queueUrl.protocol !== "https:")
      throw new Error("SES_EVENT_QUEUE_URL must be a valid HTTPS URL");
    if (!sesEventRegion)
      throw new Error(
        "SES_EVENT_REGION or SES_REGION is required with SES_EVENT_QUEUE_URL",
      );
  }
  if (
    emailProvider === "ses" &&
    env !== "local" &&
    (!sesEventQueueUrl || !sesEventRegion)
  ) {
    throw new Error(
      "Native SES requires SES_EVENT_QUEUE_URL and an SES event region outside local environments",
    );
  }
  const metaWhatsAppApiVersion =
    process.env["META_WHATSAPP_API_VERSION"]?.trim();
  const metaWhatsAppPhoneNumberId =
    process.env["META_WHATSAPP_PHONE_NUMBER_ID"]?.trim();
  const metaWhatsAppAccessToken =
    process.env["META_WHATSAPP_ACCESS_TOKEN"]?.trim();
  const metaWhatsAppGraphBaseUrl =
    process.env["META_WHATSAPP_GRAPH_BASE_URL"]?.trim();
  const hasMetaWhatsAppConfig = Boolean(
    metaWhatsAppApiVersion ||
    metaWhatsAppPhoneNumberId ||
    metaWhatsAppAccessToken ||
    metaWhatsAppGraphBaseUrl,
  );
  if (
    hasMetaWhatsAppConfig &&
    (!metaWhatsAppApiVersion ||
      !metaWhatsAppPhoneNumberId ||
      !metaWhatsAppAccessToken)
  ) {
    throw new Error(
      "Meta WhatsApp configuration requires META_WHATSAPP_API_VERSION, META_WHATSAPP_PHONE_NUMBER_ID, and META_WHATSAPP_ACCESS_TOKEN",
    );
  }
  const fcmProjectId = process.env["PUSH_FCM_PROJECT_ID"]?.trim();
  const fcmClientEmail = process.env["PUSH_FCM_CLIENT_EMAIL"]?.trim();
  const fcmPrivateKey = process.env["PUSH_FCM_PRIVATE_KEY"]?.trim();
  if (
    Boolean(fcmProjectId || fcmClientEmail || fcmPrivateKey) &&
    !(fcmProjectId && fcmClientEmail && fcmPrivateKey)
  ) {
    throw new Error(
      "FCM configuration requires PUSH_FCM_PROJECT_ID, PUSH_FCM_CLIENT_EMAIL, and PUSH_FCM_PRIVATE_KEY",
    );
  }
  const vapidSubject = process.env["VAPID_SUBJECT"]?.trim();
  const vapidPublicKey = process.env["VAPID_PUBLIC_KEY"]?.trim();
  const vapidPrivateKey = process.env["VAPID_PRIVATE_KEY"]?.trim();
  if (
    Boolean(vapidSubject || vapidPublicKey || vapidPrivateKey) &&
    !(vapidSubject && vapidPublicKey && vapidPrivateKey)
  ) {
    throw new Error(
      "Web Push configuration requires VAPID_SUBJECT, VAPID_PUBLIC_KEY, and VAPID_PRIVATE_KEY",
    );
  }
  const docRenderBaseUrl = process.env["DOCRENDER_BASE_URL"]?.trim();
  const docRenderTimeoutMs = readPositiveInteger(
    "DOCRENDER_TIMEOUT_MS",
    120_000,
  );
  const docRenderMaxHtmlBytes = readPositiveInteger(
    "DOCRENDER_MAX_HTML_BYTES",
    5 * 1_024 * 1_024,
  );
  const docRenderMaxPdfBytes = readPositiveInteger(
    "DOCRENDER_MAX_PDF_BYTES",
    50 * 1_024 * 1_024,
  );
  const docParserBaseUrl = process.env["DOCPARSER_URL"]?.trim();
  const docParserTimeoutMs = readPositiveInteger(
    "DOCPARSER_TIMEOUT_MS",
    120_000,
  );
  const docParserMaxInputBytes = readPositiveInteger(
    "DOCPARSER_MAX_INPUT_BYTES",
    50 * 1_024 * 1_024,
  );
  const docParserMaxTextChars = readPositiveInteger(
    "DOCPARSER_MAX_TEXT_CHARS",
    5_000_000,
  );
  const searchBaseUrl = process.env["SEARCHCORE_URL"]?.trim();
  const searchApiKey = process.env["SEARCHCORE_MASTER_KEY"]?.trim();
  if (Boolean(searchBaseUrl) !== Boolean(searchApiKey))
    throw new Error(
      "Search requires both SEARCHCORE_URL and SEARCHCORE_MASTER_KEY",
    );
  const searchIndexUid =
    process.env["SEARCHCORE_DOCUMENT_INDEX"]?.trim() || "documents";
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(searchIndexUid))
    throw new Error("SEARCHCORE_DOCUMENT_INDEX is invalid");
  const searchTimeoutMs = readPositiveInteger("SEARCHCORE_TIMEOUT_MS", 10_000);
  const publicationApiEnabled = readBoolean("PUBLICATION_API_ENABLED", false);
  const publicationCompileEnabled = readBoolean(
    "PUBLICATION_COMPILE_ENABLED",
    false,
  );
  const publicationDispatchEnabled = readBoolean(
    "PUBLICATION_DISPATCH_ENABLED",
    false,
  );
  const publicationApplyEnabled = readBoolean(
    "PUBLICATION_APPLY_ENABLED",
    false,
  );
  const publicationRecoveryEnabled = readBoolean(
    "PUBLICATION_RECOVERY_ENABLED",
    false,
  );
  const publicationTargetPlanes = readPublicationPlanes(
    process.env["PUBLICATION_TARGET_PLANES"],
  );
  if (
    (publicationApiEnabled ||
      publicationCompileEnabled ||
      publicationDispatchEnabled ||
      publicationApplyEnabled ||
      publicationRecoveryEnabled) &&
    publicationTargetPlanes.length === 0
  )
    throw new Error("Enabled Publication requires PUBLICATION_TARGET_PLANES");
  const publicationRequireSignature = readBoolean(
    "PUBLICATION_REQUIRE_SIGNATURE",
    true,
  );
  if (!publicationRequireSignature)
    throw new Error("PUBLICATION_REQUIRE_SIGNATURE must remain true");
  const publicationSigningKeyId =
    process.env["PUBLICATION_SIGNING_KEY_ID"]?.trim();
  const publicationPrivateKeyReference =
    process.env["PUBLICATION_PRIVATE_KEY_REFERENCE"]?.trim();
  const publicationPublicKeyReference =
    process.env["PUBLICATION_PUBLIC_KEY_REFERENCE"]?.trim();
  const publicationRuntimeVersion =
    process.env["PUBLICATION_RUNTIME_VERSION"]?.trim() ||
    process.env["SERVICE_VERSION"]?.trim() ||
    "0.0.0";
  const publicationRecoveryIntervalMs = readPositiveInteger(
    "PUBLICATION_RECOVERY_INTERVAL_MS",
    60_000,
  );
  const infisicalEndpoint = process.env["INFISICAL_URL"]?.trim();
  const infisicalToken = process.env["INFISICAL_TOKEN"]?.trim();
  const infisicalWorkspaceId = process.env["INFISICAL_WORKSPACE_ID"]?.trim();
  const twilioAccountSid = process.env["TWILIO_ACCOUNT_SID"]?.trim();
  const twilioAuthToken = process.env["TWILIO_AUTH_TOKEN"]?.trim();
  const twilioFromNumber = process.env["TWILIO_FROM_NUMBER"]?.trim();
  const twilioMessagingServiceSid =
    process.env["TWILIO_MESSAGING_SERVICE_SID"]?.trim();
  const hasTwilioConfig = Boolean(
    twilioAccountSid ||
    twilioAuthToken ||
    twilioFromNumber ||
    twilioMessagingServiceSid,
  );
  if (
    hasTwilioConfig &&
    (!twilioAccountSid ||
      !twilioAuthToken ||
      (!twilioFromNumber && !twilioMessagingServiceSid))
  ) {
    throw new Error(
      "Twilio configuration requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and a from number or messaging service SID",
    );
  }

  const config: HostConfig = {
    port,
    logLevel: process.env["LOG_LEVEL"] ?? "info",
    shutdownTimeoutMs,
    env,
    mode,
    database: {
      connectionString: rawDatabaseUrl || undefined,
      poolMax,
    },
    studioDatabase: {
      connectionString: rawStudioDatabaseUrl || undefined,
      poolMax: studioPoolMax,
    },
    meshDatabase: {
      connectionString: rawMeshDatabaseUrl || undefined,
      poolMax: meshPoolMax,
    },
    businessPartner360: {
      meshLiveBaseUrl: bp360MeshLiveBaseUrl || undefined,
      meshLiveCredentialReference:
        bp360MeshLiveCredentialReference || undefined,
      meshTimeoutMs: bp360MeshTimeoutMs,
    },
    keycloak: {
      issuerUrl: keycloakIssuer,
      audience: keycloakAudience || undefined,
      jwksUrl: keycloakJwksUrl || undefined,
      jwksCacheTtlMs,
    },
    iam: {
      defaultRealmKey: keycloakRealm || "default",
      claimContextMode,
      requireAuthorizedRole,
      enforceRequiredActions,
      requiredActionsMatrixJson: requiredActionsMatrixJson || undefined,
    },
    identityProvider: {
      keycloakAdminBaseUrl: keycloakAdminBaseUrl || undefined,
      keycloakAdminRealm,
      keycloakAdminClientId: keycloakAdminClientId || undefined,
      keycloakAdminCredentialReference:
        keycloakAdminCredentialReference || undefined,
    },
    redis: {
      url: redisUrl || undefined,
      keyPrefix: redisKeyPrefix || undefined,
      connectTimeoutMs: redisConnectTimeoutMs,
      maxRetriesPerRequest: redisMaxRetriesPerRequest,
    },
    bullMq: {
      url: bullMqUrl || undefined,
      concurrency: bullMqConcurrency,
      usesSharedRedis: Boolean(bullMqUrl && !explicitBullMqUrl && redisUrl),
    },
    jobs: {
      scheduleReconcileMs,
      cronwatchBaseUrl: cronwatchBaseUrl || undefined,
      cronwatchPingKey: cronwatchPingKey || undefined,
      workerDatabaseUrls: {
        studio: studioWorkerDatabaseUrl || undefined,
        neon: neonWorkerDatabaseUrl || undefined,
        mesh: meshWorkerDatabaseUrl || undefined,
      },
      invalidationListenerDatabaseUrls: {
        studio: studioInvalidationListenerUrl || undefined,
        neon: neonInvalidationListenerUrl || undefined,
        mesh: meshInvalidationListenerUrl || undefined,
      },
    },
    objectStorage: {
      endpoint: s3Endpoint || undefined,
      publicEndpoint: s3PublicEndpoint || undefined,
      region: s3Region,
      bucket: s3Bucket || undefined,
      accessKeyId: s3AccessKeyId || undefined,
      secretAccessKey: s3SecretAccessKey || undefined,
      multipartPartSizeMb: s3MultipartPartSizeMb,
      multipartQueueSize: s3MultipartQueueSize,
      maxUploadMb: s3MaxUploadMb,
      presignedTtlSeconds: s3PresignedTtlSeconds,
      tenantQuotaGb: attachmentTenantQuotaGb,
      tenantQuotaItems: attachmentTenantQuotaItems,
      quotaReservationTtlSeconds: attachmentQuotaReservationTtlSeconds,
      quotaRetryAfterSeconds: attachmentQuotaRetryAfterSeconds,
    },
    malwareScanning: {
      host: clamdHost || undefined,
      port: clamdPort,
      timeoutMs: clamdTimeoutMs,
      maxBytes: clamdMaxBytes,
      onUnavailable: clamdOnUnavailable,
    },
    openTelemetry: {
      endpoint: otlpEndpoint || undefined,
      serviceName: otelServiceName,
      serviceVersion: otelServiceVersion,
      enableAutoInstrumentations: otelAutoInstrumentations,
    },
    email: {
      provider: emailProvider,
      host: smtpHost || undefined,
      port: smtpPort,
      secure: smtpSecure,
      user: smtpUser || undefined,
      password: smtpPassword || undefined,
      fromAddress: smtpFromAddress || undefined,
      sesRegion: sesRegion || undefined,
      sesConfigurationSetName: sesConfigurationSetName || undefined,
      sesFromAddress: sesFromAddress || undefined,
      sesReplyToAddress: sesReplyToAddress || undefined,
    },
    sesEvents: {
      region: sesEventRegion || undefined,
      queueUrl: sesEventQueueUrl || undefined,
      waitTimeSeconds: sesEventWaitTimeSeconds,
      visibilityTimeoutSeconds: sesEventVisibilityTimeoutSeconds,
      maxMessages: sesEventMaxMessages,
      failureBackoffMs: sesEventFailureBackoffMs,
    },
    sms: {
      accountSid: twilioAccountSid || undefined,
      authToken: twilioAuthToken || undefined,
      fromNumber: twilioFromNumber || undefined,
      messagingServiceSid: twilioMessagingServiceSid || undefined,
    },
    metaWhatsApp: {
      apiVersion: metaWhatsAppApiVersion || undefined,
      phoneNumberId: metaWhatsAppPhoneNumberId || undefined,
      accessToken: metaWhatsAppAccessToken || undefined,
      graphBaseUrl: metaWhatsAppGraphBaseUrl || undefined,
    },
    fcm: {
      projectId: fcmProjectId || undefined,
      clientEmail: fcmClientEmail || undefined,
      privateKey: fcmPrivateKey || undefined,
    },
    webPush: {
      subject: vapidSubject || undefined,
      publicKey: vapidPublicKey || undefined,
      privateKey: vapidPrivateKey || undefined,
    },
    rendering: {
      baseUrl: docRenderBaseUrl || undefined,
      timeoutMs: docRenderTimeoutMs,
      maxHtmlBytes: docRenderMaxHtmlBytes,
      maxPdfBytes: docRenderMaxPdfBytes,
    },
    contentExtraction: {
      baseUrl: docParserBaseUrl || undefined,
      timeoutMs: docParserTimeoutMs,
      maxInputBytes: docParserMaxInputBytes,
      maxTextChars: docParserMaxTextChars,
    },
    search: {
      baseUrl: searchBaseUrl || undefined,
      apiKey: searchApiKey || undefined,
      indexUid: searchIndexUid,
      timeoutMs: searchTimeoutMs,
    },
    verification: {
      enabled: readBoolean("PLATFORM_VERIFICATION_ENABLED", env === "local"),
      grafanaUrl:
        process.env["PLATFORM_VERIFICATION_GRAFANA_URL"]?.trim() ||
        (env === "local" ? "http://127.0.0.1:53902" : undefined),
    },
    publication: {
      apiEnabled: publicationApiEnabled,
      compileEnabled: publicationCompileEnabled,
      dispatchEnabled: publicationDispatchEnabled,
      applyEnabled: publicationApplyEnabled,
      recoveryEnabled: publicationRecoveryEnabled,
      targetPlanes: publicationTargetPlanes,
      requireSignature: true,
      signingKeyId: publicationSigningKeyId || undefined,
      privateKeyReference: publicationPrivateKeyReference || undefined,
      publicKeyReference: publicationPublicKeyReference || undefined,
      runtimeVersion: publicationRuntimeVersion,
      recoveryIntervalMs: publicationRecoveryIntervalMs,
    },
    infisical: {
      endpoint: infisicalEndpoint || undefined,
      token: infisicalToken || undefined,
      workspaceId: infisicalWorkspaceId || undefined,
      environment: process.env["INFISICAL_ENVIRONMENT"]?.trim() || env,
      secretPath:
        process.env["INFISICAL_SECRET_PATH"]?.trim() || "/publication",
    },
    wave0: {
      financeRoutesEnabled: readBoolean("WAVE0_FINANCE_ROUTES_ENABLED", false),
      financeF2Enabled: readBoolean("FINANCE_F2_ENABLED", false),
      financeF3Enabled: readBoolean("FINANCE_F3_ENABLED", false),
      financeF4Enabled: readBoolean("FINANCE_F4_ENABLED", false),
      financeF5Enabled: readBoolean("FINANCE_F5_ENABLED", false),
      financeF6Enabled: readBoolean("FINANCE_F6_ENABLED", false),
      governanceRoutesEnabled: readBoolean(
        "WAVE0_GOVERNANCE_ROUTES_ENABLED",
        false,
      ),
      controlAdminTenantOverridesEnabled: readBoolean(
        "WAVE0_CONTROL_ADMIN_TENANT_OVERRIDES_ENABLED",
        false,
      ),
      controlAdminLookupRoundingEnabled: readBoolean(
        "WAVE0_CONTROL_ADMIN_LOOKUP_ROUNDING_ENABLED",
        false,
      ),
      controlAdminConnectorLifecycleEnabled: readBoolean(
        "WAVE0_CONTROL_ADMIN_CONNECTOR_LIFECYCLE_ENABLED",
        false,
      ),
      controlAdminCycleConfigEnabled: readBoolean(
        "WAVE0_CONTROL_ADMIN_CYCLE_CONFIG_ENABLED",
        false,
      ),
      controlAdminLocalCatalogReadsEnabled: readBoolean(
        "WAVE0_CONTROL_ADMIN_LOCAL_CATALOG_READS_ENABLED",
        false,
      ),
      controlAdminCatalogAuthoringEnabled: readBoolean(
        "WAVE0_CONTROL_ADMIN_CATALOG_AUTHORING_ENABLED",
        false,
      ),
      controlAdminRuntimeCommandsEnabled: readBoolean(
        "WAVE0_CONTROL_ADMIN_RUNTIME_COMMANDS_ENABLED",
        false,
      ),
      recordSnapshotRoutesEnabled: readBoolean(
        "WAVE0_RECORD_SNAPSHOT_ROUTES_ENABLED",
        false,
      ),
      recordTransferPublicApiEnabled: readBoolean(
        "RECORD_TRANSFER_PUBLIC_API_ENABLED",
        false,
      ),
      businessPartnerDeliveryEnabled: readBoolean(
        "BUSINESS_PARTNER_MESH_DELIVERY_ENABLED",
        false,
      ),
      businessPartnerReconciliationEnabled: readBoolean(
        "BUSINESS_PARTNER_MESH_RECONCILIATION_ENABLED",
        false,
      ),
      authorizationManagementRoutesEnabled: readBoolean(
        "AUTHORIZATION_MANAGEMENT_ROUTES_ENABLED",
        false,
      ),
      authorizationManagementMutationsEnabled: readBoolean(
        "AUTHORIZATION_MANAGEMENT_MUTATIONS_ENABLED",
        false,
      ),
      authorizationManagementMode: readChoice(
        "AUTHORIZATION_V2_MODE",
        "legacy",
        ["legacy", "shadow", "enforce"] as const,
      ),
      authorizationGoldenEvaluatorCorpusQualified: readBoolean(
        "AUTHORIZATION_GOLDEN_EVALUATOR_CORPUS_QUALIFIED",
        false,
      ),
      authorizationDdlEpochIntegrationQualified: readBoolean(
        "AUTHORIZATION_DDL_EPOCH_INTEGRATION_QUALIFIED",
        false,
      ),
      authorizationWriterSwitchQualified: readBoolean(
        "AUTHORIZATION_WRITER_SWITCH_QUALIFIED",
        false,
      ),
    },
    atlas: {
      enabled: readBoolean("ATLAS_AGENT_ENABLED", false),
      toolsEnabled: readBoolean("ATLAS_AGENT_TOOLS_ENABLED", false),
      persistenceEnabled: readBoolean(
        "ATLAS_CONVERSATION_PERSISTENCE_ENABLED",
        false,
      ),
    },
  };
  assertAuthorizationManagementHostQualification(config.wave0);
  return config;
}

/** Refuse process startup instead of silently entering an unqualified enforce mode. */
export function assertAuthorizationManagementHostQualification(
  config: Pick<
    HostConfig["wave0"],
    | "authorizationManagementMode"
    | "authorizationGoldenEvaluatorCorpusQualified"
    | "authorizationDdlEpochIntegrationQualified"
    | "authorizationWriterSwitchQualified"
  >,
): void {
  if (
    config.authorizationManagementMode === "enforce" &&
    (!config.authorizationGoldenEvaluatorCorpusQualified ||
      !config.authorizationDdlEpochIntegrationQualified ||
      !config.authorizationWriterSwitchQualified)
  ) {
    throw new Error("AUTHORIZATION_V2_ENFORCE_NOT_QUALIFIED");
  }
}

function readPublicationPlanes(
  value: string | undefined,
): readonly ("studio" | "neon" | "mesh")[] {
  if (!value?.trim()) return [];
  const planes = [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  for (const plane of planes) {
    if (plane !== "studio" && plane !== "neon" && plane !== "mesh")
      throw new Error(
        `PUBLICATION_TARGET_PLANES contains invalid plane: ${plane}`,
      );
  }
  return planes as ("studio" | "neon" | "mesh")[];
}

/** Studio is canonical; the legacy names are accepted only at environment ingress for one release. */
function readStudioEnvironment(
  suffix: "DATABASE_URL" | "WORKER_DATABASE_URL",
): string | undefined {
  return (
    process.env[`STUDIO_${suffix}`]?.trim() ??
    process.env[`ATHYPER_PLATFORM_${suffix}`]?.trim()
  );
}

function readPositiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      `${name} must be a positive integer, got: ${process.env[name]}`,
    );
  }
  return value;
}

function readNonNegativeInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `${name} must be a non-negative integer, got: ${process.env[name]}`,
    );
  }
  return value;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`${name} must be true or false, got: ${process.env[name]}`);
}

function readChoice<const Values extends readonly string[]>(
  name: string,
  fallback: Values[number],
  values: Values,
): Values[number] {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  if (values.includes(raw)) return raw as Values[number];
  throw new Error(`${name} must be one of ${values.join(", ")}, got: ${raw}`);
}

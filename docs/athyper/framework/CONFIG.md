# Runtime Configuration Reference

Operator-facing reference for `kernel.config.*.parameter.json` files.

**Source of truth:** `framework/runtime/src/kernel/config.schema.ts` (Zod schema)
**JSON Schema:** `mesh/config/apps/athyper/kernel.config.schema.json`

## Config Loading Cascade

Configuration is resolved in this order (later wins):

1. **File** — JSON parameter file at `$ATHYPER_KERNEL_CONFIG_PATH` (relative to `$MESH_CONFIG` or `cwd`)
2. **Environment variables** — standard env vars (e.g., `DATABASE_URL`, `REDIS_URL`)
3. **Code overrides** — `LoadConfigOptions.overrides` (test/development use)
4. **SUPERSTAR env** — `ATHYPER_SUPER__*` env vars (highest precedence, always wins)

### LOCKED Keys

Certain keys are **stripped from the JSON config file** at load time. These are infrastructure wiring and secrets that must be set via environment variables or SUPERSTAR env. Attempting to set them in the JSON file has no effect.

### SUPERSTAR Env Variables

Pattern: `ATHYPER_SUPER__<KEY_PATH>` (double underscore prefix)

Examples:
- `ATHYPER_SUPER__DATABASE_URL` → `db.url`
- `ATHYPER_SUPER__DATABASE_ADMIN_URL` → `db.adminUrl`
- `ATHYPER_SUPER__REDIS_URL` → `redis.url`
- `ATHYPER_SUPER__S3_SECRET_KEY` → `s3.secretKey`
- `ATHYPER_SUPER__IAM_SECRET__<REF>` → realm client secrets (resolved via `clientSecretRef`)

## Configuration Sections

### Core Settings

| Key | Type | Default | LOCKED | Description |
|-----|------|---------|--------|-------------|
| `env` | `"local" \| "staging" \| "production"` | `"local"` | No | Environment identifier |
| `mode` | `"api" \| "worker" \| "scheduler"` | `"api"` | No | Runtime mode |
| `serviceName` | string | `"athyper-runtime"` | No | Service name for telemetry and logging |
| `port` | integer | `3000` | No | HTTP listen port |
| `logLevel` | `"fatal" \| "error" \| "warn" \| "info" \| "debug" \| "trace"` | `"info"` | No | Minimum log level |
| `shutdownTimeoutMs` | integer | `15000` | No | Graceful shutdown timeout (ms) |
| `publicBaseUrl` | string (URL) | — | No | Public URL for the Runtime API |

### Database (`db`)

| Key | Type | Default | LOCKED | Description |
|-----|------|---------|--------|-------------|
| `db.url` | string | — | **Yes** | PostgreSQL connection URL via PgBouncer. Set via `DATABASE_URL` |
| `db.adminUrl` | string | — | **Yes** | Direct PostgreSQL URL for migrations. Set via `DATABASE_ADMIN_URL` |
| `db.poolMax` | integer | `10` | No | Maximum connection pool size |

### IAM (`iam`)

| Key | Type | Default | LOCKED | Description |
|-----|------|---------|--------|-------------|
| `iam.strategy` | `"single_realm" \| "multi_realm"` | `"single_realm"` | **Yes** | Realm routing strategy |
| `iam.defaultRealmKey` | string | `"main"` | **Yes** | Default realm key |
| `iam.defaultTenantKey` | string | — | **Yes** | Default tenant key for jobs/scheduler |
| `iam.defaultOrgKey` | string | — | **Yes** | Default org key for jobs/scheduler |
| `iam.requireTenantClaimsInProd` | boolean | `true` | No | Require tenant claims in JWT for prod |
| `iam.realms` | object | `{}` | No | Map of realm keys to realm configurations |

Each realm has: `iam.issuerUrl`, `iam.clientId`, `iam.clientSecretRef` (resolved via `ATHYPER_SUPER__IAM_SECRET__<ref>`), `featureFlags`, `platformMinimums`, `tenants`.

### Redis (`redis`)

| Key | Type | Default | LOCKED | Description |
|-----|------|---------|--------|-------------|
| `redis.url` | string | — | **Yes** | Redis connection URL. Set via `REDIS_URL` |

### S3/MinIO (`s3`)

All S3 fields are **LOCKED** — set via `S3_*` or `ATHYPER_SUPER__S3_*` env vars.

| Key | Type | Default | LOCKED | Description |
|-----|------|---------|--------|-------------|
| `s3.endpoint` | string | — | **Yes** | S3/MinIO endpoint URL |
| `s3.accessKey` | string | — | **Yes** | S3 access key |
| `s3.secretKey` | string | — | **Yes** | S3 secret key |
| `s3.region` | string | `"us-east-1"` | **Yes** | S3 region |
| `s3.bucket` | string | `"athyper"` | **Yes** | S3 bucket name |
| `s3.useSSL` | boolean | `false` | **Yes** | Use SSL/TLS for S3 |

### Telemetry (`telemetry`)

| Key | Type | Default | LOCKED | Description |
|-----|------|---------|--------|-------------|
| `telemetry.otlpEndpoint` | string | — | **Yes** | OpenTelemetry collector endpoint |
| `telemetry.enabled` | boolean | `true` | **Yes** | Enable telemetry export |

### Job Queue (`jobQueue`)

| Key | Type | Default | LOCKED | Description |
|-----|------|---------|--------|-------------|
| `jobQueue.queueName` | string | `"athyper-jobs"` | No | BullMQ queue name |
| `jobQueue.defaultRetries` | integer | `3` | No | Default retry attempts for failed jobs |

### Document Services (`document`)

| Key | Type | Default | LOCKED | Description |
|-----|------|---------|--------|-------------|
| `document.enabled` | boolean | `false` | No | Enable document rendering services |
| `document.rendering.engine` | `"puppeteer" \| "playwright"` | `"puppeteer"` | No | PDF rendering engine (only puppeteer currently) |
| `document.rendering.chromiumPath` | string | — | No | Path to Chromium binary |
| `document.rendering.concurrency` | integer (1-10) | `3` | No | Max concurrent PDF rendering pages |
| `document.rendering.timeoutMs` | integer | `30000` | No | PDF render timeout (ms) |
| `document.rendering.maxRetries` | integer | `3` | No | Max retry attempts for failed renders |
| `document.rendering.paperFormat` | `"A4" \| "LETTER" \| "LEGAL"` | `"A4"` | No | Default paper format |
| `document.rendering.trustedDomains` | string[] | `[]` | No | Trusted domains for network requests |
| `document.rendering.allowedHosts` | string[] | `[]` | No | Allowed hosts for URL-fetching |
| `document.rendering.composeTimeoutMs` | integer | `5000` | No | HTML composition timeout (ms) |
| `document.rendering.uploadTimeoutMs` | integer | `30000` | No | Output upload timeout (ms) |
| `document.storage.pathPrefix` | string | `"documents"` | No | S3 path prefix for outputs |
| `document.storage.presignedUrlExpirySeconds` | integer | `3600` | No | Presigned URL expiry (seconds) |
| `document.storage.downloadMode` | `"stream" \| "presigned"` | `"stream"` | No | Download via proxy or S3 redirect |
| `document.jobs.leaseSeconds` | integer | `300` | No | BullMQ lock duration for render jobs |
| `document.jobs.heartbeatSeconds` | integer | `30` | No | BullMQ lock renewal interval |
| `document.retention.defaultDays` | integer | `2555` | No | Default retention period (days) |
| `document.retention.archiveAfterDays` | integer | `365` | No | Days before outputs are archived |

### Audit Governance (`audit`)

| Key | Type | Default | LOCKED | Description |
|-----|------|---------|--------|-------------|
| `audit.writeMode` | `"off" \| "sync" \| "outbox"` | `"outbox"` | No | Audit write mode |
| `audit.hashChainEnabled` | boolean | `true` | No | SHA-256 hash chain tamper evidence |
| `audit.timelineEnabled` | boolean | `true` | No | Unified activity timeline service |
| `audit.retentionDays` | integer | `90` | No | Audit log retention (days) |
| `audit.partitionPreCreateMonths` | integer (1-12) | `3` | No | Months to pre-create partitions ahead |
| `audit.encryptionEnabled` | boolean | `false` | No | Column-level encryption for sensitive fields |
| `audit.loadSheddingEnabled` | boolean | `false` | No | Load shedding policy evaluation |
| `audit.tieringEnabled` | boolean | `false` | No | Storage tiering (hot/warm/cold) |
| `audit.warmAfterDays` | integer | `90` | No | Days before hot→warm transition |
| `audit.coldAfterDays` | integer | `365` | No | Days before warm→cold transition |

### Notification Framework (`notification`)

| Key | Type | Default | LOCKED | Description |
|-----|------|---------|--------|-------------|
| `notification.enabled` | boolean | `true` | No | Enable notification services |
| `notification.providers.email.sendgrid.apiKeyRef` | string | — | **Yes** | SUPERSTAR secret ref for SendGrid API key |
| `notification.providers.email.sendgrid.fromAddress` | string | — | No | Default sender email address |
| `notification.providers.email.sendgrid.fromName` | string | — | No | Default sender display name |
| `notification.providers.email.sendgrid.enabled` | boolean | `false` | No | Enable SendGrid provider |
| `notification.providers.teams.powerAutomate.webhookUrl` | string | — | **Yes** | Power Automate webhook URL |
| `notification.providers.teams.powerAutomate.enabled` | boolean | `false` | No | Enable Teams via Power Automate |
| `notification.providers.whatsapp.phoneNumberId` | string | — | No | WhatsApp phone number ID |
| `notification.providers.whatsapp.accessTokenRef` | string | — | **Yes** | SUPERSTAR secret ref for access token |
| `notification.providers.whatsapp.businessAccountId` | string | — | No | WhatsApp Business Account ID |
| `notification.providers.whatsapp.webhookVerifyToken` | string | — | **Yes** | Webhook verification token |
| `notification.providers.whatsapp.enabled` | boolean | `false` | No | Enable WhatsApp provider |
| `notification.delivery.maxRetries` | integer | `3` | No | Max delivery retry attempts |
| `notification.delivery.retryBackoffMs` | integer | `2000` | No | Retry backoff delay (ms) |
| `notification.delivery.dedupWindowMs` | integer | `300000` | No | Dedup window (ms) |
| `notification.delivery.defaultPriority` | `"low" \| "normal" \| "high" \| "critical"` | `"normal"` | No | Default priority |
| `notification.delivery.defaultLocale` | string | `"en"` | No | Default locale |
| `notification.delivery.workerConcurrency` | integer | `5` | No | Concurrent delivery workers |
| `notification.digest.hourlyAt` | integer (0-59) | `0` | No | Minute for hourly digest |
| `notification.digest.dailyAtHourUtc` | integer (0-23) | `8` | No | Hour (UTC) for daily digest |
| `notification.digest.weeklyDay` | integer (0-6) | `1` | No | Day for weekly digest |
| `notification.digest.maxItemsPerDigest` | integer | `50` | No | Max items per digest |
| `notification.retention.messageDays` | integer | `90` | No | Message retention (days) |
| `notification.retention.deliveryDays` | integer | `30` | No | Delivery record retention (days) |

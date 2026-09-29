import type {
  KeycloakAuthAdapter,
  KeycloakAuthAdapterConfig,
} from "@athyper/server-adapter-auth-keycloak";
import type {
  RedisCacheAdapter,
  RedisCacheAdapterConfig,
  RedisNotificationEventBus,
} from "@athyper/server-adapter-cache-redis";
import type {
  EmailAdapterConfig,
  SesEmailAdapterConfig,
  SesEventMessageHandler,
  SesEventSqsAdapter,
  SesEventSqsAdapterConfig,
  FcmPushAdapterConfig,
  MetaWhatsAppAdapterConfig,
  SmsAdapterConfig,
  WebPushAdapterConfig,
} from "@athyper/server-adapter-communications";
import type {
  NotificationChannelHandler,
  PushTransport,
} from "@athyper/server-contract-notifications";
import type {
  AthyperDatabaseAdapter,
  AthyperDatabaseAdapterConfig,
} from "@athyper/server-adapter-db-athyper";
import type {
  MeshDatabaseAdapter,
  MeshDatabaseAdapterConfig,
} from "@athyper/server-adapter-db-mesh";
import type {
  NeonDatabaseAdapter,
  NeonDatabaseAdapterConfig,
} from "@athyper/server-adapter-db-neon";
import type {
  S3ObjectStorageAdapter,
  S3ObjectStorageAdapterConfig,
} from "@athyper/server-adapter-object-storage-s3";
import type {
  ClamAvMalwareScanner,
  ClamAvMalwareScannerConfig,
} from "@athyper/server-adapter-malware-clamav";
import type {
  TikaContentExtractor,
  TikaContentExtractorConfig,
} from "@athyper/server-adapter-document-parser-tika";
import type {
  MeilisearchIndex,
  MeilisearchIndexConfig,
} from "@athyper/server-adapter-search-meilisearch";
import type { GotenbergRendererConfig } from "@athyper/server-adapter-rendering";
import type { PdfRenderer } from "@athyper/server-contract-rendering";
import type { PreviewRendererConfig } from "@athyper/server-adapter-preview-renderer";
import type { DerivativeRenderer } from "@athyper/server-contract-derivatives";
import type {
  OpenTelemetryAdapter,
  OpenTelemetryAdapterConfig,
} from "@athyper/server-adapter-telemetry-otel";
import type { InfisicalSecretStoreConfig } from "@athyper/server-adapter-secretstore-infisical";
import type { SecretStore } from "@athyper/server-contract-secrets";

export interface AdapterRegistrationDependencies {
  createKeycloakAuth(config: KeycloakAuthAdapterConfig): KeycloakAuthAdapter;
  createRedisCache(config: RedisCacheAdapterConfig): RedisCacheAdapter;
  createNotificationEvents(
    client: RedisCacheAdapter["client"],
  ): RedisNotificationEventBus;
  createNeonDatabase(config: NeonDatabaseAdapterConfig): NeonDatabaseAdapter;
  createAthyperDatabase(
    config: AthyperDatabaseAdapterConfig,
  ): AthyperDatabaseAdapter;
  createMeshDatabase(config: MeshDatabaseAdapterConfig): MeshDatabaseAdapter;
  createObjectStorage(
    config: S3ObjectStorageAdapterConfig,
  ): S3ObjectStorageAdapter;
  createMalwareScanner(
    config: ClamAvMalwareScannerConfig,
  ): ClamAvMalwareScanner;
  createContentExtractor(
    config: TikaContentExtractorConfig,
  ): TikaContentExtractor;
  createSearchIndex(config: MeilisearchIndexConfig): MeilisearchIndex;
  createOpenTelemetry(config: OpenTelemetryAdapterConfig): OpenTelemetryAdapter;
  createEmail(config: EmailAdapterConfig): NotificationChannelHandler;
  createSesEmail(config: SesEmailAdapterConfig): NotificationChannelHandler;
  createSesEventSource(
    config: SesEventSqsAdapterConfig,
    handler: SesEventMessageHandler,
  ): SesEventSqsAdapter;
  createSms(config: SmsAdapterConfig): NotificationChannelHandler;
  createMetaWhatsApp(
    config: MetaWhatsAppAdapterConfig,
  ): NotificationChannelHandler;
  createFcmPush(config: FcmPushAdapterConfig): PushTransport;
  createWebPush(config: WebPushAdapterConfig): PushTransport;
  createPdfRenderer(config: GotenbergRendererConfig): PdfRenderer;
  createPreviewRenderer(config: PreviewRendererConfig): DerivativeRenderer;
  createSecretStore?(config: InfisicalSecretStoreConfig): SecretStore;
}

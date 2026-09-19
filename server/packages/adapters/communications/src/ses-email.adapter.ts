import {
  GetAccountCommand,
  SendEmailCommand,
  SESv2Client,
  type GetAccountCommandOutput,
  type SendEmailCommandInput,
  type SendEmailCommandOutput,
} from "@aws-sdk/client-sesv2";
import type {
  NotificationChannelHandler,
  NotificationDeliveryRequest,
  NotificationTransportAttachment,
} from "@athyper/server-contract-notifications";
import type { Logger } from "@athyper/server-foundation/observability";
import { isTransientError } from "@athyper/server-foundation/resilience";

import { CommunicationDeliveryError } from "./communication-delivery.error.js";

type SesCommand = SendEmailCommand | GetAccountCommand;
type SesOutput = SendEmailCommandOutput | GetAccountCommandOutput;

export interface SesV2EmailClient {
  send(command: SesCommand): Promise<SesOutput>;
  destroy?(): void;
}

export interface SesEmailAdapterConfig {
  readonly region: string;
  /** A verified SES identity. Request-level sender overrides are intentionally forbidden. */
  readonly fromAddress: string;
  readonly replyToAddress?: string;
  readonly configurationSetName: string;
  readonly environment: string;
  /** Maps an Athyper tenant id to its provisioned SES tenant name. */
  readonly resolveTenantName: (tenantId: string) => string | Promise<string>;
  readonly logger?: Pick<Logger, "warn">;
}

export interface SesEmailAdapterDependencies {
  createClient(config: { readonly region: string }): SesV2EmailClient;
}

const DEFAULT_DEPENDENCIES: SesEmailAdapterDependencies = {
  createClient: ({ region }) => new SESv2Client({ region }) as SesV2EmailClient,
};

/** Amazon SES API v2 email transport. SMTP remains available through createEmailAdapter. */
export function createSesEmailAdapter(
  config: SesEmailAdapterConfig,
  dependencies: SesEmailAdapterDependencies = DEFAULT_DEPENDENCIES,
): NotificationChannelHandler {
  const region = required(config.region, "SES region");
  const fromAddress = required(config.fromAddress, "SES from address");
  const configurationSetName = required(
    config.configurationSetName,
    "SES configuration set name",
  );
  const environment = tagValue(config.environment, "SES environment tag");
  const replyToAddress = optional(config.replyToAddress);

  let client: SesV2EmailClient | undefined;
  let closed = false;
  const getClient = (): SesV2EmailClient => {
    if (closed) throw new Error("SES email adapter is closed");
    client ??= dependencies.createClient({ region });
    return client;
  };

  return {
    channel: "email",
    async send(request) {
      assertEmail(request);
      if (request.senderOverride?.trim()) {
        throw permanent(
          "SES sender overrides are forbidden; use a provisioned verified identity",
        );
      }

      const recipient = requestValue(request.recipientAddress, "Email recipient");
      const tenantId = requestValue(request.tenantId ?? "", "Athyper tenant id");
      const deliveryId = requestValue(request.deliveryId ?? "", "Athyper delivery id");
      const tenantName = sesTenantName(await config.resolveTenantName(tenantId));
      const html = rendered(request, "renderedHtml", "rendered_html");
      const renderedText = rendered(request, "renderedText", "rendered_text");
      if (!html && !renderedText) {
        config.logger?.warn("communications.ses_email.missing_rendered_body", {
          templateKey: request.templateKey,
          planeKey: request.planeKey,
        });
      }

      const text = appendAttachmentLinks(
        renderedText ?? JSON.stringify(request.payload, null, 2),
        request.attachments,
      );
      const input: SendEmailCommandInput = {
        FromEmailAddress: fromAddress,
        Destination: { ToAddresses: [recipient] },
        ...(replyToAddress ? { ReplyToAddresses: [replyToAddress] } : {}),
        Content: {
          Simple: {
            Subject: { Data: request.subject ?? "(no subject)", Charset: "UTF-8" },
            Body: {
              Text: { Data: text, Charset: "UTF-8" },
              ...(html ? { Html: { Data: html, Charset: "UTF-8" } } : {}),
            },
            ...embeddedAttachments(request.attachments),
          },
        },
        ConfigurationSetName: configurationSetName,
        TenantName: tenantName,
        EmailTags: [
          { Name: "athyper-environment", Value: environment },
          { Name: "athyper-delivery", Value: requestTagValue(deliveryId, "Athyper delivery tag") },
          { Name: "athyper-tenant", Value: requestTagValue(tenantId, "Athyper tenant tag") },
          { Name: "athyper-plane", Value: requestTagValue(request.planeKey, "Athyper plane tag") },
          {
            Name: "athyper-category",
            Value: normalizedTagValue(request.templateKey, "notification"),
          },
        ],
      };

      try {
        const response = await getClient().send(new SendEmailCommand(input)) as SendEmailCommandOutput;
        const messageId = response.MessageId?.trim();
        if (!messageId) {
          // Acceptance may have occurred. Retrying without the authoritative id can duplicate mail.
          throw permanent("Amazon SES did not return an authoritative MessageId");
        }
        return { externalId: messageId, confirmation: "provider_accepted" };
      } catch (error) {
        if (error instanceof CommunicationDeliveryError) throw error;
        const normalized = toError(error);
        throw new CommunicationDeliveryError("Amazon SES email delivery failed", {
          channel: "email",
          retryable: isRetryableSesError(normalized),
          statusCode: statusCode(error),
          cause: error,
        });
      }
    },
    async health() {
      const startedAt = Date.now();
      try {
        await getClient().send(new GetAccountCommand({}));
        return { status: "healthy", latencyMs: Date.now() - startedAt };
      } catch {
        return {
          status: "unhealthy",
          message: "Amazon SES account verification failed",
          latencyMs: Date.now() - startedAt,
        };
      }
    },
    close() {
      if (closed) return;
      closed = true;
      client?.destroy?.();
    },
  };
}

function embeddedAttachments(
  attachments?: readonly NotificationTransportAttachment[],
): { Attachments: NonNullable<NonNullable<SendEmailCommandInput["Content"]>["Simple"]>["Attachments"] } | Record<string, never> {
  const embedded = attachments
    ?.filter((attachment) => attachment.disposition === "embed")
    .map((attachment) => {
      if (!attachment.content) {
        throw permanent(`Embedded attachment ${attachment.attachmentId} has no governed content`);
      }
      if (attachment.content.byteLength !== attachment.sizeBytes) {
        throw permanent(`Embedded attachment ${attachment.attachmentId} size does not match governed metadata`);
      }
      return {
        RawContent: attachment.content,
        FileName: required(attachment.filename, "Attachment filename"),
        ContentType: required(attachment.contentType, "Attachment content type"),
        ContentDisposition: "ATTACHMENT" as const,
      };
    });
  return embedded?.length ? { Attachments: embedded } : {};
}

function appendAttachmentLinks(
  text: string,
  attachments?: readonly NotificationTransportAttachment[],
): string {
  const links = attachments
    ?.filter((attachment) => attachment.disposition === "link" && attachment.downloadUrl)
    .map((attachment) => `${attachment.filename}: ${attachment.downloadUrl}`) ?? [];
  return links.length ? `${text}\n\nAttachments:\n${links.join("\n")}` : text;
}

function rendered(
  request: NotificationDeliveryRequest,
  canonicalKey: string,
  legacyKey: string,
): string | undefined {
  const value = request.payload[canonicalKey] ?? request.payload[legacyKey];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function assertEmail(request: NotificationDeliveryRequest): void {
  if (request.channel !== "email") {
    throw new Error(`email adapter cannot deliver channel ${request.channel}`);
  }
}

function required(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function optional(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function requestValue(value: string, name: string): string {
  try {
    return required(value, name);
  } catch {
    throw permanent(`${name} is required`);
  }
}

function sesTenantName(value: string): string {
  const normalized = requestValue(value, "SES tenant name");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(normalized)) {
    throw permanent("SES tenant name is not a provisioned SES-compatible name");
  }
  return normalized;
}

function requestTagValue(value: string, name: string): string {
  try {
    return tagValue(value, name);
  } catch {
    throw permanent(`${name} is invalid`);
  }
}

function tagValue(value: string, name: string): string {
  const normalized = required(value, name);
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(normalized)) {
    throw new Error(`${name} must contain only letters, numbers, underscores, and hyphens`);
  }
  return normalized;
}

function normalizedTagValue(value: string, fallback: string): string {
  const normalized = value.trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return (normalized || fallback).slice(0, 256);
}

function permanent(message: string): CommunicationDeliveryError {
  return new CommunicationDeliveryError(message, { channel: "email", retryable: false });
}

function isRetryableSesError(error: Error): boolean {
  const name = error.name;
  if (["TooManyRequestsException", "ThrottlingException", "LimitExceededException", "ServiceUnavailableException"].includes(name)) return true;
  if (["BadRequestException", "MessageRejected", "MailFromDomainNotVerifiedException", "NotFoundException"].includes(name)) return false;
  const code = statusCode(error);
  if (code === 429 || (code !== undefined && code >= 500)) return true;
  if (code !== undefined && code >= 400) return false;
  return isTransientError(error);
}

function statusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const metadata = Reflect.get(error, "$metadata");
  if (!metadata || typeof metadata !== "object") return undefined;
  const code = Reflect.get(metadata, "httpStatusCode");
  return typeof code === "number" ? code : undefined;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

import nodemailer from "nodemailer";
import type {
  NotificationChannelHandler,
  NotificationDeliveryRequest,
} from "@athyper/server-contract-notifications";
import type { Logger } from "@athyper/server-foundation/observability";
import { isTransientError } from "@athyper/server-foundation/resilience";

import { CommunicationDeliveryError } from "./communication-delivery.error.js";

export interface EmailAdapterConfig {
  readonly host: string;
  readonly port?: number;
  readonly secure?: boolean;
  readonly user?: string;
  readonly password?: string;
  readonly fromAddress: string;
  readonly logger?: Pick<Logger, "warn">;
}

export interface EmailTransport {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
    attachments?: readonly { filename: string; content: Buffer; contentType: string }[];
  }): Promise<{ messageId?: string }>;
  verify(): Promise<unknown>;
  close?(): void;
}

export interface EmailAdapterDependencies {
  createTransport(config: {
    host: string;
    port: number;
    secure: boolean;
    auth?: { user: string; pass: string };
  }): EmailTransport;
}

const DEFAULT_DEPENDENCIES: EmailAdapterDependencies = {
  createTransport: (config) => nodemailer.createTransport(config) as unknown as EmailTransport,
};

export function createEmailAdapter(
  config: EmailAdapterConfig,
  dependencies: EmailAdapterDependencies = DEFAULT_DEPENDENCIES,
): NotificationChannelHandler {
  const host = requireValue(config.host, "SMTP host");
  const fromAddress = requireValue(config.fromAddress, "SMTP from address");
  const port = config.port ?? 587;
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error("SMTP port must be an integer between 1 and 65535");
  }
  if (Boolean(config.user) !== Boolean(config.password)) {
    throw new Error("SMTP user and password must be configured together");
  }

  let transport: EmailTransport | undefined;
  let closed = false;
  const getTransport = (): EmailTransport => {
    if (closed) throw new Error("Email adapter is closed");
    transport ??= dependencies.createTransport({
      host,
      port,
      secure: config.secure ?? false,
      ...(config.user && config.password
        ? { auth: { user: config.user, pass: config.password } }
        : {}),
    });
    return transport;
  };

  return {
    channel: "email",
    async send(request) {
      assertChannel(request, "email");
      const recipient = requireValue(request.recipientAddress, "Email recipient");
      const html = readString(request.payload, "renderedHtml", "rendered_html");
      const renderedText = readString(
        request.payload,
        "renderedText",
        "rendered_text",
      );
      if (!html && !renderedText) {
        config.logger?.warn("communications.email.missing_rendered_body", {
          templateKey: request.templateKey,
          planeKey: request.planeKey,
        });
      }
      const baseText = renderedText ?? JSON.stringify(request.payload, null, 2);
      const links = request.attachments
        ?.filter((attachment) => attachment.disposition === "link" && attachment.downloadUrl)
        .map((attachment) => `${attachment.filename}: ${attachment.downloadUrl}`) ?? [];
      const text = links.length ? `${baseText}\n\nAttachments:\n${links.join("\n")}` : baseText;
      const attachments = request.attachments
        ?.filter((attachment) => attachment.disposition === "embed" && attachment.content)
        .map((attachment) => ({
          filename: attachment.filename,
          content: Buffer.from(attachment.content!),
          contentType: attachment.contentType,
        }));

      try {
        const result = await getTransport().sendMail({
          from: request.senderOverride?.trim() || fromAddress,
          to: recipient,
          subject: request.subject ?? "(no subject)",
          text,
          ...(html ? { html } : {}),
          ...(attachments?.length ? { attachments } : {}),
        });
        return result.messageId ? { externalId: result.messageId } : {};
      } catch (error) {
        const normalized = toError(error);
        throw new CommunicationDeliveryError("SMTP email delivery failed", {
          channel: "email",
          retryable: isTransientError(normalized),
          cause: error,
        });
      }
    },
    async health() {
      const startedAt = Date.now();
      try {
        await getTransport().verify();
        return { status: "healthy", latencyMs: Date.now() - startedAt };
      } catch {
        return {
          status: "unhealthy",
          message: "SMTP verification failed",
          latencyMs: Date.now() - startedAt,
        };
      }
    },
    close() {
      if (closed) return;
      closed = true;
      transport?.close?.();
    },
  };
}

function readString(
  payload: Readonly<Record<string, unknown>>,
  canonicalKey: string,
  legacyKey: string,
): string | undefined {
  const value = payload[canonicalKey] ?? payload[legacyKey];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function assertChannel(
  request: NotificationDeliveryRequest,
  expected: "email" | "sms",
): void {
  if (request.channel !== expected) {
    throw new Error(`${expected} adapter cannot deliver channel ${request.channel}`);
  }
}

function requireValue(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

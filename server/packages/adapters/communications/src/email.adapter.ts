/**
 * Email Channel Adapter
 *
 * Sends notification messages via SMTP using nodemailer.
 * Registered in app.ts under channel key "email".
 *
 * Config (from kernel config.email.*):
 *   host, port, secure, user, pass, from_address
 *
 * The handler receives the pre-rendered subject and payload from the
 * notification worker. body_html and body_text are resolved from the
 * payload.rendered_html / payload.rendered_text fields if present;
 * otherwise the raw payload is JSON-stringified as a plain text fallback.
 */

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type { NotificationChannelHandler } from "@athyper/platform-notifications";

export interface EmailAdapterConfig {
  host:         string;
  port:         number;
  secure:       boolean;
  user?:        string;
  pass?:        string;
  from_address: string;
  logger?:      { warn(event: string, fields?: Record<string, unknown>): void };
}

export function createEmailAdapter(config: EmailAdapterConfig): NotificationChannelHandler {
  if (!config.from_address?.trim()) {
    throw new Error("EmailAdapter: from_address is required in config");
  }

  let _transporter: Transporter | null = null;

  function transporter(): Transporter {
    if (!_transporter) {
      _transporter = nodemailer.createTransport({
        host:   config.host,
        port:   config.port,
        secure: config.secure,
        ...(config.user && config.pass
          ? { auth: { user: config.user, pass: config.pass } }
          : {}),
      });
    }
    return _transporter;
  }

  return {
    async send(opts) {
      const { recipientAddr, subject, payload, fromOverride } = opts;

      const htmlBody = typeof payload["rendered_html"] === "string"
        ? payload["rendered_html"]
        : undefined;

      const hasRenderedText = typeof payload["rendered_text"] === "string";
      if (!htmlBody && !hasRenderedText) {
        config.logger?.warn("email_no_rendered_body", {
          templateKey: opts.templateKey,
          recipient:   recipientAddr,
        });
      }

      const textBody = hasRenderedText
        ? (payload["rendered_text"] as string)
        : JSON.stringify(payload, null, 2);

      const info = await transporter().sendMail({
        from:    fromOverride ?? config.from_address,
        to:      recipientAddr,
        subject: subject ?? "(no subject)",
        text:    textBody,
        ...(htmlBody ? { html: htmlBody } : {}),
      });

      return { externalId: info.messageId ?? undefined };
    },

    async healthCheck() {
      try {
        await transporter().verify();
        return "healthy";
      } catch {
        return "down";
      }
    },
  };
}

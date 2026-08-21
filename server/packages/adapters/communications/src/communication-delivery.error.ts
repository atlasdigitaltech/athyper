import type { NotificationChannel } from "@athyper/server-contract-notifications";

export interface CommunicationDeliveryErrorOptions {
  readonly channel: NotificationChannel;
  readonly retryable: boolean;
  readonly statusCode?: number;
  readonly cause?: unknown;
}

export class CommunicationDeliveryError extends Error {
  readonly channel: NotificationChannel;
  readonly retryable: boolean;
  readonly statusCode: number | undefined;

  constructor(message: string, options: CommunicationDeliveryErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "CommunicationDeliveryError";
    this.channel = options.channel;
    this.retryable = options.retryable;
    this.statusCode = options.statusCode;
  }
}

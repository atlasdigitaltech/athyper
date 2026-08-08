export interface NotificationChannelHandler {
  /** Dispatch one notification delivery attempt; throw to request a retry. */
  send(opts: {
    channel: string;
    recipientAddr: string;
    templateKey: string;
    subject: string | null;
    payload: Record<string, unknown>;
    tenantId?: string;
    recipientId?: string;
    planeKey: "neon" | "mesh" | "admin";
    fromOverride?: string;
  }): Promise<{ externalId?: string }>;

  healthCheck?(
    provider?: Record<string, unknown>,
  ): Promise<"healthy" | "degraded" | "down">;
}

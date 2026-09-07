import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createEmailAdapter } from "../email.adapter.js";
import { createCaptureChannel, createCapturePush } from "../capture.adapter.js";

// Opt-in: use only a disposable/local Mailpit server. No external recipients.
it.skipIf(!process.env["MAILPIT_SMOKE_HOST"])("captures all channels in a real Mailpit inbox", async () => {
  const host = process.env["MAILPIT_SMOKE_HOST"]!;
  const marker = `channel-smoke-${randomUUID()}`;
  const inbox = createEmailAdapter({ host, port: 1025, secure: false, fromAddress: "smoke@capture.invalid" });
  try {
    for (const channel of ["email", "sms", "whatsapp"] as const) {
      const result = await createCaptureChannel(channel, inbox).send({ channel, recipientAddress: "synthetic-recipient", templateKey: marker, subject: marker, planeKey: "neon", payload: { renderedText: "Synthetic local test" } });
      expect(result.externalId).toMatch(/^capture:/);
    }
    for (const platform of ["web", "android", "ios"] as const) {
      await createCapturePush(inbox).send({ id: marker, tenantId: "synthetic-tenant", principalId: "synthetic-principal", planeKey: "neon", platform, endpoint: "https://push.invalid/test" }, { title: marker, body: "Synthetic local test" });
    }
    const response = await fetch(`http://${host}:8025/api/v1/search?query=${encodeURIComponent(marker)}`, { signal: AbortSignal.timeout(5000) });
    expect(response.ok).toBe(true);
    const result = await response.json() as { messages: { Subject: string }[] };
    expect(result.messages).toHaveLength(6);
    for (const label of ["email", "sms", "whatsapp", "push:web", "push:android", "push:ios"]) {
      expect(result.messages.some(({ Subject }) => Subject.includes(`[CAPTURE:${label}]`))).toBe(true);
    }
  } finally { await inbox.close?.(); }
}, 15000);

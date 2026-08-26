import { GetAccountCommand, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { describe, expect, it, vi } from "vitest";

import { CommunicationDeliveryError } from "../communication-delivery.error.js";
import {
  createSesEmailAdapter,
  type SesV2EmailClient,
} from "../ses-email.adapter.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const request = {
  channel: "email",
  recipientAddress: "person@example.test",
  templateKey: "security.login-alert",
  subject: "Login alert",
  payload: { renderedHtml: "<p>Hello</p>", renderedText: "Hello" },
  planeKey: "neon",
  tenantId,
  deliveryId: "22222222-2222-4222-8222-222222222222",
} as const;

describe("createSesEmailAdapter", () => {
  it("creates SES lazily and sends with controlled identity, tenant, configuration, and tags", async () => {
    const send = vi.fn().mockResolvedValue({ MessageId: "ses-message-1" });
    const createClient = vi.fn().mockReturnValue(client(send));
    const resolveTenantName = vi.fn().mockResolvedValue("t-cirrus-atlantic");
    const adapter = createSesEmailAdapter(
      {
        region: "ap-southeast-1",
        fromAddress: "notifications@notify.athyper.com",
        replyToAddress: "support@athyper.com",
        configurationSetName: "athyper-transactional",
        environment: "production",
        resolveTenantName,
      },
      { createClient },
    );

    expect(createClient).not.toHaveBeenCalled();
    await expect(adapter.send(request)).resolves.toEqual({
      externalId: "ses-message-1",
      confirmation: "provider_accepted",
    });
    expect(createClient).toHaveBeenCalledWith({ region: "ap-southeast-1" });
    expect(resolveTenantName).toHaveBeenCalledWith(tenantId);

    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(SendEmailCommand);
    expect((command as SendEmailCommand).input).toEqual({
      FromEmailAddress: "notifications@notify.athyper.com",
      Destination: { ToAddresses: ["person@example.test"] },
      ReplyToAddresses: ["support@athyper.com"],
      Content: {
        Simple: {
          Subject: { Data: "Login alert", Charset: "UTF-8" },
          Body: {
            Text: { Data: "Hello", Charset: "UTF-8" },
            Html: { Data: "<p>Hello</p>", Charset: "UTF-8" },
          },
        },
      },
      ConfigurationSetName: "athyper-transactional",
      TenantName: "t-cirrus-atlantic",
      EmailTags: [
        { Name: "athyper-environment", Value: "production" },
        { Name: "athyper-delivery", Value: "22222222-2222-4222-8222-222222222222" },
        { Name: "athyper-tenant", Value: tenantId },
        { Name: "athyper-plane", Value: "neon" },
        { Name: "athyper-category", Value: "security-login-alert" },
      ],
    });
  });

  it("forwards governed embedded attachments and appends governed links", async () => {
    const send = vi.fn().mockResolvedValue({ MessageId: "ses-message-2" });
    const adapter = adapterWith(send);

    await adapter.send({
      ...request,
      attachments: [
        {
          attachmentId: "a",
          filename: "invoice.pdf",
          contentType: "application/pdf",
          sizeBytes: 2,
          disposition: "link",
          downloadUrl: "https://download.example/a",
        },
        {
          attachmentId: "b",
          filename: "note.txt",
          contentType: "text/plain",
          sizeBytes: 2,
          disposition: "embed",
          content: new Uint8Array([1, 2]),
        },
      ],
    });

    const command = send.mock.calls[0]?.[0] as SendEmailCommand;
    expect(command.input.Content!.Simple).toMatchObject({
      Body: {
        Text: {
          Data: expect.stringContaining("invoice.pdf: https://download.example/a"),
        },
      },
      Attachments: [
        {
          RawContent: new Uint8Array([1, 2]),
          FileName: "note.txt",
          ContentType: "text/plain",
          ContentDisposition: "ATTACHMENT",
        },
      ],
    });
  });

  it("rejects arbitrary request-level senders before contacting SES", async () => {
    const send = vi.fn();
    const adapter = adapterWith(send);

    const error = await adapter.send({
      ...request,
      senderOverride: "spoof@customer.example",
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ channel: "email", retryable: false });
    expect(String(error)).toContain("sender overrides are forbidden");
    expect(send).not.toHaveBeenCalled();
  });

  it("fails closed when tenant mapping or governed attachment metadata is invalid", async () => {
    const send = vi.fn();
    const adapter = adapterWith(send);
    await expect(adapter.send({ ...request, tenantId: undefined })).rejects.toThrow(
      "Athyper tenant id is required",
    );
    await expect(adapter.send({ ...request, deliveryId: undefined })).rejects.toMatchObject({
      retryable: false,
      message: "Athyper delivery id is required",
    });
    await expect(adapter.send({
      ...request,
      attachments: [{
        attachmentId: "bad",
        filename: "bad.txt",
        contentType: "text/plain",
        sizeBytes: 5,
        disposition: "embed",
        content: new Uint8Array([1]),
      }],
    })).rejects.toMatchObject({ retryable: false });
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ["TooManyRequestsException", 429, true],
    ["ServiceUnavailableException", 503, true],
    ["MessageRejected", 400, false],
    ["BadRequestException", 400, false],
  ])("classifies %s failures without exposing provider details", async (name, status, retryable) => {
    const providerError = Object.assign(new Error("provider diagnostic"), {
      name,
      $metadata: { httpStatusCode: status },
    });
    const adapter = adapterWith(vi.fn().mockRejectedValue(providerError));

    const error = await adapter.send(request).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CommunicationDeliveryError);
    expect(error).toMatchObject({
      message: "Amazon SES email delivery failed",
      channel: "email",
      retryable,
      statusCode: status,
    });
    expect(String(error)).not.toContain("provider diagnostic");
  });

  it("does not retry when SES accepts without returning its authoritative MessageId", async () => {
    const adapter = adapterWith(vi.fn().mockResolvedValue({}));
    await expect(adapter.send(request)).rejects.toMatchObject({
      retryable: false,
      message: "Amazon SES did not return an authoritative MessageId",
    });
  });

  it("checks SES account health and destroys the client idempotently", async () => {
    const send = vi.fn().mockResolvedValue({ ProductionAccessEnabled: true });
    const destroy = vi.fn();
    const adapter = createSesEmailAdapter(baseConfig(), {
      createClient: () => ({ send, destroy }),
    });

    await expect(adapter.health()).resolves.toMatchObject({ status: "healthy" });
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(GetAccountCommand);
    await adapter.close?.();
    await adapter.close?.();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("validates controlled configuration before constructing the client", () => {
    expect(() => createSesEmailAdapter({ ...baseConfig(), environment: "not valid" }))
      .toThrow("SES environment tag must contain only");
  });
});

function baseConfig() {
  return {
    region: "ap-southeast-1",
    fromAddress: "notifications@notify.athyper.com",
    configurationSetName: "athyper-transactional",
    environment: "stg",
    resolveTenantName: async () => "t-cirrus-atlantic",
  };
}

function adapterWith(send: ReturnType<typeof vi.fn>) {
  return createSesEmailAdapter(baseConfig(), { createClient: () => client(send) });
}

function client(send: ReturnType<typeof vi.fn>): SesV2EmailClient {
  return { send: send as SesV2EmailClient["send"], destroy: vi.fn() };
}

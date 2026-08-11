import { describe, expect, it, vi } from "vitest";

import { CommunicationDeliveryError } from "../communication-delivery.error.js";
import { createEmailAdapter, type EmailTransport } from "../email.adapter.js";

const request = {
  channel: "email",
  recipientAddress: "person@example.test",
  templateKey: "welcome",
  subject: "Welcome",
  payload: { renderedHtml: "<p>Hello</p>", renderedText: "Hello" },
  planeKey: "neon",
} as const;

describe("createEmailAdapter", () => {
  it("creates SMTP lazily and delivers an already-rendered message", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "mail-1" });
    const createTransport = vi.fn().mockReturnValue(transport(sendMail));
    const adapter = createEmailAdapter(
      {
        host: "smtp.example.test",
        port: 465,
        secure: true,
        user: "mailer",
        password: "secret",
        fromAddress: "no-reply@example.test",
      },
      { createTransport },
    );

    expect(createTransport).not.toHaveBeenCalled();
    await expect(adapter.send(request)).resolves.toEqual({ externalId: "mail-1" });
    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp.example.test",
      port: 465,
      secure: true,
      auth: { user: "mailer", pass: "secret" },
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: "no-reply@example.test",
      to: "person@example.test",
      subject: "Welcome",
      text: "Hello",
      html: "<p>Hello</p>",
    });
  });

  it("supports legacy rendered payload keys during migration", async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    const adapter = createEmailAdapter(
      { host: "smtp.example.test", fromAddress: "from@example.test" },
      { createTransport: () => transport(sendMail) },
    );

    await adapter.send({
      ...request,
      payload: { rendered_html: "<b>Legacy</b>", rendered_text: "Legacy" },
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ html: "<b>Legacy</b>", text: "Legacy" }),
    );
  });

  it("appends governed links and forwards explicitly resolved embedded attachments", async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    const adapter = createEmailAdapter(
      { host: "smtp.example.test", fromAddress: "from@example.test" },
      { createTransport: () => transport(sendMail) },
    );
    await adapter.send({
      ...request,
      attachments: [
        { attachmentId: "a", filename: "invoice.pdf", contentType: "application/pdf", sizeBytes: 2, disposition: "link", downloadUrl: "https://download.example/a" },
        { attachmentId: "b", filename: "note.txt", contentType: "text/plain", sizeBytes: 2, disposition: "embed", content: new Uint8Array([1, 2]) },
      ],
    });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining("invoice.pdf: https://download.example/a"),
      attachments: [{ filename: "note.txt", content: Buffer.from([1, 2]), contentType: "text/plain" }],
    }));
  });

  it("reports SMTP health and closes the transport idempotently", async () => {
    const verify = vi.fn().mockResolvedValue(true);
    const close = vi.fn();
    const adapter = createEmailAdapter(
      { host: "smtp.example.test", fromAddress: "from@example.test" },
      {
        createTransport: () => ({
          sendMail: vi.fn(),
          verify,
          close,
        }),
      },
    );

    await expect(adapter.health()).resolves.toMatchObject({ status: "healthy" });
    await adapter.close?.();
    await adapter.close?.();
    expect(close).toHaveBeenCalledOnce();
  });

  it("classifies network failures as retryable without exposing credentials", async () => {
    const failure = Object.assign(new Error("socket reset"), { code: "ECONNRESET" });
    const adapter = createEmailAdapter(
      { host: "smtp.example.test", fromAddress: "from@example.test" },
      { createTransport: () => transport(vi.fn().mockRejectedValue(failure)) },
    );

    const error = await adapter.send(request).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CommunicationDeliveryError);
    expect(error).toMatchObject({ channel: "email", retryable: true });
    expect(String(error)).not.toContain("secret");
  });

  it("rejects partial SMTP credentials", () => {
    expect(() =>
      createEmailAdapter({
        host: "smtp.example.test",
        fromAddress: "from@example.test",
        user: "mailer",
      }),
    ).toThrow("configured together");
  });
});

function transport(sendMail: EmailTransport["sendMail"]): EmailTransport {
  return { sendMail, verify: vi.fn().mockResolvedValue(true), close: vi.fn() };
}

import { describe, expect, it, vi } from "vitest";
import {
  createHttpClient,
  uploadSignedObject,
} from "@athyper/platform-api-client";
import { createSupplierApplicantClient } from "./applicant-client";

describe("restricted applicant transport", () => {
  it("uses the exact external relay and CSRF without internal command authority", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json({ request: { id: "request-1" } }),
    );
    const client = createSupplierApplicantClient(
      createHttpClient({ fetch: transport, csrfToken: () => "csrf" }),
    );
    await client.accept({ token: "invitation" });
    expect(transport.mock.calls[0]?.[0]).toBe(
      "/api/relay/neon/external/business-partner-invitations/supplier/accept",
    );
    const init = transport.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get("x-csrf-token")).toBe("csrf");
    expect(init.credentials).toBe("same-origin");
  });
  it("does not complete an evidence reservation when upload fails", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json({
        uploadUrl: "https://storage.example.test/object?signature=capability",
      }),
    );
    const upload = vi.fn(async () => {
      throw new Error("storage unavailable");
    });
    const client = createSupplierApplicantClient(
      createHttpClient({ fetch: transport, csrfToken: () => "csrf" }),
      upload,
    );
    await expect(
      client.upload("request-1", new File(["evidence"], "evidence.txt")),
    ).rejects.toThrow("storage unavailable");
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("never forwards session credentials or follows redirects to storage", async () => {
    const transport = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 200 }),
    );
    await uploadSignedObject(
      {
        url: "https://storage.example.test/object?signature=capability",
        body: new Blob(["evidence"]),
        contentType: "text/plain",
      },
      transport,
    );
    expect(transport.mock.calls[0]?.[1]).toMatchObject({
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      headers: { "content-type": "text/plain" },
    });
    await expect(
      uploadSignedObject(
        {
          url: "http://storage.example.test/object",
          body: new Blob(),
          contentType: "text/plain",
        },
        transport,
      ),
    ).rejects.toThrow("HTTPS");
    expect(transport).toHaveBeenCalledTimes(1);
  });
});

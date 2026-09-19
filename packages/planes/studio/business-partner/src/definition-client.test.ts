import { createHttpClient } from "@athyper/platform-api-client";
import { describe, expect, it, vi } from "vitest";
import {
  createBusinessPartnerDefinitionClient,
  createDefinitionCommandKeys,
} from "./definition-client";

describe("Studio definition commands", () => {
  it("sends author and checker commands through the Studio relay with CSRF and explicit retry keys", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json({ id: "revision" }),
    );
    const client = createBusinessPartnerDefinitionClient(
      createHttpClient({ fetch: transport, csrfToken: () => "csrf" }),
    );
    const body = {
      bundle: { semanticVersion: "2.2.0" },
      targetPlanes: ["studio", "neon", "mesh"] as const,
    };
    await client.author(body, "author-key");
    await client.get("revision");
    await client.publish(
      "revision",
      { minimumRuntimeVersion: "1.0.0" },
      "checker-key",
    );
    expect(transport.mock.calls.map((call) => call[0])).toEqual([
      "/api/relay/studio/business-partner-definitions",
      "/api/relay/studio/business-partner-definitions/revision",
      "/api/relay/studio/business-partner-definitions/revision/publish",
    ]);
    const author = transport.mock.calls[0]![1]!;
    expect(JSON.parse(String(author.body))).toEqual(body);
    expect(new Headers(author.headers).get("idempotency-key")).toBe(
      "author-key",
    );
    expect(new Headers(author.headers).get("x-csrf-token")).toBe("csrf");
    expect(
      new Headers(transport.mock.calls[1]![1]!.headers).has("idempotency-key"),
    ).toBe(false);
    expect(
      new Headers(transport.mock.calls[2]![1]!.headers).get("idempotency-key"),
    ).toBe("checker-key");
  });
  it("retains retries but changes keys when revision, consumers or release constraints change", () => {
    let sequence = 0;
    const key = createDefinitionCommandKeys(() => `command-${++sequence}`);
    expect(key("author", { bundle: 1, planes: ["neon"] })).toBe(
      key("author", { bundle: 1, planes: ["neon"] }),
    );
    expect(key("author", { bundle: 1, planes: ["mesh"] })).not.toBe(
      "command-1",
    );
    const first = key("publish", {
      revision: "a",
      minimumRuntimeVersion: "1.0.0",
    });
    expect(
      key("publish", { revision: "b", minimumRuntimeVersion: "1.0.0" }),
    ).not.toBe(first);
    expect(
      key("publish", { revision: "a", minimumRuntimeVersion: "2.0.0" }),
    ).not.toBe(first);
  });
  it("propagates denied checker approval and never turns it into publication success", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json({ error: "FORBIDDEN" }, { status: 403 }),
    );
    const client = createBusinessPartnerDefinitionClient(
      createHttpClient({ fetch: transport, csrfToken: () => "csrf" }),
    );
    await expect(
      client.publish("revision", {}, "checker-key"),
    ).rejects.toMatchObject({ status: 403 });
    expect(transport).toHaveBeenCalledTimes(1);
  });
});

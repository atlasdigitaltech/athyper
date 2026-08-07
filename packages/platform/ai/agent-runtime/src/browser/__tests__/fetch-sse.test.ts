import { describe, expect, it, vi } from "vitest";
import {
  ATLAS_AGENT_SCHEMA_VERSION,
  type AgentRunRequest,
  type AgentStreamEnvelope,
} from "../../index";
import { AtlasTransportError, fetchAgentEvents } from "../fetch-sse";

const request: AgentRunRequest = {
  client_request_id: "00000000-0000-4000-8000-000000000001",
  plane: "neon",
  model_id: "atlas-fast",
  policy_revision: "atlas-base-v1",
  message: "Hello",
  history: [],
};

const envelope: AgentStreamEnvelope = {
  schema_version: ATLAS_AGENT_SCHEMA_VERSION,
  run_id: "00000000-0000-4000-8000-000000000002",
  thread_id: "00000000-0000-4000-8000-000000000003",
  message_id: "00000000-0000-4000-8000-000000000004",
  sequence: 0,
  event: {
    type: "run.started",
    provider: "atlas",
    model: "atlas-fast",
  },
};

describe("fetchAgentEvents", () => {
  it("parses typed envelopes and ignores SSE comments", async () => {
    const body = `: heartbeat\r\n\r\nevent: run.started\r\ndata: ${JSON.stringify(envelope)}\r\n\r\n`;
    const fetchImpl = vi.fn().mockResolvedValue(new Response(body, {
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
    }));

    const events: AgentStreamEnvelope[] = [];
    for await (const event of fetchAgentEvents({ request, fetchImpl })) events.push(event);

    expect(events).toEqual([envelope]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/relay/ai/agent/runs",
      expect.objectContaining({ method: "POST", cache: "no-store" }),
    );
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model_id: "atlas-fast",
      policy_revision: "atlas-base-v1",
    });
  });

  it("rejects envelopes that do not match the shared protocol", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(
      "event: invalid\ndata: {\"schema_version\":\"0\"}\n\n",
      { headers: { "Content-Type": "text/event-stream" } },
    ));

    const consume = async () => {
      for await (const _event of fetchAgentEvents({ request, fetchImpl })) {
        // consume
      }
    };
    await expect(consume()).rejects.toMatchObject({
      name: "AtlasTransportError",
      code: "protocol",
      status: 200,
    });
  });

  it("carries safe Retry-After metadata without exposing response detail", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(
      "provider-secret-diagnostic",
      {
        status: 429,
        headers: { "Retry-After": "17" },
      },
    ));

    const consume = async () => {
      for await (const _event of fetchAgentEvents({ request, fetchImpl })) {
        // consume
      }
    };
    const error = await consume().catch((value: unknown) => value);

    expect(error).toBeInstanceOf(AtlasTransportError);
    expect(error).toMatchObject({
      code: "rate_limited",
      status: 429,
      retryAfterSeconds: 17,
    });
    expect(String(error)).not.toContain("provider-secret-diagnostic");
  });
});

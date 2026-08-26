import { DeleteMessageCommand, GetQueueAttributesCommand, ReceiveMessageCommand } from "@aws-sdk/client-sqs";
import { describe, expect, it, vi } from "vitest";

import { createSesEventSqsAdapter, type SesEventSqsClient } from "../ses-event-sqs.adapter.js";

describe("createSesEventSqsAdapter", () => {
  it("long polls a bounded batch and deletes only acknowledged messages", async () => {
    const process = vi.fn()
      .mockResolvedValueOnce({ outcome: "acknowledge" })
      .mockResolvedValueOnce({ outcome: "retry", reasonCode: "delivery_not_found" })
      .mockResolvedValueOnce({ outcome: "permanent_failure", reasonCode: "malformed_json" });
    const send = vi.fn(async (command: unknown) => command instanceof ReceiveMessageCommand
      ? { Messages: [message("1"), message("2"), message("3")] }
      : {});
    const adapter = createSesEventSqsAdapter(config(), { process }, dependencies(send));

    await expect(adapter.pollOnce()).resolves.toEqual({
      received: 3,
      acknowledged: 1,
      retrying: 1,
      permanentFailures: 1,
    });
    expect(process).toHaveBeenCalledTimes(3);
    const receive = send.mock.calls[0]?.[0] as ReceiveMessageCommand;
    expect(receive.input).toMatchObject({
      WaitTimeSeconds: 20,
      VisibilityTimeout: 60,
      MaxNumberOfMessages: 10,
      MessageSystemAttributeNames: ["ApproximateReceiveCount"],
    });
    const deletes = send.mock.calls.map(([command]) => command).filter((command) => command instanceof DeleteMessageCommand);
    expect(deletes).toHaveLength(1);
    expect((deletes[0] as DeleteMessageCommand).input.ReceiptHandle).toBe("receipt-1");
  });

  it("leaves transient handler failures and invalid queue messages for redrive", async () => {
    const process = vi.fn().mockRejectedValue(new Error("contains recipient@example.test"));
    const warn = vi.fn();
    const send = vi.fn(async (command: unknown) => command instanceof ReceiveMessageCommand
      ? { Messages: [message("1"), { MessageId: "invalid" }] }
      : {});
    const adapter = createSesEventSqsAdapter(config({ logger: { info: vi.fn(), warn, error: vi.fn() } }), { process }, dependencies(send));

    await expect(adapter.pollOnce()).resolves.toEqual({ received: 2, acknowledged: 0, retrying: 1, permanentFailures: 1 });
    expect(send.mock.calls.some(([command]) => command instanceof DeleteMessageCommand)).toBe(false);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("recipient@example.test");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("{\"event\"");
  });

  it("supports abort-driven shutdown and prevents concurrent runners", async () => {
    let calls = 0;
    const send = vi.fn(async (command: unknown, options?: { abortSignal?: AbortSignal }) => {
      if (!(command instanceof ReceiveMessageCommand)) return {};
      calls += 1;
      await new Promise<void>((resolve) => options?.abortSignal?.addEventListener("abort", () => resolve(), { once: true }));
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    });
    const adapter = createSesEventSqsAdapter(config(), { process: vi.fn() }, dependencies(send));
    const running = adapter.run();
    await vi.waitFor(() => expect(calls).toBe(1));
    await expect(adapter.run()).rejects.toThrow("already running");
    adapter.close();
    await expect(running).resolves.toBeUndefined();
  });

  it("checks queue access without receiving messages", async () => {
    const send = vi.fn().mockResolvedValue({ Attributes: { QueueArn: "arn:aws:sqs:region:account:queue" } });
    const adapter = createSesEventSqsAdapter(config(), { process: vi.fn() }, dependencies(send));
    await expect(adapter.health()).resolves.toMatchObject({ status: "healthy" });
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(GetQueueAttributesCommand);
  });

  it("validates polling and queue configuration", () => {
    expect(() => createSesEventSqsAdapter(config({ queueUrl: "http://localhost/queue" }), { process: vi.fn() })).toThrow("must be HTTPS");
    expect(() => createSesEventSqsAdapter(config({ maxMessages: 11 }), { process: vi.fn() })).toThrow("1 to 10");
    expect(() => createSesEventSqsAdapter(config({ waitTimeSeconds: 21 }), { process: vi.fn() })).toThrow("0 to 20");
  });
});

function message(id: string) {
  return {
    MessageId: `message-${id}`,
    Body: `{"event":"${id}"}`,
    ReceiptHandle: `receipt-${id}`,
    Attributes: { ApproximateReceiveCount: "1" },
  };
}
function config(overrides: Record<string, unknown> = {}) {
  return { region: "ap-southeast-1", queueUrl: "https://sqs.ap-southeast-1.amazonaws.com/123/events", ...overrides };
}
function dependencies(send: ReturnType<typeof vi.fn>) {
  return { createClient: () => ({ send } as unknown as SesEventSqsClient) };
}

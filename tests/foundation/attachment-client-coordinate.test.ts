import assert from "node:assert/strict";
import test from "node:test";
import { createAttachmentApiClient } from "@athyper/platform-communications-collaboration-ui";

test("attachment uploads omit incomplete comment coordinates and accept explicit governed coordinates", async () => {
  const stageBodies: Record<string, unknown>[] = [];
  const request = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url.endsWith("/stage")) {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      stageBodies.push(body);
      return Response.json({ attachmentId: body.attachmentId, uploadUrl: "https://objects.example/upload" }, { status: 201 });
    }
    if (url === "https://objects.example/upload") return new Response(null, { status: 200 });
    if (url.endsWith("/finalize")) return Response.json({ status: "active" });
    return new Response(null, { status: 404 });
  };
  const file = new File(["safe"], "context.txt", { type: "text/plain" });
  await createAttachmentApiClient({ fetch: request as typeof fetch }).upload(file, { token: "one" });
  await createAttachmentApiClient({ fetch: request as typeof fetch, entityType: "atlas.prompt", entityId: "11111111-1111-4111-8111-111111111111" }).upload(file, { token: "two" });
  assert.equal(stageBodies[0]?.entityType, undefined);
  assert.deepEqual({ entityType: stageBodies[1]?.entityType, entityId: stageBodies[1]?.entityId }, { entityType: "atlas.prompt", entityId: "11111111-1111-4111-8111-111111111111" });
  assert.throws(() => createAttachmentApiClient({ fetch: request as typeof fetch, entityType: "atlas.prompt" }), /provided together/);
});

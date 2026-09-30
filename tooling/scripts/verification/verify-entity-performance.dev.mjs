/** Read-only DEV probes through the authenticated BFF and shared Entity routes. */
import { request } from "@playwright/test";
import { parseArgs } from "node:util";
import { writeFileSync } from "node:fs";

const { values } = parseArgs({
  options: {
    plane: { type: "string", default: "neon" },
    entity: { type: "string", default: "country" },
    record: { type: "string" },
    state: { type: "string" },
    attachment: { type: "string" },
    query: { type: "string" },
    output: {
      type: "string",
      default: "/tmp/athyper-entity-performance.dev.json",
    },
  },
});
if (
  !["neon", "studio", "mesh"].includes(values.plane) ||
  !/^[a-z][a-z0-9_]*$/.test(values.entity) ||
  !values.record ||
  !/^[a-zA-Z0-9_-]{1,128}$/.test(values.record) ||
  (values.attachment && !/^[0-9a-f-]{36}$/i.test(values.attachment))
)
  throw Error(
    "Usage: node tooling/scripts/verification/verify-entity-performance.dev.mjs --record <id> [--plane neon|studio|mesh] [--entity country] [--state <saved-session.json>] [--attachment <id>] [--query <text>] [--output <report.json>]",
  );

const origin = `https://${values.plane}.dev.athyper.test`;
const client = await request.newContext({
  ignoreHTTPSErrors: true, // Local DEV CA, matching the existing DEV verification tools.
  storageState:
    values.state ?? `tests/e2e/.auth/dev/${values.plane}/catl.owner.json`,
  timeout: 30000,
});
const samples = [];
try {
  const session = await (await client.get(`${origin}/api/auth/session`)).json();
  if (session.state !== "authenticated")
    throw Error("Refresh the saved DEV browser session before probing.");
  const csrf = (await client.storageState()).cookies.find(
    (cookie) =>
      cookie.domain === new URL(origin).hostname &&
      /^(?:__Host-)?athyper-csrf$/.test(cookie.name),
  );
  async function probe(name, path, body) {
    const started = performance.now();
    const response = await client.fetch(`${origin}/api/relay${path}`, {
      method: body ? "POST" : "GET",
      maxRedirects: 0,
      headers: {
        origin,
        ...(csrf ? { "x-csrf-token": decodeURIComponent(csrf.value) } : {}),
      },
      ...(body ? { data: body } : {}),
    });
    let value;
    try {
      value = await response.json();
    } catch {
      value = {};
    }
    const sample = {
      name,
      status: response.status(),
      durationMs: Math.round(performance.now() - started),
      serverTiming: response.headers()["server-timing"] ?? null,
      requestId: response.headers()["x-request-id"] ?? null,
      ...(response.ok()
        ? {}
        : { code: value.code ?? value.error ?? "UNKNOWN" }),
    };
    samples.push(sample);
    console.log(JSON.stringify(sample));
  }
  const base = `/entity-runtime/${values.entity}`;
  // Sequential samples avoid manufacturing a load spike. These are samples,
  // not p95 estimates; compare equivalent cold/warm runs and browser HARs.
  for (let sample = 1; sample <= 3; sample++) {
    await probe(
      `detail-${sample}`,
      `${base}/detail-descriptor?recordId=${encodeURIComponent(values.record)}`,
    );
    await probe(
      `record-${sample}`,
      `${base}/records/${encodeURIComponent(values.record)}`,
    );
  }
  await probe("list-descriptor", `${base}/list-descriptor`);
  await probe("list", `${base}/list`);
  await probe(
    "attachments",
    `${base}/records/${values.record}/collaboration/attachments`,
  );
  await probe("activity", `${base}/records/${values.record}/activity`);
  for (const kind of ["notifications", "inbox"])
    await probe(kind, `/collections/activity.${kind}/descriptor`);
  if (values.attachment) {
    await probe("history", "/attachments/browse", {
      entityType: values.entity,
      entityId: values.record,
      attachmentId: values.attachment,
      includeHistory: true,
    });
    await probe("thumbnail", `/attachments/${values.attachment}/preview`, {
      rendition: "thumbnail_sm",
    });
  }
  if (values.query)
    await probe("search", "/attachments/search", {
      entityType: values.entity,
      entityId: values.record,
      q: values.query,
    });
  writeFileSync(
    values.output,
    JSON.stringify(
      {
        schemaVersion: 1,
        capturedAt: new Date().toISOString(),
        origin,
        entity: values.entity,
        samples,
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
  if (samples.some((sample) => sample.status !== 200)) process.exitCode = 1;
  console.log(
    `Report: ${values.output}. No record bodies, credentials or signed URLs are stored.`,
  );
} finally {
  await client.dispose();
}

/** User-authorized native release creation for an independently approved graph.
 * Dispatch only queues compilation. No activation or grant endpoints are called. */
import { readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { request } from "@playwright/test";
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const id = "f533b3ec-934b-4bc0-8448-ee933847ddf2";
const contract =
  "3e860539e3892846d5fca4d24db1334a234ccd4820d6707f188a97423bebdd3a";
const receiptPath =
  "governance/policy/reports/business-partner-canonical-v2-native-publication.dev.json";
if (existsSync(receiptPath) && read(receiptPath).nativeReleaseCreated)
  throw Error(
    "Native release already created; inspect durable state rather than replaying publication",
  );
execFileSync(
  "pnpm",
  [
    "exec",
    "tsx",
    "tooling/scripts/verification/inspect-business-partner-canonical-v2-review.mts",
    "--approved",
  ],
  { stdio: "inherit" },
);
const verified = read(
  "governance/policy/reports/business-partner-canonical-v2-persisted-approval.dev.json",
);
if (
  verified.changeSetId !== id ||
  verified.persistedNativeContractHash !== contract ||
  verified.changeSetRevision !== 3
)
  throw Error("Approved native content changed");
const consent = read(
  "governance/policy/reviews/business-partner-canonical-v2-native.acceptance.dev.json",
);
if (
  consent.changeSetId !== id ||
  consent.nativeContractHash !== contract ||
  consent.proposalRevision !== verified.proposalRevision ||
  !consent.authorizedActions.includes("native_publication_signing")
)
  throw Error("Exact publication authorization required");
const origin = "https://studio.dev.athyper.test",
  authPath = "tests/e2e/.auth/catl.admin-bp-combined-publisher.json";
const client = await request.newContext({
  baseURL: origin,
  ignoreHTTPSErrors: true,
  storageState: authPath,
});
try {
  let session = await (await client.get("/api/auth/session")).json();
  if (session.state !== "authenticated") {
    const token = (await client.storageState()).cookies.find(
      (c) => c.name === "__Host-athyper-csrf",
    );
    if (!token) throw Error("Publisher refresh requires CSRF");
    const refreshed = await client.post("/api/auth/refresh", {
      headers: { origin, "x-csrf-token": decodeURIComponent(token.value) },
    });
    if (!refreshed.ok()) throw Error("Publisher login required");
    session = await (await client.get("/api/auth/session")).json();
  }
  if (
    session.state !== "authenticated" ||
    session.principalId !== "81cd1978-2df5-5c9a-938a-2f8c291aea13" ||
    session.tenantId !== "44444444-4444-4444-8444-444444444444"
  )
    throw Error("Authenticated Studio publisher required");
  const me = await client.get("/api/relay/iam/me");
  const identity = await me.json();
  if (
    !me.ok() ||
    identity.principalId !== session.principalId ||
    identity.tenantId !== session.tenantId ||
    !identity.permissions?.includes("metadata.entity.publish")
  )
    throw Error("Current native publication authority required");
  const csrf = (await client.storageState()).cookies.find(
    (c) => c.name === "__Host-athyper-csrf",
  );
  if (!csrf) throw Error("CSRF required");
  const response = await client.post(
    `/api/relay/meta-entity-authoring/change-sets/${id}/publish`,
    {
      headers: {
        origin,
        "x-csrf-token": decodeURIComponent(csrf.value),
        "if-match": "3",
      },
      data: { expectedRevision: 3, targetPlanes: ["neon"] },
    },
  );
  const raw = await response.text();
  let result: any;
  try {
    result = JSON.parse(raw);
  } catch {
    result = { nonJson: true };
  }
  const nativeReleaseCreated =
    response.ok() &&
    typeof result.release?.id === "string" &&
    result.artifact?.contractHash === contract &&
    typeof result.artifact?.signature === "string";
  const receipt = {
    schemaVersion: 1,
    kind: "bp_canonical_v2_native_publication",
    recordedAt: new Date().toISOString(),
    changeSetId: id,
    contractHash: contract,
    actor: "catl.admin",
    principalId: session.principalId,
    status: response.status(),
    response: result,
    nativeReleaseCreated,
    exactRuntimeArtifactSigned: false,
    qualificationComplete: false,
    policyDifferencesAccepted: false,
    grantsChanged: false,
    activationAuthorized: false,
  };
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
  console.log({
    status: response.status(),
    nativeReleaseCreated,
    releaseId: result.release?.id,
    code: result.code ?? result.error,
  });
  if (!nativeReleaseCreated)
    throw Error(
      "Native publication not confirmed; inspect durable state before retrying",
    );
} finally {
  await client.storageState({ path: authPath });
  chmodSync(authPath, 0o600);
  await client.dispose();
}

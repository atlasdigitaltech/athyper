/** Invalid-only authenticated DEV probe. Never submits a valid create request. */
import { request } from "@playwright/test";
import { randomUUID } from "node:crypto";
const origin = "https://neon.dev.athyper.test";
const client = await request.newContext({
  baseURL: origin,
  ignoreHTTPSErrors: true,
  storageState: "tests/e2e/.auth/dev/neon/catl.admin.json",
});
try {
  const session = await (await client.get("/api/auth/session")).json();
  if (
    session.state !== "authenticated" ||
    session.tenantId !== "44444444-4444-4444-8444-444444444444" ||
    session.principalId !== "cca94907-7519-5871-8e3c-6b11aa545c93"
  )
    throw Error("Expected DEV test account required");
  const csrf = (await client.storageState()).cookies.find((c) =>
    /^(__Host-)?athyper-csrf$/.test(c.name),
  );
  if (!csrf) throw Error("CSRF required");
  const key = randomUUID();
  const response = await client.post("/api/relay/neon/business-partner-cases", {
    headers: {
      origin,
      "x-csrf-token": decodeURIComponent(csrf.value),
      "idempotency-key": key,
    },
    data: {
      idempotencyKey: key,
      kind: "new_partner",
      source: { kind: "manual" },
      requestedRole: "supplier",
      operatingOrganizationId: "a478f9c0-8226-5d22-9599-b8fb27a45180",
      proposedPayload: {
        name: "x".repeat(321),
        registrationCountryCode: "MY",
        ownershipClass: "external",
        supplierType: "general",
        qualificationTypeCode: "compliance",
      },
    },
  });
  const body = await response.json();
  console.log(JSON.stringify({ status: response.status(), body }));
  if (
    response.status() !== 422 ||
    !body.fieldErrors?.some(
      (e: any) =>
        e.fieldPath === "name" &&
        e.code === "maxLength" &&
        e.params?.max === 320,
    )
  )
    process.exitCode = 1;
} finally {
  await client.dispose();
}

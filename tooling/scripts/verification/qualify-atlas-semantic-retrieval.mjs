import assert from "node:assert/strict";
import { request } from "@playwright/test";
import { readFileSync, writeFileSync, chmodSync } from "node:fs";
const state = "tests/e2e/.auth/dev/neon/catl.admin.json",
  origin = "https://neon.dev.athyper.test",
  path = "docs/examples/atlas-f5/cirrus-semantic-retrieval.qualification.json";
const c = await request.newContext({
  baseURL: origin,
  ignoreHTTPSErrors: true,
  storageState: state,
});
const report = { observedAt: new Date().toISOString(), steps: [] };
try {
  let csrf = (await c.storageState()).cookies.find(
    (x) =>
      x.domain === "neon.dev.athyper.test" && x.name === "__Host-athyper-csrf",
  );
  await c.post("/api/auth/refresh", {
    headers: { origin, "x-csrf-token": decodeURIComponent(csrf.value) },
  });
  const session = await (await c.get("/api/auth/session")).json();
  if (
    session.state !== "authenticated" ||
    session.principalId !== "cca94907-7519-5871-8e3c-6b11aa545c93" ||
    session.tenantId !== "44444444-4444-4444-8444-444444444444"
  )
    throw Error("Verified Neon catl.admin session required");
  csrf = (await c.storageState()).cookies.find(
    (x) =>
      x.domain === "neon.dev.athyper.test" && x.name === "__Host-athyper-csrf",
  );
  const body = {
    attachmentId: "fc668e33-9d67-4015-83ba-8be70dfbb2c6",
    entityCode: "business_partner",
    recordId: "f7688c3d-8c92-5651-a469-da3f4f786375",
    scopeCoordinate: {
      operatingOrganizationId: "a478f9c0-8226-5d22-9599-b8fb27a45180",
    },
  };
  for (const [step, route, data] of [
    ["exact", "search", {...body,query:"Indigo Lantern"}],
    ["paraphrase", "search", {...body,query:"How many days elapse between evaluations of the make-believe initiative?"}],
    ["support_paraphrase", "search", {...body,query:"On which weekday and at what UTC hours can the fictional team receive help?"}],
    ["unrelated", "search", {...body,query:"Explain the quantum chromodynamics of neutron stars"}],
    ["unrelated_weather", "search", {...body,query:"What is tomorrow’s rainfall forecast for Tokyo?"}],
    ["vague", "search", {...body,query:"What is the cadence of recurring oversight?"}],
  ]) {
    const started=performance.now();
    const r = await c.post("/api/relay/atlas/knowledge/" + route, {
      headers: { origin, "x-csrf-token": decodeURIComponent(csrf.value) },
      data,
    });
    let response;
    try {
      response = await r.json();
    } catch {
      response = { nonJson: true };
    }
    report.steps.push({ step, status: r.status(), elapsedMs:Math.round(performance.now()-started), response });
    console.log(JSON.stringify(report.steps.at(-1)));
    assert.equal(r.status(),200);
    assert.equal(response.citations.length,['unrelated','unrelated_weather','vague'].includes(step)?0:1,step);
    if(response.citations.length)assert.equal(response.citations[0].citation.sourceId,body.attachmentId);
  }
  report.passed=true;
} finally {
  writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
  await c.storageState({ path: state });
  chmodSync(state, 0o600);
  await c.dispose();
}

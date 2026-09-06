import {expect} from "@playwright/test";import {test} from "./bp-r6.fixture";
test("BP-SUP-005 retains two-tenant relationship and capability command evidence", async ({r6}, testInfo) => {
  const workspacePath = "/api/relay/mesh/business-partner-network-workspace";
  const [supplierResponse, buyerResponse] = await Promise.all([
    r6.supplier.page.request.get(workspacePath), r6.buyer.page.request.get(workspacePath),
  ]);
  expect(supplierResponse.ok()).toBe(true);
  expect(buyerResponse.ok()).toBe(true);
  const supplier = await supplierResponse.json(), buyer = await buyerResponse.json();
  expect(r6.supplier.tenantId).not.toBe(r6.buyer.tenantId);
  expect(supplier.actingAccount.id).not.toBe(buyer.actingAccount.id);
  expect(buyer.actingAccount.id).toBe(r6.counterpartyAccountId);
  const prefix = "/api/relay/mesh/business-partner-network-relationships";
  const request = {
    actorRole: "supplier", counterpartyTenantId: r6.counterpartyTenantId,
    counterpartyAccountId: r6.counterpartyAccountId, relationshipKind: "commercial",
    reason: "R6 two-tenant qualification", idempotencyKey: `bp-r6-${crypto.randomUUID()}`,
  };
  const createdResponse = await r6.supplier.page.request.post(prefix, {data: request});
  expect(createdResponse.status()).toBe(201);
  const created = await createdResponse.json();
  expect(created.evidenceId).toMatch(/^[0-9a-f-]{36}$/i);
  const replayResponse = await r6.supplier.page.request.post(prefix, {data: request});
  expect(replayResponse.ok()).toBe(true);
  expect(await replayResponse.json()).toMatchObject({id: created.id, evidenceId: created.evidenceId, replayed: true});
  const acceptedResponse = await r6.buyer.page.request.post(`${prefix}/${created.id}/decisions`, {data: {
    action: "accept", expectedVersion: created.rowVersion, reason: "Counterparty acceptance",
    idempotencyKey: `bp-r6-${crypto.randomUUID()}`,
  }});
  expect(acceptedResponse.ok()).toBe(true);
  const accepted = await acceptedResponse.json();
  expect(accepted).toMatchObject({id: created.id, status: "active"});
  expect(accepted.rowVersion).toBeGreaterThan(created.rowVersion);
  const capabilityResponse = await r6.supplier.page.request.post(`${prefix}/${created.id}/capabilities`, {data: {
    capabilityCode: "profile_exchange", effectiveFrom: new Date().toISOString().slice(0, 10),
    reason: "R6 requested capability", idempotencyKey: `bp-r6-${crypto.randomUUID()}`,
  }});
  expect(capabilityResponse.status()).toBe(201);
  const capability = await capabilityResponse.json();
  const capabilityDecision = await r6.buyer.page.request.post(`/api/relay/mesh/business-partner-network-capabilities/${capability.id}/decisions`, {data: {
    action: "accept", expectedVersion: capability.rowVersion, reason: "R6 capability acceptance",
    idempotencyKey: `bp-r6-${crypto.randomUUID()}`,
  }});
  expect(capabilityDecision.ok()).toBe(true);
  const approvedCapability = await capabilityDecision.json();
  expect(approvedCapability).toMatchObject({id: capability.id, status: "active"});
  for (const actor of [r6.supplier, r6.buyer]) {
    const response = await actor.page.request.get(workspacePath);
    expect(response.ok()).toBe(true);
    const workspace = await response.json();
    expect(workspace.relationships).toEqual(expect.arrayContaining([expect.objectContaining({id: created.id, status: "active"})]));
    expect(workspace.capabilities).toEqual(expect.arrayContaining([expect.objectContaining({id: capability.id, status: "active"})]));
  }
  await testInfo.attach("bp-sup-005-two-tenant.json", {body: JSON.stringify({
    supplierTenantId: r6.supplier.tenantId, buyerTenantId: r6.buyer.tenantId,
    supplierAccountId: supplier.actingAccount.id, buyerAccountId: buyer.actingAccount.id,
    created, accepted, capability, approvedCapability,
  }, null, 2), contentType: "application/json"});
});
test("BP-SUP-007 retains internal-sponsor-required external policy proof",async({r6},testInfo)=>{const key=`bp-r6-policy-${crypto.randomUUID()}`,response=await r6.supplier.page.request.post("/api/relay/mesh/business-partner-registration-exchanges",{headers:{"Idempotency-Key":key},data:{idempotencyKey:key,counterpartyTenantId:r6.counterpartyTenantId,counterpartyAccountId:r6.counterpartyAccountId,intentKind:"supplier_self_registration",relationshipKind:"commercial",contractName:"mesh.supplier.registration",contractVersion:1,contractHash:"a".repeat(64),invitationTokenHash:"b".repeat(64),intentSnapshot:{requestedCapabilities:["profile_exchange"],qualificationJourney:"r6-target"},expiresAt:new Date(Date.now()+86400000).toISOString(),reason:"R6 external policy target qualification"}});expect(response.status()).toBe(409);const proof=await response.json() as Record<string,unknown>;expect(proof).toMatchObject({code:"MESH_INTERNAL_SPONSOR_REQUIRED"});await testInfo.attach("bp-sup-007-policy.json",{body:JSON.stringify(proof,null,2),contentType:"application/json"});});

import {expect, it, vi} from "vitest";
import {createBusinessPartnerContactReader} from "./business-partner-atlas-contacts.js";
import {MasterDataError} from "./errors.js";
const input = {context: {planeKey: "neon", tenantId: "tenant", principalId: "user"}, recordId: "bp"} as never;
function harness() {
  const value = {sectionCode: "contacts", state: "ready", data: {items: [{id: "private-child-id", displayName: "Supplier contact", primary: true, businessTitle: "Account manager", roles: [{code: "sales"}], channels: [{type: "email", value: "contact@example.test", purpose: "business", id: "never-return"}]}]}, page: {limit: 5}, redactions: [] as unknown[]};
  const section = vi.fn(async () => value);
  return {value, section, read: createBusinessPartnerContactReader({section} as never)};
}
it("uses the authorized section owner without transaction context and allowlists contact fields", async () => {
  const h = harness(), result = await h.read(input);
  expect(h.section).toHaveBeenCalledWith({context: {planeKey: "neon", tenantId: "tenant", principalId: "user"}, businessPartnerId: "bp", sectionCode: "contacts", roleLens: "all", limit: 5});
  expect(result).toMatchObject({status: "ready", contacts: [{displayName: "Supplier contact", channels: "email: contact@example.test (business)"}], hasMore: false});
  expect(JSON.stringify(result)).not.toMatch(/private-child-id|never-return|events/);
});
it.each([403, 404, 409, 503])("returns a neutral unavailable projection for owner status %s", async status => {
  const h = harness(); h.section.mockRejectedValue(new MasterDataError(status, "SECRET", "never-return"));
  expect(await h.read(input)).toEqual({recordId: "bp", status: "unavailable", contacts: [], hasMore: false, ...(status === 403 ? {unavailableReason: "denied"} : status === 503 ? {unavailableReason: "reader_unavailable"} : {})});
});
it("withholds redacted fields and counts; distinguishes authorized empty data", async () => {
  const h = harness(); h.value.redactions = [{fieldCode: "contact.locality"}];
  expect(await h.read(input)).toMatchObject({status: "unavailable", contacts: [], hasMore: false});
  h.value.redactions = []; h.value.data.items = []; h.value.state = "empty";
  expect(await h.read(input)).toMatchObject({status: "empty", contacts: [], hasMore: false});
});
it("bounds the page and rejects wrong-plane and malformed owner output", async () => {
  const h = harness(); h.value.data.items = Array.from({length: 6}, () => h.value.data.items[0]!);
  expect(await h.read(input)).toMatchObject({hasMore: true});
  expect((await h.read(input)).contacts).toHaveLength(5);
  h.value.sectionCode = "banking";
  await expect(h.read(input)).rejects.toMatchObject({code: "BP_ATLAS_CONTACT_INVALID"});
  await expect(h.read({context: {planeKey: "mesh"}, recordId: "bp"} as never)).rejects.toMatchObject({status: 403});
});

import { describe, expect, it } from "vitest";
import {
  effectiveInheritedAddresses,
  effectiveInheritedChannels,
  supportsAddressContact,
  type AddressRow,
  type ChannelRow,
} from "./address-contact-panel";

const addressBase: AddressRow = {
  link_id: "link", purpose: "bill_from", role_qualifier: null, is_primary: true,
  address_id: "address", line1: "1 Main", line2: null, city: "Kuala Lumpur",
  region: null, postal_code: "50000", country_code: "MY", formatted_address: null,
  source_label: "Source", source_rank: 1, is_inherited: true,
};

const channelBase: ChannelRow = {
  link_id: "contact", channel_type: "email", value: "ap@example.com",
  purpose: "correspondence", role_qualifier: "accounts_payable", is_primary: true,
  is_verified: true, source_label: "Source", source_rank: 1, is_inherited: true,
};

describe("organizational address/contact presentation", () => {
  it("enables the aggregate panel only for supported organizational owners", () => {
    expect(supportsAddressContact("tenant")).toBe(true);
    expect(supportsAddressContact("legal_entity")).toBe(true);
    expect(supportsAddressContact("company_code")).toBe(true);
    expect(supportsAddressContact("supplier")).toBe(false);
  });

  it("uses the nearest inherited primary address per purpose/qualifier", () => {
    const legal = { ...addressBase, link_id: "legal", source_rank: 1, source_label: "Legal Entity" };
    const tenant = { ...addressBase, link_id: "tenant", source_rank: 2, source_label: "Tenant" };
    expect(effectiveInheritedAddresses([legal, tenant]).map((row) => row.link_id)).toEqual(["legal"]);
  });

  it("suppresses an inherited channel when a local primary override exists", () => {
    const local = { ...channelBase, link_id: "local", source_rank: 0, is_inherited: false };
    const inherited = { ...channelBase, link_id: "legal", source_rank: 1 };
    expect(effectiveInheritedChannels([local, inherited])).toEqual([]);
  });
});

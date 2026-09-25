import { describe, expect, it } from "vitest";
import { parseChildActivation } from "../business-partner-child-activation.js";
const id = "11111111-1111-4111-8111-111111111111";
const proposal = (items: unknown[]) => ({ schema: "athyper.bp-child-activation/1", items });
describe("child activation capture boundary", () => {
  it("accepts only coordinates and orders locking deterministically", () => {
    expect(parseChildActivation(proposal([{ kind: "tax_registration", id }, { kind: "identifier", id }])).items.map(i => i.kind)).toEqual(["identifier", "tax_registration"]);
  });
  it("binds evidence only by attachment coordinate", () => {
    expect(parseChildActivation(proposal([{ kind: "certificate_evidence", id, attachmentId: id }])).items[0]).toEqual({ kind: "certificate_evidence", id, attachmentId: id });
  });
  it.each([
    null, {}, proposal([]), proposal([{ kind: "supplier", id }]),
    proposal([{ kind: "identifier", id: "bad" }]),
    proposal([{ kind: "identifier", id, fingerprint: "forged" }]),
    proposal([{ kind: "identifier", id, status: "active" }]),
    proposal([{ kind: "identifier", id, attachmentId: id }]),
    proposal([{ kind: "certificate_evidence", id }]),
    proposal([{ kind: "certificate_evidence", id, attachmentId: id, attachmentFingerprint: "forged" }]),
    proposal([{ kind: "identifier", id }, { kind: "identifier", id }]),
    { ...proposal([{ kind: "identifier", id }]), approvedBy: id },
    proposal(Array.from({ length: 51 }, () => ({ kind: "identifier", id }))),
  ])("rejects malformed or caller-owned authority: %j", value => {
    expect(() => parseChildActivation(value)).toThrow();
  });
});

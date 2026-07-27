import { describe, expect, it } from "vitest";
import {
  CONTRACT_OWNER_SECTIONS,
  dirtyPathsByOwner,
  issuesByPath,
  rebaseContract,
  toAuthoredContract,
} from "../_components/contract-state";

describe("Meta Entity Studio contract state", () => {
  it("wires every canonical Contract v2 owner", () => {
    expect(CONTRACT_OWNER_SECTIONS).toEqual([
      "catalog",
      "runtime",
      "version_contract",
      "fields",
      "relations",
      "surfaces",
      "operations",
      "lifecycle",
      "numbering",
      "policy",
      "flows",
    ]);
  });

  it("groups dirty JSON Pointer paths by their Contract owner", () => {
    expect(dirtyPathsByOwner(
      { catalog: { enabled: true }, fields: [{ name: "code" }] },
      { catalog: { enabled: false }, fields: [{ name: "company_code" }] },
    )).toEqual({
      catalog: ["/catalog/enabled"],
      fields: ["/fields/0/name"],
    });
  });

  it("automatically rebases non-overlapping changes and reports overlapping paths", () => {
    const base = { catalog: { enabled: true, slug: "company" }, policy: { audit: true } };
    const local = { catalog: { enabled: false, slug: "company" }, policy: { audit: true } };
    const remote = { catalog: { enabled: true, slug: "company-code" }, policy: { audit: false } };
    const result = rebaseContract(base, local, remote);
    expect(result.conflicts).toEqual([]);
    expect(result.document).toEqual({
      catalog: { enabled: false, slug: "company-code" },
      policy: { audit: false },
    });

    expect(rebaseContract(base, local, {
      catalog: { enabled: false, slug: "company" },
      policy: { audit: true },
    }).conflicts).toEqual(["/catalog/enabled"]);
  });

  it("preserves server issue paths for control-level rendering", () => {
    expect(issuesByPath([
      { path: "/fields/0/name", message: "Duplicate" },
      { path: "catalog.slug", message: "Invalid" },
    ])).toEqual({
      "/fields/0/name": [{ path: "/fields/0/name", message: "Duplicate" }],
      "/catalog/slug": [{ path: "catalog.slug", message: "Invalid" }],
    });
  });

  it("removes read-only version status before strict save validation", () => {
    expect(toAuthoredContract({
      contract_version: 2,
      version_status: "DRAFT",
      fields: [],
    })).toEqual({
      contract_version: 2,
      fields: [],
    });
  });
});

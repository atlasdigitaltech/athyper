import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EntityField } from "@athyper/api-contracts/metadata";
import { MetaFieldInput } from "../meta-field-input";

function enumField(name: string, domain: string): EntityField {
  return {
    name,
    label: name === "procurement_type" ? "Procurement Type" : "Line Type",
    data_type: "enum",
    enum_config: null,
    enum_domain_code: domain,
    reference_config: null,
  } as unknown as EntityField;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MetaFieldInput lookup-domain enums", () => {
  it.each([
    ["procurement_type", "document.procurement_type", "Goods", "goods"],
    ["line_type", "document.line_type", "NonCatalog", "noncatalog"],
  ])("loads options for %s when inline enum values are absent", async (name, domain, label, value) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ code: value, name: label }] }),
    }));

    render(<MetaFieldInput field={enumField(name, domain)} value="" onChange={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole("option", { name: label })).toHaveValue(value));
    expect(fetch).toHaveBeenCalledWith(`/api/relay/api/metadata/lookups/${encodeURIComponent(domain)}`);
  });
});

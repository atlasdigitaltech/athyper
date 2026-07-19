import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pilotSeedPath = fileURLToPath(new URL(
  "../../../../../db/seed/platform/003_control/102_meta_entity_contract_v2_pilots.sql",
  import.meta.url,
));

const bindingRepairPath = fileURLToPath(new URL(
  "../../../../../db/seed/platform/003_control/039_control_entity_operation_binding_repair.sql",
  import.meta.url,
));

describe("Journal Entry / Purchase Invoice v2 pilot seed", () => {
  it("authors pilot ownership in v2 without writing display_config", () => {
    const source = readFileSync(pilotSeedPath, "utf8");

    expect(source).toContain("source_kind = 'explicit'");
    expect(source).toContain("'journal_entry', 'journal_line'");
    expect(source).toContain("'purchase_invoice', 'purchase_invoice_line'");
    expect(source).toContain("'label_field','supplier_code'");
    expect(source).toContain("'kind', 'money'");
    expect(source).toContain("'accounting_distributions'");
    expect(source).toContain("'spreadsheet'");
    expect(source).toContain("'compact_card'");
    expect(source).not.toMatch(/SET\s+display_config\s*=/i);
    expect(source).not.toMatch(/display_config\s*->/i);
  });

  it("asserts the pilot graph before allowing smoke validation", () => {
    const source = readFileSync(pilotSeedPath, "utf8");

    expect(source).toContain("expected four explicit v2 version contracts");
    expect(source).toContain("Purchase Invoice supplier reference label contract is missing");
    expect(source).toContain("Purchase Invoice money contract is missing");
    expect(source).toContain("document line/accounting surfaces are incomplete");
    expect(source).toContain("expected Journal Entry and Purchase Invoice numbering configs");
    expect(source).toContain("expected active Journal Entry and Purchase Invoice flows");
  });

  it("repairs the old operation constraint before force-rerun seeds", () => {
    const source = readFileSync(bindingRepairPath, "utf8");

    expect(source).toContain("conname = 'eo_binding_uq'");
    expect(source).toContain("ADD CONSTRAINT eo_binding_uq UNIQUE NULLS NOT DISTINCT");
    expect(source).toContain("tenant_id, entity_name, permission_code");
  });
});

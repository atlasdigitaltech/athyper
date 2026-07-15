import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../../../../..");
const read = (relativePath: string) => readFileSync(resolve(repoRoot, relativePath), "utf8");

describe("Phase 6 and Phase 7 database/domain contracts", () => {
  it("defines tenant-safe Procurement sourcing ownership and outputs", () => {
    const ddl = read("server/db/ddl/document/01w_tables_sourcing.sql");
    const rls = read("server/db/ddl/document/08y_rls_sourcing.sql");
    const auth = read("server/packages/services/business/procurement/sourcing/sourcing-authorization.service.ts");
    const document = read("server/packages/services/business/procurement/sourcing/sourcing-document.service.ts");

    expect(ddl).toContain("operating_organization_id");
    expect(ddl).toContain("purchase_requisition_line_id");
    expect(ddl).toContain("sourcing_event_intercompany_allocation");
    expect(ddl).toContain("FOREIGN KEY (tenant_id, commitment_id)");
    expect(rls).toContain("sourcing_event_intercompany_allocation");
    expect(auth).toContain('SOURCE.DEMAND.AGGREGATE');
    expect(auth).toContain('requireCompanyScope');
    expect(document).toContain('buying_model === "central_buyer"');
    expect(document).toContain('commitment_type: "purchase_order"');
  });

  it("defines tenant-safe Sales ownership and federated/principal-seller outputs", () => {
    const ddl = read("server/db/ddl/document/01x_tables_sales.sql");
    const rls = read("server/db/ddl/document/08z_rls_sales.sql");
    const auth = read("server/packages/services/business/sales/sales-authorization.service.ts");
    const document = read("server/packages/services/business/sales/sales-document.service.ts");

    expect(ddl).toContain("sales_opportunity");
    expect(ddl).toContain("sales_quotation_allocation");
    expect(ddl).toContain("sales_order_intercompany_fulfillment");
    expect(ddl).toContain("FOREIGN KEY (tenant_id, operating_organization_id)");
    expect(rls).toContain("FORCE ROW LEVEL SECURITY");
    expect(auth).toContain('SALES.QUOTATION.CREATE');
    expect(auth).toContain('SALES.ORDER.CREATE');
    expect(document).toContain('sellingModel === "principal_seller"');
    expect(document).toContain('sales_order_intercompany_fulfillment');
  });
});

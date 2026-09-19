import { EntityApplicationLayout } from "@/lib/entity-application-layout";
import { NeonRouteEntitlement } from "@/lib/experience-runtime";
import { InvoiceClassificationPilot } from "@/lib/invoice-classification-pilot";
export default function InvoiceClassificationPage() {
  return (
    <NeonRouteEntitlement workspaceCode="scm" moduleCode="buy">
      <EntityApplicationLayout entityCode="supplier_invoice">
        <InvoiceClassificationPilot />
      </EntityApplicationLayout>
    </NeonRouteEntitlement>
  );
}

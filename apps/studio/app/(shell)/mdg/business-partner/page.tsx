import { BusinessPartnerInspection } from "@athyper/product-studio-business-partner";
import type { Metadata } from "next";
import { SettingsIcon } from "@athyper/platform-icons";
import { PageFrame, PageHeader } from "@athyper/platform-shell";
import { businessPartnerDefinition } from "@athyper/product-studio-business-partner";

export const metadata: Metadata = { title: "Business Partner Definition" };

export default function BusinessPartnerDefinitionPage() {
  return (
    <PageFrame width="wide" className="athyper-landing">
      <PageHeader
        level="module"
        context="MDG · Module configuration"
        title="Business Partner"
        description="The governed module definition consumed by Neon stewardship and Mesh partner-network experiences."
        icon={<SettingsIcon />}
        metadata={
          <>
            <span>Governed definition</span>
            <span>{businessPartnerDefinition.publicationKey}</span>
          </>
        }
      />
      <BusinessPartnerInspection tab="overview" />
    </PageFrame>
  );
}

import type { Metadata } from "next";
import { LinkIcon } from "@athyper/platform-icons";
import { PageFrame, PageHeader } from "@athyper/platform-shell";
import {
  BusinessPartnerAuthoringWorkspace,
  BusinessPartnerCaseContractAuthoring,
  businessPartnerDefinition,
} from "@athyper/product-studio-business-partner";

export const metadata: Metadata = { title: "Business Partner Publication" };
export default function BusinessPartnerPublicationPage() {
  return (
    <PageFrame width="wide" className="athyper-landing">
      <PageHeader
        level="collection"
        context="Business Partner · Configuration"
        title="Publication"
        description="Author immutable definitions, simulate consumer compatibility and approve releases with an independent checker."
        icon={<LinkIcon />}
        metadata={<span>{businessPartnerDefinition.publicationKey}</span>}
      />
      <p><a href="/mdg/bank-directory">Manage shared bank directory publication</a></p>
      <BusinessPartnerCaseContractAuthoring />
      <BusinessPartnerAuthoringWorkspace />
    </PageFrame>
  );
}

import type { Metadata } from "next";
import { LinkIcon } from "@athyper/platform-icons";
import { PageFrame, PageHeader } from "@athyper/platform-shell";
import { businessPartnerDefinition } from "@athyper/product-studio-business-partner";
export const metadata:Metadata={title:"Business Partner Publication"};
export default function BusinessPartnerPublicationPage(){return <PageFrame width="wide" className="athyper-landing"><PageHeader level="collection" context="Business Partner · Configuration" title="Publication" description="The immutable definition coordinate consumed by Neon and Mesh." icon={<LinkIcon/>} metadata={<><span>Published definition</span><span>{businessPartnerDefinition.publicationKey}</span></>}/><ul className="athyper-governance-list"><li><strong>Neon consumer</strong><span>Uses the definition for request validation, workflow pinning, and canonical materialization.</span></li><li><strong>Mesh consumer</strong><span>Uses the allowed field set for governed partner-profile publication and disclosure.</span></li></ul></PageFrame>;}

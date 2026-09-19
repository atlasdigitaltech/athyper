import type { Metadata } from "next";
import { PageFrame, PageHeader } from "@athyper/platform-shell";
import { AtlasLearningInboxWorkspace } from "@athyper/product-studio-shell";
export const metadata: Metadata = {title: "Atlas learning inbox"};
export default function AtlasLearningPage() {
  return <PageFrame width="wide"><PageHeader level="collection" context="Atlas AI" title="Learning inbox" description="Review vocabulary corrections and publish tested definitions."/><AtlasLearningInboxWorkspace/></PageFrame>;
}

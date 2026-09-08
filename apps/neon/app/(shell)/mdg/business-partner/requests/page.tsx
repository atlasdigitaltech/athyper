import { initialListDensity } from "@/lib/list-density";
import { NeonEntityApplicationSection } from "@athyper/product-neon-list-view";
export default async function BusinessPartnerRequestsPage({searchParams}:{readonly searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  return <NeonEntityApplicationSection sectionKey="review" initialDensity={initialListDensity(await searchParams)}/>;
}

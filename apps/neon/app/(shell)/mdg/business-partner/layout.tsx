import { EntityApplicationLayout } from "@/lib/entity-application-layout";
export default function BusinessPartnerLayout({children}:{readonly children:React.ReactNode}) {
  return <EntityApplicationLayout entityCode="business_partner">{children}</EntityApplicationLayout>;
}

import { BusinessPartnerNavigation } from "./module-navigation";

export default function BusinessPartnerStudioLayout({children}:{readonly children:React.ReactNode}) {
  return <div className="athyper-module-page"><BusinessPartnerNavigation/>{children}</div>;
}

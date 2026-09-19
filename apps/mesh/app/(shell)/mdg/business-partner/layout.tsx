import { BusinessPartnerNavigation } from "./module-navigation";

export default function BusinessPartnerLayout({children}:{readonly children:React.ReactNode}) {
  return <div className="athyper-module-page"><BusinessPartnerNavigation/>{children}</div>;
}

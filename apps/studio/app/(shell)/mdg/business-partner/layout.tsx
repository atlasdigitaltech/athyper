import { Suspense } from "react";
import { BusinessPartnerNavigation } from "./module-navigation";
import { WorkbenchContext } from "./workbench-context";
import "./workbench.css";
export default function BusinessPartnerStudioLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <div className="athyper-module-page">
      <Suspense
        fallback={<p role="status">Loading configuration workbench…</p>}
      >
        <WorkbenchContext>
          <BusinessPartnerNavigation />
          {children}
        </WorkbenchContext>
      </Suspense>
    </div>
  );
}

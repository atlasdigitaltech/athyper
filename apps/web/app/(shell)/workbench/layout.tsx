import { type ReactNode } from "react";

/**
 * Visible workbench route layout.
 *
 * Canonical module workbench routes live under /workbench/<workspace>/*.
 * Keep this layout lightweight during the phased migration; it is the future
 * home for shared workbench chrome such as workspace switching and breadcrumbs.
 */
export default function WorkbenchRouteLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

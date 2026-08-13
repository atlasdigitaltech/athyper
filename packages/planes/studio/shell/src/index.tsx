import { PlatformShell, deriveShellNavigation, type NavigationDiagnostic, type ShellExperienceInput } from "@athyper/platform-shell";
import type { ReactNode } from "react";
import { studioRoutes } from "./navigation";
export { studioRoutes } from "./navigation";
export function StudioShell({ bootstrap, principalId, children, onNavigationDiagnostic }: { readonly bootstrap: ShellExperienceInput & { readonly tenantId: string }; readonly principalId: string; readonly children: ReactNode; readonly onNavigationDiagnostic?: (event: NavigationDiagnostic) => void }) { return <PlatformShell applicationName="Athyper Studio" tenantLabel={bootstrap.tenantId} accountLabel={principalId} navigation={deriveShellNavigation(studioRoutes, bootstrap, onNavigationDiagnostic ?? planeDiagnostic("studio"))}>{children}</PlatformShell>; }
function planeDiagnostic(plane: string) { return (event: NavigationDiagnostic) => { const production = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV === "production"; (production ? console.error : console.warn)(production ? "[navigation-telemetry]" : "[navigation-warning]", { plane, ...event }); }; }

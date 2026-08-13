import { PlatformShell, deriveShellNavigation, type NavigationDiagnostic, type ShellExperienceInput } from "@athyper/platform-shell";
import type { ReactNode } from "react";
import { meshRoutes } from "./navigation";
export { meshRoutes } from "./navigation";
export function MeshShell({ bootstrap, principalId, children, onNavigationDiagnostic }: { readonly bootstrap: ShellExperienceInput & { readonly tenantId: string }; readonly principalId: string; readonly children: ReactNode; readonly onNavigationDiagnostic?: (event: NavigationDiagnostic) => void }) { return <PlatformShell applicationName="Athyper Mesh" tenantLabel={bootstrap.tenantId} accountLabel={principalId} navigation={deriveShellNavigation(meshRoutes, bootstrap, onNavigationDiagnostic ?? planeDiagnostic("mesh"))}>{children}</PlatformShell>; }
function planeDiagnostic(plane: string) { return (event: NavigationDiagnostic) => { const production = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV === "production"; (production ? console.error : console.warn)(production ? "[navigation-telemetry]" : "[navigation-warning]", { plane, ...event }); }; }

import type { ReactNode } from "react";
import { ShellChrome } from "./client";
import type { DerivedShellNavigation } from "./core";
export * from "./core";
export interface PlatformShellProps { readonly applicationName: string; readonly planeDescriptor?: string; readonly planeIconSrc?: string; readonly planeWordmarkSrc?: string; readonly initialCollapsed?: boolean; readonly tenantId: string; readonly tenantLabel: string; readonly tenantSecondaryLabel?: string; readonly contextLabel?: string; readonly accountLabel: string; readonly accountSecondaryLabel?: string; readonly workContextControl?: ReactNode; readonly navigation: DerivedShellNavigation; readonly experienceState?: "ready" | "context_not_ready"; readonly contexts?: readonly import("./client").ShellContextOption[]; readonly children: ReactNode; }
export function PlatformShell(props: PlatformShellProps) { return <ShellChrome {...props} />; }

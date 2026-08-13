import type { ReactNode } from "react";
import { ShellChrome } from "./client";
import type { DerivedShellNavigation } from "./core";
export * from "./core";
export interface PlatformShellProps { readonly applicationName: string; readonly tenantLabel: string; readonly accountLabel: string; readonly navigation: DerivedShellNavigation; readonly contexts?: readonly import("./client").ShellContextOption[]; readonly children: ReactNode; }
export function PlatformShell(props: PlatformShellProps) { return <ShellChrome {...props} />; }

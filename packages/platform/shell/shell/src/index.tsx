import type { ReactNode } from "react";
import { createEffectiveLocalization, type EffectiveLocalization, type SupportedLocale } from "@athyper/platform-i18n";
import { IntlProvider } from "@athyper/platform-i18n/react";
import { HeaderContextIdentity, ShellChrome, ShellContextPickerPanel, ShellContextSelector } from "./client";
import type { DerivedShellNavigation } from "./core";
import { shellEnglishMessages, shellMessages } from "./messages";
export * from "./core";
export { ContentHeader, type ContentHeaderProps } from "./content-header";
export { HeaderContextIdentity, ShellContextPickerPanel, ShellContextSelector };
export type { HeaderContextIdentityProps, ShellContextPickerPanelProps, ShellContextSelectorProps } from "./client";
export type { ShellActivityDataSource, ShellActivityTab, ShellInboxItem, ShellInboxPriority, ShellNotificationItem, ShellNotificationTone, ShellPushEnrollmentStatus } from "./activity-center";
export type { ShellQuickAccessDataSource, ShellQuickAccessItem, ShellQuickAccessKind, ShellQuickAccessTab } from "./quick-access";
export interface ShellLocalePolicy {readonly enabledLocales:readonly SupportedLocale[];readonly defaultLocale:SupportedLocale;}
export interface PlatformShellProps { readonly localization?: EffectiveLocalization;readonly localePolicy?:ShellLocalePolicy;readonly onLocaleChange?:(localeCode:SupportedLocale)=>Promise<void>; readonly applicationName: string; readonly planeDescriptor?: string; readonly planeIconSrc?: string; readonly planeWordmarkSrc?: string; readonly initialCollapsed?: boolean; readonly tenantId: string; readonly tenantLabel: string; readonly tenantSecondaryLabel?: string; readonly tenantCountryCode?: string; readonly tenantLogoAssetRef?: string; readonly contextLabel?: string; readonly showOrganizationContext?: boolean; readonly accountLabel: string; readonly accountInitials?: string; readonly accountLoginId?: string; readonly accountEmail?: string; readonly accountSecondaryLabel?: string; readonly transactionContext?: import("./client").ShellTransactionContext; readonly workContextControl?: ReactNode; readonly navigation: DerivedShellNavigation; readonly experienceState?: "ready" | "context_not_ready"; readonly contexts?: readonly import("./client").ShellContextOption[]; readonly quickAccess?: import("./quick-access").ShellQuickAccessDataSource; readonly activity?: import("./activity-center").ShellActivityDataSource; readonly children: ReactNode; }
const DEFAULT_LOCALIZATION = createEffectiveLocalization({ uiLocale: "en", formatLocale: "en-US" });
export function PlatformShell({localization=DEFAULT_LOCALIZATION,...props}: PlatformShellProps) { return <IntlProvider localization={localization} messages={shellMessages(localization.catalogLocale)} fallbackMessages={shellEnglishMessages}><ShellChrome currentLocale={localization.catalogLocale} {...props} /></IntlProvider>; }

import type { ReactNode } from "react";
import { createEffectiveLocalization, type EffectiveLocalization, type SupportedLocale } from "@athyper/platform-i18n";
import { IntlProvider } from "@athyper/platform-i18n/react";
import { HeaderContextIdentity, ShellChrome, ShellContextPickerPanel, ShellContextSelector } from "./client";
import type { DerivedShellNavigation } from "./core";
import { shellEnglishMessages, shellMessages } from "./messages";
import { ShellPersonalizationScopeProvider } from "./personalization-scope";
import { AtlasAnswerProvider } from "@athyper/platform-ai-agent-ui";
import { ShellHomeIdentityProvider } from "./home";
export * from "./core";
export { ContentHeader, type ContentHeaderProps } from "./content-header";
export { PageFrame, PageHeader, SectionNavigation, type PageFrameProps, type PageFrameWidth, type PageHeaderLevel, type PageHeaderProps, type SectionNavigationItem, type SectionNavigationProps } from "./page-foundation";
export { PlatformHome, type PlatformHomeAction, type PlatformHomeProps, type PlatformHomeSearchItem, type PlatformHomeWorkspace } from "./home";
export { AtlasWorkspace,type AtlasWorkspaceProps } from "./atlas-workspace";
export { createAtlasExperienceAdminClient, type AtlasExperienceDefinition, type AtlasExperienceRelease } from "@athyper/platform-ai-agent-ui";
export { HeaderContextIdentity, ShellContextPickerPanel, ShellContextSelector };
export type { HeaderContextIdentityProps, ShellContextPickerPanelProps, ShellContextSelectorProps } from "./client";
export type { ShellActivityDataSource, ShellActivityTab, ShellInboxItem, ShellInboxPriority, ShellNotificationItem, ShellNotificationTone, ShellPushEnrollmentStatus } from "./activity-center";
export type { ShellQuickAccessDataSource, ShellQuickAccessItem, ShellQuickAccessKind, ShellQuickAccessTab } from "./quick-access";
export interface ShellLocalePolicy {readonly enabledLocales:readonly SupportedLocale[];readonly defaultLocale:SupportedLocale;}
export interface PlatformShellProps { readonly atlasProactiveBriefsEnabled?: boolean; readonly localization?: EffectiveLocalization;readonly localePolicy?:ShellLocalePolicy;readonly onLocaleChange?:(localeCode:SupportedLocale)=>Promise<void>; readonly applicationName: string; readonly planeDescriptor?: string; readonly planeIconSrc?: string; readonly planeWordmarkSrc?: string; readonly persistentDesktopBrand?: boolean; readonly homeHref?: string; readonly initialCollapsed?: boolean; readonly tenantId: string; readonly principalId: string; readonly tenantLabel: string; readonly tenantSecondaryLabel?: string; readonly tenantCountryCode?: string; readonly tenantLogoAssetRef?: string; readonly contextLabel?: string; readonly showOrganizationContext?: boolean; readonly accountLabel: string; readonly accountInitials?: string; readonly accountLoginId?: string; readonly accountEmail?: string; readonly accountSecondaryLabel?: string; readonly transactionContext?: import("./client").ShellTransactionContext; readonly workContextControl?: ReactNode; readonly navigation: DerivedShellNavigation; readonly experienceState?: "ready" | "context_not_ready"; readonly contexts?: readonly import("./client").ShellContextOption[]; readonly quickAccess?: import("./quick-access").ShellQuickAccessDataSource; readonly activity?: import("./activity-center").ShellActivityDataSource; readonly children: ReactNode; }
const DEFAULT_LOCALIZATION = createEffectiveLocalization({ uiLocale: "en", formatLocale: "en-US" });
export function PlatformShell({localization=DEFAULT_LOCALIZATION,applicationName,tenantId,principalId,accountLabel,atlasProactiveBriefsEnabled=false,...props}: PlatformShellProps) { return <IntlProvider localization={localization} messages={shellMessages(localization.catalogLocale)} fallbackMessages={shellEnglishMessages}><AtlasAnswerProvider key={`${applicationName}:${tenantId}:${principalId}`} options={{proactiveBriefsEnabled:applicationName.toLowerCase()==="neon" && atlasProactiveBriefsEnabled,locale:localization.uiLocale,scopeKey:`${applicationName}:${tenantId}:${principalId}`}}><ShellPersonalizationScopeProvider plane={applicationName} tenantId={tenantId} principalId={principalId}><ShellHomeIdentityProvider displayName={accountLabel} timeZone={localization.timeZone}><ShellChrome principalId={principalId} currentLocale={localization.catalogLocale} applicationName={applicationName} tenantId={tenantId} accountLabel={accountLabel} {...props} /></ShellHomeIdentityProvider></ShellPersonalizationScopeProvider></AtlasAnswerProvider></IntlProvider>; }

export {ShellRouteProvider,useEntityBreadcrumbBinding} from "./route-state";
export { EntityPageLayout, useRecordPage } from "./entity-page-layout";

export { useRecordBreadcrumb } from "./route-state";

export { useRecordFooterSources } from "./record-footer";

export { useAtlasBusinessContextPublisher, type AtlasBusinessContextInput } from "@athyper/platform-ai-agent-ui";

export { ManagementWorkspace, ManagementNavigation, ManagementToolbar, type ManagementNavigationItem } from "./management-workspace";

export * from "./task-header";

export { PageWorkspace, PageLayout, type PageWorkspaceProps, type PageLayoutProps } from "./page-workspace";
export { PageNavigation, useDeepLinkedTabState, type PageNavigationTabItem, type PageNavigationTabsProps, type DeepLinkedTabStateOptions } from "./page-navigation";
export { PageResourceBoundary, type PageResourceStatus, type PageResourceBoundaryProps } from "./page-resource-boundary";

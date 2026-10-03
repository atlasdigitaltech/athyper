"use client";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { changeLocale } from "@athyper/platform-shell-app-foundation";
import { planeDiagnostic } from "@athyper/platform-shell";

import { PlatformShell, deriveShellNavigation, type NavigationDiagnostic, type PlatformShellProps, type ShellExperienceInput } from "@athyper/platform-shell";
import { updatePrincipalLocaleOperation } from "@athyper/platform-api-client";
import { ActivityCenterDataProvider, useActivityCenterDataSource } from "@athyper/platform-shell-activity-center-data";
import { useApiClient } from "@athyper/platform-shell-app-foundation";
import { useMemo, type ReactNode } from "react";
import { studioRoutes } from "./navigation";
export { studioRoutes } from "./navigation";
type StudioBootstrap = ShellExperienceInput & { readonly tenantId: string; readonly localization?: PlatformShellProps["localization"];readonly localePolicy?:PlatformShellProps["localePolicy"]; readonly identity?: Readonly<{ displayName: string; secondaryLabel?: string; initials?: string }>; readonly tenant?: Readonly<{ code: string; displayName: string; countryCode?: string; logoAssetRef?: string }> };
export function StudioShell({ bootstrap, principalId, contexts, initialCollapsed, children, onNavigationDiagnostic }: { readonly bootstrap: StudioBootstrap; readonly principalId: string; readonly contexts?:PlatformShellProps["contexts"]; readonly initialCollapsed?: boolean; readonly children: ReactNode; readonly onNavigationDiagnostic?: (event: NavigationDiagnostic) => void }) { const intl=useEntityI18n(bootstrap.localization); const client=useApiClient(),activity=useActivityCenterDataSource({client,locale:bootstrap.localization?.uiLocale}); const diagnostic=useMemo(()=>onNavigationDiagnostic??planeDiagnostic("studio"),[onNavigationDiagnostic]); const navigation=useMemo(()=>deriveShellNavigation(studioRoutes,bootstrap,diagnostic),[bootstrap,diagnostic]); return <PlatformShell localization={bootstrap.localization} localePolicy={bootstrap.localePolicy} onLocaleChange={(locale)=>changeLocale(client,locale)} activity={activity} applicationName="Studio" planeDescriptor="Business Technology Platform" planeIconSrc="/brand/studio/app-icon.png" planeWordmarkSrc="/brand/studio/identity-lockup.svg" persistentDesktopBrand initialCollapsed={initialCollapsed} tenantId={bootstrap.tenantId} principalId={principalId} tenantLabel={bootstrap.tenant?.displayName ?? bootstrap.tenantId} tenantSecondaryLabel={bootstrap.tenant?.code.toUpperCase()} tenantCountryCode={bootstrap.tenant?.countryCode} tenantLogoAssetRef={bootstrap.tenant?.logoAssetRef} contextLabel={intl.message("entity.context.label")} showOrganizationContext contexts={contexts} accountLabel={bootstrap.identity?.displayName ?? principalId} accountInitials={bootstrap.identity?.initials} accountLoginId={bootstrap.identity?.secondaryLabel} accountEmail={bootstrap.identity?.secondaryLabel?.includes("@")?bootstrap.identity.secondaryLabel:undefined} profileHref="/app/entity/principal/me" navigation={navigation}><ActivityCenterDataProvider value={activity}>{children}</ActivityCenterDataProvider></PlatformShell>; }


export { AtlasLearningInboxWorkspace } from "./atlas-learning-inbox";

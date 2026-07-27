"use client";

import {
  ArrowLeftRight,
  LogOut,
  Settings,
  UserRound,
} from "lucide-react";
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@athyper/ui/primitives";
import type {
  ActiveOrg,
  ActiveSessionStatus,
  ActiveUser,
  OrgOption,
} from "@athyper/shell-runtime";
import type { PlaneKey } from "@athyper/session-plane";

interface AccountContext {
  eyebrow: string;
  primary: string;
  secondary?: string;
  identifier?: string;
  accountType?: string;
  switchLabel: string;
}

export interface AccountMenuProps {
  plane: PlaneKey;
  user: ActiveUser | null;
  organization: ActiveOrg | null;
  sessionStatus: ActiveSessionStatus;
  organizations: readonly OrgOption[];
  onNavigate: (href: string) => void;
  onSwitchContext: () => void;
  onLogout: () => void;
  settingsActive: boolean;
}

export function AccountMenu({
  plane,
  user,
  organization,
  sessionStatus,
  organizations,
  onNavigate,
  onSwitchContext,
  onLogout,
  settingsActive,
}: AccountMenuProps) {
  const displayName = user?.displayName ?? "Account";
  const initials = user?.initials ?? "?";
  const context = accountContextFor(plane, organization);
  const activeOrganization = organizations.find((candidate) => candidate.isActive);
  const canSwitchContext = organizations.length > 1 || (activeOrganization?.workbenches.length ?? 0) > 1;
  const showsSessionStatus = (sessionStatus.mfaRequired && sessionStatus.mfaVerified) || sessionStatus.supportMode;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${displayName} account menu`}
          aria-haspopup="menu"
          aria-current={settingsActive ? "page" : undefined}
          className="flex size-10 items-center justify-center rounded-full outline-none transition-shadow hover:ring-2 hover:ring-border focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:ring-2 data-[state=open]:ring-border"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-foreground text-xs font-semibold uppercase text-background">
            {initials}
          </span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-1rem)]">
        <DropdownMenuLabel className="p-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold uppercase text-background">
              {initials}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-foreground">{displayName}</span>
              {user?.email ? (
                <span className="block truncate text-xs font-normal text-muted-foreground" title={user.email}>{user.email}</span>
              ) : null}
            </span>
          </div>
        </DropdownMenuLabel>

        {context ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="space-y-1 px-3 py-2">
              <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">{context.eyebrow}</span>
              <span className="block truncate text-sm font-medium text-foreground" title={context.primary}>{context.primary}</span>
              {context.secondary ? (
                <span className="block truncate text-xs font-normal text-muted-foreground" title={context.secondary}>{context.secondary}</span>
              ) : null}
              {context.identifier ? (
                <span className="block truncate font-mono text-xs font-normal text-muted-foreground" title={context.identifier}>{context.identifier}</span>
              ) : null}
              {context.accountType ? <Badge variant="muted" className="mt-1 w-fit">{context.accountType}</Badge> : null}
            </DropdownMenuLabel>
          </>
        ) : null}

        {showsSessionStatus ? (
          <>
            <DropdownMenuSeparator />
            <div className="flex flex-wrap gap-1 px-3 py-2">
              {sessionStatus.mfaRequired && sessionStatus.mfaVerified ? <Badge variant="success">MFA verified</Badge> : null}
              {sessionStatus.supportMode ? <Badge variant="warning">Support context</Badge> : null}
            </div>
          </>
        ) : null}

        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onNavigate("/settings/personal/profile")}>
          <UserRound className="size-4" aria-hidden />
          My profile
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onNavigate("/settings")}>
          <Settings className="size-4" aria-hidden />
          Settings
        </DropdownMenuItem>
        {canSwitchContext && context ? (
          <DropdownMenuItem onSelect={onSwitchContext}>
            <ArrowLeftRight className="size-4" aria-hidden />
            {context.switchLabel}
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:bg-destructive/10 focus:text-destructive" onSelect={onLogout}>
          <LogOut className="size-4" aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function accountContextFor(plane: PlaneKey, organization: ActiveOrg | null): AccountContext | null {
  if (!organization) return null;

  if (plane === "neon") {
    return {
      eyebrow: "Signed in to",
      primary: organization.legalEntityName,
      secondary: organization.tenantName ? `Tenant: ${organization.tenantName}` : undefined,
      identifier: organization.legalEntityCode,
      switchLabel: "Switch legal entity",
    };
  }

  if (plane === "mesh") {
    const accountType = meshAccountType(organization.networkAccountRole);
    return {
      eyebrow: accountType ? `${accountType} account` : "Mesh account",
      primary: organization.networkAccountName ?? organization.orgName,
      secondary: organization.tenantName ? `Tenant: ${organization.tenantName}` : undefined,
      identifier: organization.networkAccountCode,
      accountType,
      switchLabel: "Switch account",
    };
  }

  return {
    eyebrow: "Admin account",
    primary: organization.tenantName,
    identifier: organization.tenantCode,
    accountType: "Administrator",
    switchLabel: "Switch tenant",
  };
}

function meshAccountType(role: string | undefined): "Buyer" | "Supplier" | "Buyer & Supplier" | undefined {
  const normalized = role?.trim().toLowerCase();
  if (normalized === "buyer" || normalized === "user") return "Buyer";
  if (["supplier", "partner", "carrier", "broker", "service_provider"].includes(normalized ?? "")) return "Supplier";
  if (normalized === "both") return "Buyer & Supplier";
  return undefined;
}

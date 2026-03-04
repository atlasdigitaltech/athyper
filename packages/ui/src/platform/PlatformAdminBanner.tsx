"use client";

interface PlatformAdminBannerProps {
  selectedTenantId: string | null;
  platformRoles: string[];
  onSwitchTenant?: () => void;
}

/**
 * Persistent banner displayed at the top of the page when a platform admin
 * is logged in. Shows the current tenant context and provides a switch button.
 *
 * Visual design: amber/orange background to distinguish from regular admin views.
 */
export function PlatformAdminBanner({
  selectedTenantId,
  platformRoles,
  onSwitchTenant,
}: PlatformAdminBannerProps) {
  const roleLabel =
    platformRoles.length > 0
      ? platformRoles[0].replace(/_/g, " ")
      : "Platform Admin";

  return (
    <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-between text-sm">
      <div className="flex items-center gap-3">
        <span className="font-semibold">{roleLabel}</span>
        <span className="opacity-75">|</span>
        <span>
          {selectedTenantId
            ? `Viewing tenant: ${selectedTenantId}`
            : "No tenant selected"}
        </span>
        <span className="opacity-75">|</span>
        <span className="text-amber-100">Read-only access</span>
      </div>
      {onSwitchTenant && (
        <button
          onClick={onSwitchTenant}
          className="px-3 py-1 text-xs bg-amber-600 hover:bg-amber-700 rounded border border-amber-400"
        >
          Switch Tenant
        </button>
      )}
    </div>
  );
}

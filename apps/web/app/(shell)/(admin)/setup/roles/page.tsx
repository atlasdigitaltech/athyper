"use client";

/**
 * Roles Setup — /setup/roles
 *
 * Read-only role browser. Roles are system-defined and linked to personas;
 * they are assigned to groups via the Groups setup page.
 *
 * Groups by persona_code, shows role code + name in each card.
 * Links to /setup/groups to manage actual assignments.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Shield, Users } from "lucide-react";
import Link from "next/link";
import { PageFrame } from "@athyper/ui/layout";
import { EmptyState } from "@athyper/ui/composites";
import { Button, Badge, Card, CardContent, CardHeader, CardTitle, Skeleton } from "@athyper/ui/primitives";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Role {
  id: string;
  code: string;
  name: string;
  persona_code: string | null;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RolesSetupPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ items: Role[] }>({
    queryKey: ["iam-roles-setup"],
    queryFn: async () => {
      const res = await fetch("/api/iam/roles");
      return res.ok ? res.json() : { items: [] };
    },
    staleTime: 300_000,
  });

  const roles = data?.items ?? [];

  // Group by persona_code (null → "Platform / Cross-persona")
  const grouped = roles.reduce<Record<string, Role[]>>((acc, r) => {
    const key = r.persona_code ?? "__platform__";
    (acc[key] ??= []).push(r);
    return acc;
  }, {});

  const groupKeys = Object.keys(grouped).sort((a, b) => {
    if (a === "__platform__") return 1;
    if (b === "__platform__") return -1;
    return a.localeCompare(b);
  });

  function groupLabel(key: string): string {
    return key === "__platform__" ? "Platform / Cross-persona" : key;
  }

  return (
    <PageFrame
      title="Roles"
      description="System-defined roles linked to personas. Assign roles to groups on the Groups page."
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ["iam-roles-setup"] })}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Link href="/setup/groups">
            <Button size="sm" variant="outline">
              <Users className="mr-1.5 h-3.5 w-3.5" />
              Manage Assignments
            </Button>
          </Link>
        </div>
      }
    >
      {/* Info banner */}
      <div className="mb-5 rounded-md border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        Roles are system-defined and scoped to a persona. To assign a role to users,
        add the role to a group on the{" "}
        <Link href="/setup/groups" className="text-primary underline-offset-2 hover:underline">
          Groups page
        </Link>
        {" "}with the appropriate visibility and assignment scope.
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : roles.length === 0 ? (
        <EmptyState
          icon={<Shield className="h-10 w-10 text-muted-foreground/30" />}
          title="No roles found."
          className="py-20"
        />
      ) : (
        <div className="space-y-6">
          {groupKeys.map((groupKey) => (
            <div key={groupKey}>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {groupLabel(groupKey)}
                </h3>
                <Badge variant="outline" className="text-[10px]">
                  {grouped[groupKey]!.length} role{grouped[groupKey]!.length !== 1 ? "s" : ""}
                </Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {grouped[groupKey]!.map((role) => (
                  <Card key={role.id}>
                    <CardHeader className="pb-1 pt-3 px-4">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-sm font-medium leading-tight">{role.name}</CardTitle>
                        <Shield className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 mt-0.5" />
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                      <p className="font-mono text-[11px] text-muted-foreground">{role.code}</p>
                      {role.persona_code && (
                        <Badge variant="muted" className="mt-2 text-[9px]">{role.persona_code}</Badge>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageFrame>
  );
}

"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  BadgePlus,
  BriefcaseBusiness,
  Building2,
  ChevronRight,
  CirclePlus,
  ClipboardList,
  FilePlus2,
  Handshake,
  Landmark,
  PackagePlus,
  ReceiptText,
  UserPlus,
  UserRoundPlus,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { Button } from "@athyper/ui/primitives";
import { appEntityListHref, appEntityNewHref } from "@athyper/runtime-shared/core";
import type { EntityIntakeMode } from "@athyper/api-contracts/metadata";
import { normalizeModes } from "./normalizeModes";

export interface EntityIntakeLauncherProps {
  entityCode: string;
  title: string;
  description?: string;
  modes?: EntityIntakeMode[];
  fallbackModes?: EntityIntakeMode[];
  baseNewHref?: string;
  listHref?: string;
  listLabel?: string;
}

const MODE_ICONS: Record<string, LucideIcon> = {
  "badge-plus": BadgePlus,
  "briefcase-business": BriefcaseBusiness,
  "building-2": Building2,
  building: Building2,
  "circle-plus": CirclePlus,
  "clipboard-list": ClipboardList,
  "file-plus-2": FilePlus2,
  handshake: Handshake,
  landmark: Landmark,
  "package-plus": PackagePlus,
  "receipt-text": ReceiptText,
  "user-plus": UserPlus,
  "user-round-plus": UserRoundPlus,
  "users-round": UsersRound,
};

export function EntityIntakeLauncher({
  entityCode,
  title,
  description,
  modes,
  fallbackModes,
  baseNewHref,
  listHref,
  listLabel,
}: EntityIntakeLauncherProps) {
  const router = useRouter();
  const normalizedModes = useMemo(
    () => normalizeModes(modes, fallbackModes),
    [modes, fallbackModes],
  );
  const newHref = baseNewHref ?? appEntityNewHref(entityCode);
  const resolvedListHref = listHref ?? appEntityListHref(entityCode);
  const resolvedListLabel = listLabel ?? `View ${title}`;

  return (
    <PageFrame title={title} description={description}>
      {normalizedModes.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-3">
          {normalizedModes.map((mode) => {
            const Icon = MODE_ICONS[mode.icon ?? ""] ?? Building2;
            const href = mode.href ?? `${newHref}?mode=${encodeURIComponent(mode.code)}`;
            return (
              <button
                key={mode.code}
                type="button"
                onClick={() => router.push(href)}
                className="group flex min-h-40 flex-col justify-between rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-accent"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="rounded-md border border-border bg-background p-2">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{mode.label}</p>
                    {mode.description && (
                      <p className="mt-1 text-xs text-muted-foreground">{mode.description}</p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card px-4 py-5 text-sm text-muted-foreground">
          No intake modes are configured for this entity.
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => router.push(resolvedListHref)}>
          <Building2 className="mr-1.5 h-3.5 w-3.5" />
          {resolvedListLabel}
        </Button>
      </div>
    </PageFrame>
  );
}

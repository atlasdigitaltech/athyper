"use client";

import {
  Archive,
  Clock,
  Cog,
  MoreVertical,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";

import { ActivityDrawer } from "./ActivityDrawer";

import type { EntitySummary } from "@/lib/schema-manager/types";

import { BackLink } from "@/components/mesh/shared/BackLink";
import { KindBadge } from "@/components/mesh/shared/KindBadge";
import { VersionBadge } from "@/components/mesh/shared/VersionBadge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { STATUS_BANNER } from "@/lib/semantic-colors";
import { cn } from "@/lib/utils";

// ─── Version Status Banner ────────────────────────────────────

const BANNER_MESSAGES: Record<string, string> = {
  draft: "Draft — changes are not live until published",
  published:
    "Published — this version is read-only. Create a new version to make changes.",
  archived: "Archived — this version is deprecated and read-only",
};

function VersionStatusBanner({ status }: { status: string }) {
  const style = STATUS_BANNER[status];
  const message = BANNER_MESSAGES[status];
  if (!style || !message) return null;
  return (
    <div className={cn("rounded-md border px-3 py-1.5 text-xs", style)}>
      {message}
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────

interface EntityDetailHeaderProps {
  entity: EntitySummary | null;
  loading: boolean;
  backHref: string;
}

export function EntityDetailHeader({
  entity,
  loading,
  backHref,
}: EntityDetailHeaderProps) {
  const [activityOpen, setActivityOpen] = useState(false);

  if (loading || !entity) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-64" />
      </div>
    );
  }

  const version = entity.currentVersion;

  return (
    <div className="space-y-2">
      <BackLink href={backHref} label="Back to Schemas" />

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-xl font-semibold tracking-tight truncate">
            {entity.name}
          </h2>
          <KindBadge kind={entity.kind} />
          {version && (
            <VersionBadge version={version.versionNo} status={version.status} />
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActivityOpen(true)}
          >
            <Clock className="mr-1.5 size-3.5" />
            Activity
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <Plus className="mr-2 size-4" />
                New Version
              </DropdownMenuItem>
              {version?.status === "draft" && (
                <DropdownMenuItem>
                  <Play className="mr-2 size-4" />
                  Publish Version
                </DropdownMenuItem>
              )}
              {version?.status === "published" && (
                <DropdownMenuItem>
                  <Archive className="mr-2 size-4" />
                  Deprecate
                </DropdownMenuItem>
              )}
              <DropdownMenuItem>
                <Cog className="mr-2 size-4" />
                Recompile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive">
                <Trash2 className="mr-2 size-4" />
                Delete Entity
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {version && <VersionStatusBanner status={version.status} />}

      <ActivityDrawer
        open={activityOpen}
        onOpenChange={setActivityOpen}
        entityName={entity.name}
      />
    </div>
  );
}

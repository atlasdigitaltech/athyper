"use client";

/**
 * Subroute capability guard utilities.
 *
 * Prevents users from landing on a disabled subroute by checking
 * EntityCapabilities derived from the compiled entity descriptor.
 *
 * When the entity is already in the React Query cache (e.g., user navigated
 * from the detail page), the guard resolves synchronously — no loading flash.
 * On cold direct-URL navigation the query fires and GuardSkeleton is shown
 * until the descriptor arrives.
 */

import { useRouter } from "next/navigation";
import { ArrowLeft, ShieldOff } from "lucide-react";
import { Button, Skeleton } from "@athyper/ui/primitives";
import { PageFrame } from "@athyper/ui/layout";
import { useCompiledEntity } from "@athyper/query";
import { resolveCapabilities, type EntityCapabilities } from "./entity-capabilities";

// ── Types ──────────────────────────────────────────────────────────────────────

/** Keys of EntityCapabilities that carry a boolean value. */
type BooleanCap = {
  [K in keyof EntityCapabilities]: EntityCapabilities[K] extends boolean ? K : never;
}[keyof EntityCapabilities];

// ── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Guards a client subroute page against entities that don't support the
 * given capability.
 *
 * Usage:
 *   const { guardLoading, denied } = useSubrouteGuard(entity, "hasVersions");
 *   if (guardLoading) return <GuardSkeleton />;
 *   if (denied)       return <FeatureUnavailablePage entityCode={entity} entityId={id} />;
 *
 * @param entityCode  URL segment, e.g. "purchase_invoice"
 * @param cap         Boolean capability key from EntityCapabilities
 */
export function useSubrouteGuard(
  entityCode: string,
  cap: BooleanCap,
): { guardLoading: boolean; denied: boolean } {
  const { data: meta, isLoading } = useCompiledEntity(entityCode);
  if (isLoading || !meta) return { guardLoading: true, denied: false };
  return { guardLoading: false, denied: !resolveCapabilities(meta)[cap] };
}

// ── Shared guard UI ────────────────────────────────────────────────────────────

/** Skeleton shown while the entity descriptor is being fetched on cold load. */
export function GuardSkeleton() {
  return (
    <div className="space-y-4 p-6 pt-8">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-28 w-full" />
    </div>
  );
}

/**
 * Full-page "feature not available" state rendered when the capability guard
 * denies access. Provides a back-link to the record detail page (or list page
 * when entityId is absent).
 */
export function FeatureUnavailablePage({
  entityCode,
  entityId,
}: {
  entityCode: string;
  entityId?: string;
}) {
  const router = useRouter();
  const dest = entityId
    ? `/app/${encodeURIComponent(entityCode)}/${encodeURIComponent(entityId)}`
    : `/app/${encodeURIComponent(entityCode)}`;

  return (
    <PageFrame title="Not available" width="narrow">
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
        <ShieldOff className="h-10 w-10 text-muted-foreground/30" />
        <p className="text-sm font-medium">Feature not available</p>
        <p className="text-xs text-muted-foreground">
          This capability is not enabled for this entity type.
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-1"
          onClick={() => router.push(dest)}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Go back
        </Button>
      </div>
    </PageFrame>
  );
}

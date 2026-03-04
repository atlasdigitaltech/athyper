"use client";

import { Button, Card } from "@neon/ui";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";

import type { SectionDescriptor } from "@/lib/entity-page/types";
import type { SessionBootstrap } from "@/lib/session-bootstrap";

import { EntityForm } from "@/components/entity-page/EntityForm";
import { Skeleton } from "@/components/ui/skeleton";
import {
  entityNameToDisplayName,
  slugToEntityName,
} from "@/lib/entity-meta-utils";
import { useEntityFields } from "@/lib/use-entity-fields";

// ============================================================================
// CSRF helper
// ============================================================================

function getCsrfToken(): string {
  if (typeof window === "undefined") return "";
  const bootstrap = (window as any).__SESSION_BOOTSTRAP__ as
    | SessionBootstrap
    | undefined;
  return bootstrap?.csrfToken ?? "";
}

// ============================================================================
// Page Component
// ============================================================================

interface CreateRecordPageProps {
  params: Promise<{ entity: string }>;
}

export default function CreateRecordPage({ params }: CreateRecordPageProps) {
  const { entity } = use(params);
  const router = useRouter();

  const {
    fields,
    loading: fieldsLoading,
    error: fieldsError,
  } = useEntityFields(entity);

  // Try to fetch static descriptor for sections (optional — falls back to auto-generated)
  const [sections, setSections] = useState<SectionDescriptor[]>([]);
  const [sectionsLoaded, setSectionsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchSections() {
      try {
        const csrfToken = getCsrfToken();
        const headers: Record<string, string> = {};
        if (csrfToken) headers["x-csrf-token"] = csrfToken;

        const res = await fetch(
          `/api/entity-page/${encodeURIComponent(entity)}`,
          {
            headers,
            credentials: "same-origin",
          },
        );

        if (res.ok) {
          const body = (await res.json()) as {
            data?: { sections?: SectionDescriptor[] };
          };
          if (!cancelled && body.data?.sections) {
            setSections(body.data.sections);
          }
        }
      } catch {
        // Sections are optional — EntityForm will auto-generate
      } finally {
        if (!cancelled) setSectionsLoaded(true);
      }
    }

    fetchSections();
    return () => {
      cancelled = true;
    };
  }, [entity]);

  const displayName = entityNameToDisplayName(slugToEntityName(entity));

  const handleSuccess = useCallback(
    (savedRecord: Record<string, unknown>) => {
      const recordId = savedRecord.id as string | undefined;
      if (recordId) {
        router.push(
          `/app/${encodeURIComponent(entity)}/${encodeURIComponent(recordId)}`,
        );
      } else {
        router.push(`/app/${encodeURIComponent(entity)}/view/list`);
      }
    },
    [entity, router],
  );

  const handleCancel = useCallback(() => {
    router.push(`/app/${encodeURIComponent(entity)}/view/list`);
  }, [entity, router]);

  // ── Loading ──
  if (fieldsLoading || !sectionsLoaded) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-px w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // ── Error ──
  if (fieldsError || !fields) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-3 text-destructive">
          <AlertCircle className="size-5" />
          <div>
            <p className="font-medium">Cannot create {displayName}</p>
            <p className="text-sm text-muted-foreground">
              {fieldsError ?? "Field metadata not available for this entity."}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() =>
            router.push(`/app/${encodeURIComponent(entity)}/view/list`)
          }
        >
          <ArrowLeft className="size-4 mr-2" />
          Back to List
        </Button>
      </Card>
    );
  }

  // ── Form ──
  return (
    <EntityForm
      entityName={entity}
      viewMode="create"
      sections={sections}
      fieldMeta={fields}
      onSuccess={handleSuccess}
      onCancel={handleCancel}
    />
  );
}

"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  DocumentEditBootstrapClient as SharedDocumentEditBootstrapClient,
  RuntimeDocumentObjectPage,
  type RuntimeDocumentObjectPageProps,
  type RuntimeDocumentPlaneAdapter,
} from "@athyper/runtime-canvas";
import type { DocumentEditCoordinatorIdentity } from "@athyper/runtime-canvas/document-runtime";
import { csrfFetch } from "@/lib/bff-fetch";

type NeonDocumentObjectPageProps = Omit<RuntimeDocumentObjectPageProps, "adapter">;

export default function DocumentObjectPageClient(props: NeonDocumentObjectPageProps) {
  const adapter = useNeonDocumentAdapter();
  return <RuntimeDocumentObjectPage {...props} adapter={adapter} />;
}

export function DocumentEditBootstrapClient({
  entityCode,
  recordId,
  identity,
}: {
  entityCode: string;
  recordId: string;
  identity: DocumentEditCoordinatorIdentity;
}) {
  const adapter = useNeonDocumentAdapter();
  return (
    <SharedDocumentEditBootstrapClient
      entityCode={entityCode}
      recordId={recordId}
      identity={identity}
      adapter={adapter}
    />
  );
}

function useNeonDocumentAdapter(): RuntimeDocumentPlaneAdapter {
  const router = useRouter();
  return useMemo(() => ({
    plane: "neon",
    transport: csrfFetch,
    mutationMode: "full",
    workflowActions: true,
    attachments: true,
    comments: true,
    print: true,
    export: true,
    refresh: () => router.refresh(),
    replace: (href: string) => router.replace(href),
    resolveDeepLink: ({ entityCode, recordId, destination }) => {
      const base = `/app/${encodeURIComponent(entityCode)}`;
      if (destination === "list") return base;
      const detail = `${base}/${encodeURIComponent(recordId)}`;
      return destination === "edit" ? `${detail}/edit` : detail;
    },
  }), [router]);
}

"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  RuntimeDocumentObjectPage,
  type RuntimeDocumentObjectPageProps,
  type RuntimeDocumentPlaneAdapter,
} from "@athyper/runtime-canvas";
import { csrfFetch } from "@/lib/bff-fetch";

type MeshDocumentObjectPageProps = Omit<RuntimeDocumentObjectPageProps, "adapter">;

export default function MeshDocumentObjectPageClient(props: MeshDocumentObjectPageProps) {
  const router = useRouter();
  const permittedOperationKeys = useMemo(
    () => props.descriptor.operations
      .filter((operation) => operation.enabled && operation.permissionDecision !== "deny")
      .map((operation) => operation.key),
    [props.descriptor.operations],
  );
  const partnerSafeFieldNames = useMemo(
    () => props.descriptor.fields.map((field) => field.name),
    [props.descriptor.fields],
  );
  const adapter = useMemo<RuntimeDocumentPlaneAdapter>(() => ({
    plane: "mesh",
    transport: csrfFetch,
    mutationMode: "delegated-submit",
    permittedOperationKeys,
    partnerSafeFieldNames,
    workflowActions: true,
    attachments: true,
    comments: true,
    print: false,
    export: false,
    refresh: () => router.refresh(),
    replace: (href: string) => router.replace(href),
    resolveDeepLink: ({ entityCode, recordId, destination }) => {
      const base = `/app/${encodeURIComponent(entityCode)}`;
      return destination === "list"
        ? base
        : `${base}/${encodeURIComponent(recordId)}`;
    },
  }), [partnerSafeFieldNames, permittedOperationKeys, router]);

  return <RuntimeDocumentObjectPage {...props} adapter={adapter} />;
}

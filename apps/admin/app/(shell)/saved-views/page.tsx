"use client";

import { useRouter } from "next/navigation";
import { SavedViewsManager } from "@athyper/saved-views-ui";
import { PageFrame } from "@athyper/platform-surface-kit";
import { bffFetch } from "@/lib/bff-fetch";

export default function SavedViewsRoute() {
  const router = useRouter();
  return (
    <PageFrame eyebrow="Admin" title="Saved views" description="Open and govern reusable Admin list, job, registry, and audit configurations.">
      <SavedViewsManager plane="admin" fetcher={bffFetch} navigate={(href) => router.push(href)} />
    </PageFrame>
  );
}

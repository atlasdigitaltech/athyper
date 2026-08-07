"use client";

import { useRouter } from "next/navigation";
import { SavedViewsManager } from "@athyper/saved-views-ui";
import { PageFrame } from "@athyper/platform-surface-kit";
import { bffFetch } from "@/lib/bff-fetch";

export default function SavedViewsRoute() {
  const router = useRouter();
  return (
    <PageFrame eyebrow="Neon" title="Saved views" description="Open and manage reusable entity-list and operational-workbench configurations.">
      <SavedViewsManager plane="neon" fetcher={bffFetch} navigate={(href) => router.push(href)} />
    </PageFrame>
  );
}

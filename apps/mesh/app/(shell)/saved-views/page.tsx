"use client";

import { useRouter } from "next/navigation";
import { SavedViewsManager } from "@athyper/saved-views-ui";
import { PageFrame } from "@athyper/surface-kit";
import { bffFetch } from "@/lib/bff-fetch";

export default function SavedViewsRoute() {
  const router = useRouter();
  return (
    <PageFrame eyebrow="Mesh" title="Saved views" description="Open and manage supported connection and envelope list configurations.">
      <SavedViewsManager plane="mesh" fetcher={bffFetch} navigate={(href) => router.push(href)} />
    </PageFrame>
  );
}

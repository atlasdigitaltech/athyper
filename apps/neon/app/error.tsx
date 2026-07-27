"use client";

import { PlaneRouteError } from "@athyper/app-foundation/client";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return <PlaneRouteError error={error} reset={reset} />;
}

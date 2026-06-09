"use client";

import { useEffect } from "react";
import { runtimeListText } from "@athyper/app-neon/list/resources";

export default function EntityListError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[EntityListError]", error);
  }, [error]);

  return (
    <div className="flex min-h-80 flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-sm font-medium text-foreground">{runtimeListText.empty.recordsUnavailableTitle}</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {error.message ?? runtimeListText.system.unexpectedListLoadError}
      </p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex h-9 items-center rounded-md border bg-background px-4 text-sm font-medium text-foreground shadow-sm hover:bg-muted"
      >
        {runtimeListText.actions.tryAgain}
      </button>
    </div>
  );
}

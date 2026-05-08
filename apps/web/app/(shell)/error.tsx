"use client";

import { useEffect } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@athyper/ui/primitives";

export default function ShellError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[shell error]", error);
  }, [error]);

  return (
    <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full bg-destructive/10 p-4">
        <TriangleAlert className="h-8 w-8 text-destructive" />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-foreground">Something went wrong</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          {error.message || "An unexpected error occurred. Try refreshing or contact support if it persists."}
        </p>
        {error.digest && (
          <p className="font-mono text-doc-support text-muted-foreground/60">ref: {error.digest}</p>
        )}
      </div>
      <Button size="sm" variant="outline" onClick={reset}>
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
        Try again
      </Button>
    </div>
  );
}

"use client";
import { GlobalAppErrorBoundary } from "@athyper/platform-shell-app-foundation";
export default function GlobalError({ error, reset }: { readonly error: Error & { digest?: string }; readonly reset: () => void }) { return <GlobalAppErrorBoundary applicationName="Athyper Neon" error={error} reset={reset} />; }

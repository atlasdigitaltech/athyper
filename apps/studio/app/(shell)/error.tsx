"use client";
import { AppErrorBoundary } from "@athyper/platform-shell-app-foundation";
export default function ShellError({ error, reset }: { readonly error: Error & { digest?: string }; readonly reset: () => void }) { return <AppErrorBoundary applicationName="Athyper Studio" error={error} reset={reset} surface="content" homeHref="/" />; }

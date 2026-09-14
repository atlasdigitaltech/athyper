"use client";
import * as React from "react";
import { AppErrorBoundary } from "@athyper/platform-shell-app-foundation";
export default function ShellError({ error, retry }: { readonly error: Error & { digest?: string }; readonly retry?: () => void }) { return <AppErrorBoundary applicationName="Athyper Mesh" error={error} reset={retry ?? (() => window.location.reload())} surface="content" homeHref="/home" />; }

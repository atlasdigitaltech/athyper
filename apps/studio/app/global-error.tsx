"use client";
import * as React from "react";
import { GlobalAppErrorBoundary } from "@athyper/platform-shell-app-foundation";
export default function GlobalError({ error }: { readonly error: Error & { digest?: string } }) { return <GlobalAppErrorBoundary applicationName="Athyper Studio" error={error} reset={() => window.location.reload()} />; }
